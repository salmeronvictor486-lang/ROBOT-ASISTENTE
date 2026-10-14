//! Lo que está sonando (Spotify, Apple Music, YouTube en el navegador…) y sus controles.
//!
//! - Windows: el panel multimedia del sistema (GlobalSystemMediaTransportControls), que ven
//!   todas las apps que se anuncian en él (Spotify, Apple Music, Chrome, Edge, Firefox…).
//! - macOS: Spotify y Música por AppleScript (título, artista y portada); el resto (YouTube
//!   en el navegador) con las teclas multimedia del sistema.
//! - Linux: MPRIS por D-Bus (Spotify, Firefox, Chrome, Rhythmbox, VLC…).
//!
//! El volumen es el general del sistema. Las portadas viajan como `data:` en JPEG pequeño.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::island::lock;
use crate::state::AppState;

/// Lado de la portada que se manda a la isla.
const ART_SIDE: u32 = 256;

/// De dónde sale la portada.
#[derive(Debug, Clone, PartialEq)]
pub enum Art {
    /// Windows y Música de macOS la dan en bytes (en Linux no se usa).
    #[cfg_attr(target_os = "linux", allow(dead_code))]
    Bytes(Vec<u8>),
    /// http(s):// o file://
    Url(String),
}

/// Lo que devuelve cada sistema.
#[derive(Debug, Clone, Default)]
pub struct Track {
    pub app: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub playing: bool,
    pub art: Option<Art>,
}

/// Lo que ve la isla.
#[derive(Clone, Debug, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    /// App que suena ("Spotify", "Google Chrome"…).
    pub app: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub playing: bool,
    /// Portada como `data:image/jpeg;base64,…`.
    pub artwork: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MediaAction {
    PlayPause,
    Next,
    Previous,
}

/// Última portada convertida, para no repetir el trabajo en cada consulta.
static ART_CACHE: Mutex<Option<(String, Option<String>)>> = Mutex::new(None);

/// Nombre legible de la app a partir de su identificador.
pub fn friendly_app(id: &str) -> String {
    let lower = id.to_lowercase();
    let known = [
        ("spotify", "Spotify"),
        ("applemusic", "Apple Music"),
        ("com.apple.music", "Música"),
        ("itunes", "iTunes"),
        ("chrome", "Google Chrome"),
        ("msedge", "Microsoft Edge"),
        ("firefox", "Firefox"),
        ("308046b0af4a39cb", "Firefox"),
        ("brave", "Brave"),
        ("opera", "Opera"),
        ("vivaldi", "Vivaldi"),
        ("vlc", "VLC"),
        ("zunemusic", "Reproductor multimedia"),
        ("rhythmbox", "Rhythmbox"),
        ("youtube", "YouTube"),
    ];
    for (needle, name) in known {
        if lower.contains(needle) {
            return name.to_string();
        }
    }
    // "org.mpris.MediaPlayer2.foo.instance123" o "Foo.exe" → "Foo".
    let base = id.rsplit(['.', '\\', '/']).find(|p| !p.is_empty() && !p.starts_with("instance") && *p != "exe").unwrap_or(id);
    let mut chars = base.chars();
    chars.next().map(|c| c.to_uppercase().chain(chars).collect()).unwrap_or_default()
}

/// Bytes de imagen → JPEG pequeño en `data:`.
fn art_to_data_url(bytes: &[u8]) -> Option<String> {
    let image = image::load_from_memory(bytes).ok()?.to_rgba8();
    let (b64, _, _) = crate::capture::encode_jpeg(&image, ART_SIDE, 85).ok()?;
    Some(format!("data:image/jpeg;base64,{b64}"))
}

async fn load_art(http: &reqwest::Client, art: Art) -> Option<String> {
    let bytes = match art {
        Art::Bytes(bytes) => bytes,
        Art::Url(url) if url.starts_with("http://") || url.starts_with("https://") => {
            let response = http.get(&url).timeout(std::time::Duration::from_secs(8)).send().await.ok()?;
            response.error_for_status().ok()?.bytes().await.ok()?.to_vec()
        }
        Art::Url(url) => {
            let path = url.strip_prefix("file://").unwrap_or(&url);
            let path = percent_decode(path);
            tauri::async_runtime::spawn_blocking(move || std::fs::read(path).ok()).await.ok()??
        }
    };
    tauri::async_runtime::spawn_blocking(move || art_to_data_url(&bytes)).await.ok()?
}

/// "%20" → " " (las rutas file:// de MPRIS vienen codificadas).
fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
            if let Some(byte) = hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// ¿Qué suena ahora? `None` si nada.
#[tauri::command]
pub async fn media_now(state: State<'_, AppState>) -> AppResult<Option<NowPlaying>> {
    let track = tauri::async_runtime::spawn_blocking(platform::now)
        .await
        .map_err(|e| AppError::Media(e.to_string()))?;
    let Some(track) = track.filter(|t| !t.title.is_empty()) else {
        return Ok(None);
    };
    let key = format!("{}\u{1f}{}\u{1f}{}", track.app, track.title, track.artist);
    let cached = lock(&ART_CACHE).as_ref().filter(|(k, _)| *k == key).map(|(_, art)| art.clone());
    let artwork = match cached {
        Some(art) => art,
        None => {
            let art = match track.art.clone() {
                Some(art) => load_art(&state.http, art).await,
                None => None,
            };
            *lock(&ART_CACHE) = Some((key, art.clone()));
            art
        }
    };
    Ok(Some(NowPlaying {
        app: track.app,
        title: track.title,
        artist: track.artist,
        album: track.album,
        playing: track.playing,
        artwork,
    }))
}

/// Pausa/reanuda, siguiente o anterior.
#[tauri::command]
pub async fn media_control(action: MediaAction) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || platform::control(action))
        .await
        .map_err(|e| AppError::Media(e.to_string()))?
}

/// Volumen general del sistema (0 a 1), si se puede leer.
#[tauri::command]
pub async fn media_volume() -> AppResult<Option<f32>> {
    tauri::async_runtime::spawn_blocking(platform::volume).await.map_err(|e| AppError::Media(e.to_string()))
}

#[tauri::command]
pub async fn media_set_volume(level: f32) -> AppResult<()> {
    let level = if level.is_finite() { level.clamp(0.0, 1.0) } else { 0.5 };
    tauri::async_runtime::spawn_blocking(move || platform::set_volume(level))
        .await
        .map_err(|e| AppError::Media(e.to_string()))?
}

// --- Windows ------------------------------------------------------------------------------

#[cfg(target_os = "windows")]
mod platform {
    use super::{friendly_app, Art, MediaAction, Track};
    use crate::error::{AppError, AppResult};
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession as Session,
        GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
    };
    use windows::Storage::Streams::DataReader;
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};

    fn init() {
        // SAFETY: prepara COM/WinRT en este hilo; si ya lo estaba, el aviso se ignora.
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
    }

    fn session() -> Option<Session> {
        init();
        let manager = Manager::RequestAsync().ok()?.join().ok()?;
        manager.GetCurrentSession().ok()
    }

    fn thumbnail(session: &Session) -> Option<Vec<u8>> {
        let props = session.TryGetMediaPropertiesAsync().ok()?.join().ok()?;
        let stream = props.Thumbnail().ok()?.OpenReadAsync().ok()?.join().ok()?;
        let size = u32::try_from(stream.Size().ok()?).ok()?;
        if size == 0 || size > 8 * 1024 * 1024 {
            return None;
        }
        let reader = DataReader::CreateDataReader(&stream.GetInputStreamAt(0).ok()?).ok()?;
        reader.LoadAsync(size).ok()?.join().ok()?;
        let mut bytes = vec![0u8; size as usize];
        reader.ReadBytes(&mut bytes).ok()?;
        Some(bytes)
    }

    pub fn now() -> Option<Track> {
        let session = session()?;
        let props = session.TryGetMediaPropertiesAsync().ok()?.join().ok()?;
        let playing = session
            .GetPlaybackInfo()
            .and_then(|info| info.PlaybackStatus())
            .is_ok_and(|status| status == Status::Playing);
        let app = session.SourceAppUserModelId().map(|id| friendly_app(&id.to_string())).unwrap_or_default();
        Some(Track {
            app,
            title: props.Title().map(|s| s.to_string()).unwrap_or_default(),
            artist: props.Artist().map(|s| s.to_string()).unwrap_or_default(),
            album: props.AlbumTitle().map(|s| s.to_string()).unwrap_or_default(),
            playing,
            art: thumbnail(&session).map(Art::Bytes),
        })
    }

    pub fn control(action: MediaAction) -> AppResult<()> {
        let session = session().ok_or(AppError::NothingPlaying)?;
        let operation = match action {
            MediaAction::PlayPause => session.TryTogglePlayPauseAsync(),
            MediaAction::Next => session.TrySkipNextAsync(),
            MediaAction::Previous => session.TrySkipPreviousAsync(),
        };
        operation.and_then(|op| op.join()).map_err(|e| AppError::Media(e.message()))?;
        Ok(())
    }

    fn endpoint() -> Option<IAudioEndpointVolume> {
        init();
        // SAFETY: llamadas COM normales al dispositivo de sonido por defecto.
        unsafe {
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
            let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole).ok()?;
            device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None).ok()
        }
    }

    pub fn volume() -> Option<f32> {
        // SAFETY: lectura del volumen del dispositivo obtenido arriba.
        endpoint().and_then(|v| unsafe { v.GetMasterVolumeLevelScalar() }.ok())
    }

    pub fn set_volume(level: f32) -> AppResult<()> {
        let endpoint = endpoint().ok_or_else(|| AppError::Media("no hay salida de sonido".into()))?;
        // SAFETY: cambia el volumen general; el contexto nulo vale.
        unsafe { endpoint.SetMasterVolumeLevelScalar(level, std::ptr::null()) }
            .map_err(|e| AppError::Media(e.message()))
    }
}

// --- macOS ----------------------------------------------------------------------------------

#[cfg(target_os = "macos")]
mod platform {
    use super::{Art, MediaAction, Track};
    use crate::error::{AppError, AppResult};
    use std::process::Command;

    fn osascript(script: &str) -> Option<String> {
        let mut cmd = Command::new("osascript");
        cmd.arg("-e").arg(script);
        crate::convert::run_with_timeout(cmd, true)
    }

    fn running(app: &str) -> bool {
        osascript(&format!("application \"{app}\" is running")).as_deref() == Some("true")
    }

    /// Spotify o Música: lo que suena (o está en pausa) con su portada.
    fn from_app(app: &str, label: &str) -> Option<Track> {
        if !running(app) {
            return None;
        }
        let sep = "\u{1f}";
        let script = format!(
            r#"tell application "{app}"
if player state is stopped then return ""
set t to current track
return (player state as text) & "{sep}" & (name of t) & "{sep}" & (artist of t) & "{sep}" & (album of t)
end tell"#
        );
        let out = osascript(&script)?;
        let mut parts = out.split(sep);
        let state = parts.next()?.to_string();
        let title = parts.next()?.to_string();
        let artist = parts.next().unwrap_or_default().to_string();
        let album = parts.next().unwrap_or_default().to_string();
        let art = if app == "Spotify" {
            osascript(r#"tell application "Spotify" to return artwork url of current track"#)
                .filter(|u| u.starts_with("http"))
                .map(Art::Url)
        } else {
            music_artwork()
        };
        Some(Track { app: label.to_string(), title, artist, album, playing: state == "playing", art })
    }

    /// Música guarda la portada dentro: la escribimos en un temporal y la leemos.
    fn music_artwork() -> Option<Art> {
        let path = std::env::temp_dir().join("tico-music-artwork");
        let script = format!(
            r#"tell application "Music"
try
set d to raw data of artwork 1 of current track
on error
return "no"
end try
end tell
set f to open for access POSIX file "{}" with write permission
set eof f to 0
write d to f
close access f
return "ok""#,
            path.display()
        );
        (osascript(&script).as_deref() == Some("ok")).then(|| std::fs::read(&path).ok()).flatten().map(Art::Bytes)
    }

    pub fn now() -> Option<Track> {
        let spotify = from_app("Spotify", "Spotify");
        let music = from_app("Music", "Música");
        // Si suenan los dos, gana el que está reproduciendo.
        match (spotify, music) {
            (Some(s), Some(m)) => Some(if m.playing && !s.playing { m } else { s }),
            (s, m) => s.or(m),
        }
    }

    pub fn control(action: MediaAction) -> AppResult<()> {
        let command = match action {
            MediaAction::PlayPause => "playpause",
            MediaAction::Next => "next track",
            MediaAction::Previous => "previous track",
        };
        for app in ["Spotify", "Music"] {
            if running(app) && osascript(&format!("tell application \"{app}\" to {command}")).is_some() {
                return Ok(());
            }
        }
        // YouTube y el resto: las teclas multimedia del sistema.
        media_key(action);
        Ok(())
    }

    /// Pulsa una tecla multimedia (como las del teclado del Mac). Necesita el permiso de
    /// Accesibilidad; si no lo hay, macOS la ignora.
    fn media_key(action: MediaAction) {
        use objc2::runtime::AnyObject;
        use objc2::{class, msg_send};
        use objc2_foundation::NSPoint;

        /// `CGEventRef` con su codificación exacta (objc2 la comprueba en desarrollo).
        #[repr(C)]
        struct CgEvent {
            _private: [u8; 0],
        }
        // SAFETY: es un tipo opaco que solo se usa detrás de un puntero.
        unsafe impl objc2::encode::RefEncode for CgEvent {
            const ENCODING_REF: objc2::encode::Encoding =
                objc2::encode::Encoding::Pointer(&objc2::encode::Encoding::Struct("__CGEvent", &[]));
        }
        #[link(name = "CoreGraphics", kind = "framework")]
        extern "C" {
            fn CGEventPost(tap: u32, event: *mut CgEvent);
        }
        // NX_KEYTYPE_PLAY = 16, NEXT = 17, PREVIOUS = 18.
        let key: isize = match action {
            MediaAction::PlayPause => 16,
            MediaAction::Next => 17,
            MediaAction::Previous => 18,
        };
        for down in [true, false] {
            let flags: usize = if down { 0xa00 } else { 0xb00 };
            let data1: isize = (key << 16) | ((if down { 0xa } else { 0xb }) << 8);
            // SAFETY: NSEvent de tipo "definido por el sistema" (14), subtipo 8 = tecla
            // multimedia; el CGEvent que devuelve vive mientras viva el NSEvent.
            unsafe {
                let event: *mut AnyObject = msg_send![
                    class!(NSEvent),
                    otherEventWithType: 14usize,
                    location: NSPoint::new(0.0, 0.0),
                    modifierFlags: flags,
                    timestamp: 0.0f64,
                    windowNumber: 0isize,
                    context: std::ptr::null_mut::<AnyObject>(),
                    subtype: 8i16,
                    data1: data1,
                    data2: -1isize
                ];
                if event.is_null() {
                    continue;
                }
                let cg: *mut CgEvent = msg_send![event, CGEvent];
                if !cg.is_null() {
                    CGEventPost(0, cg);
                }
            }
        }
    }

    pub fn volume() -> Option<f32> {
        osascript("output volume of (get volume settings)")?.trim().parse::<f32>().ok().map(|v| v / 100.0)
    }

    pub fn set_volume(level: f32) -> AppResult<()> {
        let percent = (level * 100.0).round() as i32;
        osascript(&format!("set volume output volume {percent}"))
            .map(|_| ())
            .ok_or_else(|| AppError::Media("no se pudo cambiar el volumen".into()))
    }
}

// --- Linux -------------------------------------------------------------------------------------

#[cfg(target_os = "linux")]
mod platform {
    use super::{friendly_app, Art, MediaAction, Track};
    use crate::error::{AppError, AppResult};
    use mpris::{PlaybackStatus, Player, PlayerFinder};
    use std::process::Command;

    fn player() -> Option<Player> {
        PlayerFinder::new().ok()?.find_active().ok()
    }

    pub fn now() -> Option<Track> {
        let player = player()?;
        let meta = player.get_metadata().ok()?;
        let identity = player.identity().to_string();
        Some(Track {
            app: if identity.is_empty() { friendly_app(player.bus_name()) } else { identity },
            title: meta.title().unwrap_or_default().to_string(),
            artist: meta.artists().map(|a| a.join(", ")).unwrap_or_default(),
            album: meta.album_name().unwrap_or_default().to_string(),
            playing: player.get_playback_status().is_ok_and(|s| s == PlaybackStatus::Playing),
            art: meta.art_url().filter(|u| !u.is_empty()).map(|u| Art::Url(u.to_string())),
        })
    }

    pub fn control(action: MediaAction) -> AppResult<()> {
        let player = player().ok_or(AppError::NothingPlaying)?;
        let result = match action {
            MediaAction::PlayPause => player.play_pause(),
            MediaAction::Next => player.next(),
            MediaAction::Previous => player.previous(),
        };
        result.map_err(|e| AppError::Media(e.to_string()))
    }

    fn output(program: &str, args: &[&str]) -> Option<String> {
        let out = Command::new(program).args(args).output().ok()?;
        out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
    }

    /// PipeWire (`wpctl`) o PulseAudio (`pactl`).
    pub fn volume() -> Option<f32> {
        if let Some(text) = output("wpctl", &["get-volume", "@DEFAULT_AUDIO_SINK@"]) {
            // "Volume: 0.45" (o "Volume: 0.45 [MUTED]")
            return text.split_whitespace().nth(1)?.parse().ok();
        }
        let text = output("pactl", &["get-sink-volume", "@DEFAULT_SINK@"])?;
        let percent = text.split('/').nth(1)?.trim().trim_end_matches('%').trim().parse::<f32>().ok()?;
        Some(percent / 100.0)
    }

    pub fn set_volume(level: f32) -> AppResult<()> {
        let ok = output("wpctl", &["set-volume", "@DEFAULT_AUDIO_SINK@", &format!("{level:.2}")]).is_some()
            || output("pactl", &["set-sink-volume", "@DEFAULT_SINK@", &format!("{}%", (level * 100.0).round())])
                .is_some();
        if ok {
            Ok(())
        } else {
            Err(AppError::Media("no encuentro wpctl ni pactl".into()))
        }
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
mod platform {
    use super::{MediaAction, Track};
    use crate::error::{AppError, AppResult};
    pub fn now() -> Option<Track> {
        None
    }
    pub fn control(_action: MediaAction) -> AppResult<()> {
        Err(AppError::NothingPlaying)
    }
    pub fn volume() -> Option<f32> {
        None
    }
    pub fn set_volume(_level: f32) -> AppResult<()> {
        Err(AppError::NothingPlaying)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;

    #[test]
    fn app_names_are_friendly() {
        assert_eq!(friendly_app("Spotify.exe"), "Spotify");
        assert_eq!(friendly_app("Chrome"), "Google Chrome");
        assert_eq!(friendly_app("MSEdge"), "Microsoft Edge");
        assert_eq!(friendly_app("308046B0AF4A39CB"), "Firefox");
        assert_eq!(friendly_app("AppleInc.AppleMusicWin_nzyj5cx40ttqa!App"), "Apple Music");
        assert_eq!(friendly_app("org.mpris.MediaPlayer2.foobar.instance42"), "Foobar");
    }

    #[test]
    fn art_becomes_small_jpeg() {
        let img = image::RgbaImage::from_pixel(640, 640, image::Rgba([200, 30, 90, 255]));
        let mut png = std::io::Cursor::new(Vec::new());
        img.write_to(&mut png, image::ImageFormat::Png).unwrap();
        let url = art_to_data_url(png.get_ref()).unwrap();
        assert!(url.starts_with("data:image/jpeg;base64,"));
        let bytes = STANDARD.decode(url.trim_start_matches("data:image/jpeg;base64,")).unwrap();
        let back = image::load_from_memory(&bytes).unwrap();
        assert_eq!((back.width(), back.height()), (ART_SIDE, ART_SIDE));
        assert!(art_to_data_url(b"no es una imagen").is_none());
    }

    #[test]
    fn file_urls_are_decoded() {
        assert_eq!(percent_decode("/tmp/Mi%20canci%C3%B3n.jpg"), "/tmp/Mi canción.jpg");
        assert_eq!(percent_decode("/tmp/100%"), "/tmp/100%");
        assert_eq!(percent_decode("/tmp/%é%zz"), "/tmp/%é%zz");
    }
}
