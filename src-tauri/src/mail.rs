//! Enviar archivos por correo desde Tico.
//!
//! - Con tu cuenta (SMTP): Tico lo envía él solo. La contraseña (de aplicación) va en el
//!   llavero del sistema. Gmail, iCloud, Yahoo… se configuran solos a partir de la dirección.
//! - Sin cuenta configurada: se abre el borrador en tu app de correo (Outlook o Thunderbird en
//!   Windows, Mail en macOS) con los archivos ya adjuntos, para que pulses Enviar allí.

use std::path::{Path, PathBuf};
use std::time::Duration;

use lettre::message::header::ContentType;
use lettre::message::{Attachment, Mailbox, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Address, Message, SmtpTransport, Transport};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::island::lock;
use crate::secrets;
use crate::settings::{MailSecurity, MailSettings};
use crate::state::AppState;

/// Nombre de la contraseña del correo en el llavero.
const SECRET: &str = "mail";
/// Lo máximo que aceptan casi todos los servidores (Gmail: 25 MB).
const MAX_ATTACHMENTS: u64 = 24 * 1024 * 1024;

/// Servidor de un proveedor conocido: (servidor, puerto, cifrado, web para la contraseña de app).
pub struct Preset {
    pub host: &'static str,
    pub port: u16,
    pub security: MailSecurity,
    pub help: Option<&'static str>,
}

/// El servidor de tu proveedor según el dominio de la dirección.
pub fn preset_for(address: &str) -> Option<Preset> {
    let domain = address.rsplit_once('@')?.1.trim().to_lowercase();
    let starts = |prefixes: &[&str]| prefixes.iter().any(|p| domain == *p || domain.starts_with(&format!("{p}.")));
    let preset = |host, port, security, help| Some(Preset { host, port, security, help });
    if starts(&["gmail", "googlemail"]) {
        preset("smtp.gmail.com", 465, MailSecurity::Ssl, Some("https://myaccount.google.com/apppasswords"))
    } else if starts(&["outlook", "hotmail", "live", "msn"]) {
        preset("smtp-mail.outlook.com", 587, MailSecurity::Starttls, Some("https://account.live.com/proofs/AppPassword"))
    } else if starts(&["icloud", "me", "mac"]) {
        preset("smtp.mail.me.com", 587, MailSecurity::Starttls, Some("https://account.apple.com/account/manage"))
    } else if starts(&["yahoo", "ymail"]) {
        preset("smtp.mail.yahoo.com", 465, MailSecurity::Ssl, Some("https://login.yahoo.com/account/security"))
    } else if starts(&["gmx"]) {
        preset("mail.gmx.net", 587, MailSecurity::Starttls, None)
    } else if starts(&["zoho", "zohomail"]) {
        preset("smtp.zoho.eu", 465, MailSecurity::Ssl, None)
    } else {
        None
    }
}

/// Servidor, puerto y cifrado que se usan de verdad (lo escrito a mano manda).
fn server(mail: &MailSettings) -> AppResult<(String, u16, MailSecurity)> {
    if !mail.host.is_empty() {
        let port = if mail.port != 0 {
            mail.port
        } else if mail.security == MailSecurity::Ssl {
            465
        } else {
            587
        };
        return Ok((mail.host.clone(), port, mail.security));
    }
    let preset = preset_for(&mail.address).ok_or(AppError::MailSetup)?;
    Ok((preset.host.to_string(), preset.port, preset.security))
}

/// Separa "ana@x.com, luis@y.com; eva@z.com" en direcciones válidas.
pub fn parse_recipients(text: &str) -> AppResult<Vec<Address>> {
    let list: Vec<&str> = text.split([',', ';', '\n']).map(str::trim).filter(|s| !s.is_empty()).collect();
    if list.is_empty() {
        return Err(AppError::Mail("falta el destinatario".into()));
    }
    list.into_iter()
        .map(|a| {
            // Acepta también "Ana <ana@x.com>".
            let bare = a.rsplit_once('<').map_or(a, |(_, rest)| rest.trim_end_matches('>')).trim();
            bare.parse::<Address>().map_err(|_| AppError::Mail(format!("«{a}» no es una dirección válida")))
        })
        .collect()
}

/// Tipo de archivo para el adjunto.
fn content_type(path: &Path) -> ContentType {
    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    let mime = match ext.as_str() {
        "pdf" => "application/pdf",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "doc" => "application/msword",
        "xls" => "application/vnd.ms-excel",
        "ppt" => "application/vnd.ms-powerpoint",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "txt" | "md" | "csv" => "text/plain; charset=utf-8",
        "html" | "htm" => "text/html; charset=utf-8",
        "zip" => "application/zip",
        _ => "application/octet-stream",
    };
    ContentType::parse(mime).unwrap_or(ContentType::TEXT_PLAIN)
}

/// Lo que escribe el usuario en la ventanita de correo.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailDraft {
    pub to: String,
    pub subject: String,
    pub body: String,
    pub attachments: Vec<String>,
}

fn attachment_paths(draft: &MailDraft) -> AppResult<Vec<PathBuf>> {
    let paths: Vec<PathBuf> = draft.attachments.iter().map(PathBuf::from).collect();
    let mut total = 0;
    for path in &paths {
        let meta = std::fs::metadata(path)
            .map_err(|_| AppError::Mail(format!("«{}» ya no está ahí", path.display())))?;
        total += meta.len();
    }
    if total > MAX_ATTACHMENTS {
        return Err(AppError::Mail(format!(
            "los adjuntos pesan {} MB y el máximo es 24 MB",
            total / (1024 * 1024)
        )));
    }
    Ok(paths)
}

/// Monta el correo con sus adjuntos.
fn build_message(mail: &MailSettings, draft: &MailDraft, to: &[Address]) -> AppResult<Message> {
    let from_address: Address =
        mail.address.parse().map_err(|_| AppError::Mail(format!("«{}» no es una dirección válida", mail.address)))?;
    let name = (!mail.name.is_empty()).then(|| mail.name.clone());
    let mut builder = Message::builder()
        .from(Mailbox::new(name, from_address))
        .subject(draft.subject.trim())
        .user_agent(format!("Tico {}", env!("CARGO_PKG_VERSION")));
    for address in to {
        builder = builder.to(Mailbox::new(None, address.clone()));
    }
    let mut parts = MultiPart::mixed().singlepart(SinglePart::plain(draft.body.clone()));
    for path in attachment_paths(draft)? {
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "archivo".into());
        let bytes = std::fs::read(&path)?;
        parts = parts.singlepart(Attachment::new(name).body(bytes, content_type(&path)));
    }
    builder.multipart(parts).map_err(|e| AppError::Mail(e.to_string()))
}

fn transport(mail: &MailSettings, password: String) -> AppResult<SmtpTransport> {
    let (host, port, security) = server(mail)?;
    let builder = match security {
        MailSecurity::Ssl => SmtpTransport::relay(&host),
        MailSecurity::Starttls => SmtpTransport::starttls_relay(&host),
    }
    .map_err(|e| AppError::Mail(e.to_string()))?;
    let user = if mail.username.is_empty() { mail.address.clone() } else { mail.username.clone() };
    Ok(builder
        .port(port)
        .credentials(Credentials::new(user, password))
        .timeout(Some(Duration::from_secs(30)))
        .build())
}

/// Traduce los errores del servidor a algo que se entienda.
fn smtp_error(err: &lettre::transport::smtp::Error) -> AppError {
    let text = err.to_string();
    let lower = text.to_lowercase();
    if lower.contains("535") || lower.contains("534") || lower.contains("auth") || lower.contains("credentials") {
        AppError::MailAuth
    } else {
        AppError::Mail(text)
    }
}

fn password() -> AppResult<String> {
    secrets::get_named(SECRET)?.filter(|p| !p.is_empty()).ok_or(AppError::MailSetup)
}

fn settings_of(state: &AppState) -> AppResult<MailSettings> {
    let mail = lock(&state.settings).mail.clone();
    if mail.address.is_empty() {
        return Err(AppError::MailSetup);
    }
    Ok(mail)
}

// --- Comandos --------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailStatus {
    /// Dirección y contraseña puestas: Tico puede enviar él solo.
    pub ready: bool,
    pub has_password: bool,
    /// Servidor que se usará (el escrito o el del proveedor).
    pub host: Option<String>,
    /// Dónde se crea la contraseña de aplicación de este proveedor.
    pub help_url: Option<String>,
}

#[tauri::command]
pub fn mail_status(state: State<'_, AppState>) -> MailStatus {
    let mail = lock(&state.settings).mail.clone();
    let has_password = secrets::get_named(SECRET).ok().flatten().is_some_and(|p| !p.is_empty());
    let host = server(&mail).ok().map(|(h, _, _)| h);
    MailStatus {
        ready: has_password && !mail.address.is_empty() && host.is_some(),
        has_password,
        host,
        help_url: preset_for(&mail.address).and_then(|p| p.help).map(String::from),
    }
}

/// Guarda la contraseña (de aplicación) del correo en el llavero.
#[tauri::command]
pub fn mail_set_password(password: String) -> AppResult<()> {
    // Las de Google se copian con espacios ("abcd efgh ijkl mnop").
    let password: String = password.trim().to_string();
    if password.is_empty() {
        return Err(AppError::MailSetup);
    }
    secrets::set_named(SECRET, &password)
}

#[tauri::command]
pub fn mail_delete_password() -> AppResult<()> {
    secrets::delete_named(SECRET)
}

/// Comprueba que el servidor acepta la cuenta (sin enviar nada).
#[tauri::command]
pub async fn mail_test(state: State<'_, AppState>) -> AppResult<()> {
    let mail = settings_of(&state)?;
    let password = password()?;
    tauri::async_runtime::spawn_blocking(move || {
        let transport = transport(&mail, password)?;
        match transport.test_connection() {
            Ok(true) => Ok(()),
            Ok(false) => Err(AppError::Mail("el servidor no responde".into())),
            Err(err) => Err(smtp_error(&err)),
        }
    })
    .await
    .map_err(|e| AppError::Mail(e.to_string()))?
}

/// Envía el correo con tu cuenta. Devuelve a quién se ha enviado.
#[tauri::command]
pub async fn mail_send(state: State<'_, AppState>, draft: MailDraft) -> AppResult<Vec<String>> {
    let mail = settings_of(&state)?;
    let password = password()?;
    let to = parse_recipients(&draft.to)?;
    let sent: Vec<String> = to.iter().map(ToString::to_string).collect();
    tauri::async_runtime::spawn_blocking(move || {
        let message = build_message(&mail, &draft, &to)?;
        transport(&mail, password)?.send(&message).map_err(|e| smtp_error(&e))?;
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Mail(e.to_string()))??;
    if let Err(err) = state.db.remember_contacts(&sent) {
        eprintln!("No se pudieron guardar los contactos: {err}");
    }
    Ok(sent)
}

/// Direcciones a las que ya has escrito (para sugerirlas).
#[tauri::command]
pub fn mail_contacts(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    state.db.contacts(50)
}

/// Abre el borrador en la app de correo del sistema. Devuelve cuál: "outlook",
/// "thunderbird", "mail" o "mailto" (este último sin adjuntos: se enseña el archivo en su
/// carpeta para arrastrarlo).
#[tauri::command]
pub async fn mail_open_app(draft: MailDraft) -> AppResult<String> {
    let to: Vec<String> = if draft.to.trim().is_empty() {
        Vec::new()
    } else {
        parse_recipients(&draft.to)?.iter().map(ToString::to_string).collect()
    };
    let paths = attachment_paths(&draft)?;
    tauri::async_runtime::spawn_blocking(move || open_in_app(&to, &draft, &paths))
        .await
        .map_err(|e| AppError::Mail(e.to_string()))?
}

/// `mailto:` con destinatario, asunto y texto (los adjuntos no caben en un mailto).
fn mailto(to: &[String], subject: &str, body: &str) -> String {
    let encode = |s: &str| -> String {
        s.bytes()
            .map(|b| match b {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
                _ => format!("%{b:02X}"),
            })
            .collect()
    };
    format!("mailto:{}?subject={}&body={}", to.join(","), encode(subject), encode(body))
}

#[cfg(target_os = "windows")]
fn open_in_app(to: &[String], draft: &MailDraft, paths: &[PathBuf]) -> AppResult<String> {
    use std::process::Command;
    let files = paths.iter().map(|p| p.to_string_lossy().into_owned()).collect::<Vec<_>>().join("\n");

    // 1. Outlook (el clásico, que se deja automatizar).
    const OUTLOOK: &str = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$ol = New-Object -ComObject Outlook.Application
$m = $ol.CreateItem(0)
$m.To = $env:TICO_TO
$m.Subject = $env:TICO_SUBJECT
$m.Body = $env:TICO_BODY
foreach ($f in ($env:TICO_FILES -split "`n")) { if ($f) { [void]$m.Attachments.Add($f) } }
$m.Display()
"#;
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", OUTLOOK])
        .env("TICO_TO", to.join("; "))
        .env("TICO_SUBJECT", &draft.subject)
        .env("TICO_BODY", &draft.body)
        .env("TICO_FILES", &files);
    if crate::convert::run_with_timeout(cmd, false).is_some() {
        return Ok("outlook".into());
    }

    // 2. Thunderbird.
    let thunderbird = ["ProgramFiles", "ProgramFiles(x86)"]
        .iter()
        .filter_map(std::env::var_os)
        .map(|dir| PathBuf::from(dir).join("Mozilla Thunderbird").join("thunderbird.exe"))
        .find(|p| p.exists());
    if let Some(exe) = thunderbird {
        let quote = |s: &str| s.replace('\'', "’");
        let attachments = paths
            .iter()
            .map(|p| format!("file:///{}", p.to_string_lossy().replace('\\', "/")))
            .collect::<Vec<_>>()
            .join(",");
        let spec = format!(
            "to='{}',subject='{}',body='{}',attachment='{}'",
            quote(&to.join(",")),
            quote(&draft.subject),
            quote(&draft.body),
            quote(&attachments)
        );
        if Command::new(exe).arg("-compose").arg(spec).spawn().is_ok() {
            return Ok("thunderbird".into());
        }
    }

    // 3. La app de correo por defecto, sin adjuntos: enseñamos el archivo para arrastrarlo.
    let url = mailto(to, &draft.subject, &draft.body);
    Command::new("explorer").arg(&url).spawn().map_err(|_| AppError::NoMailApp)?;
    if let Some(first) = paths.first() {
        let _ = Command::new("explorer").arg("/select,").arg(first).spawn();
    }
    Ok("mailto".into())
}

#[cfg(target_os = "macos")]
fn open_in_app(to: &[String], draft: &MailDraft, paths: &[PathBuf]) -> AppResult<String> {
    use std::process::Command;
    // Mail de Apple: mensaje nuevo, visible, con los adjuntos. Todo va como argumentos.
    const SCRIPT: &str = r#"on run argv
set theTo to item 1 of argv
set theSubject to item 2 of argv
set theBody to item 3 of argv
tell application "Mail"
  set msg to make new outgoing message with properties {subject:theSubject, content:theBody & return & return, visible:true}
  tell msg
    repeat with addr in paragraphs of theTo
      if (length of addr) > 0 then make new to recipient at end of to recipients with properties {address:addr}
    end repeat
    repeat with i from 4 to count of argv
      make new attachment with properties {file name:((POSIX file (item i of argv)) as alias)} at after the last paragraph
    end repeat
  end tell
  activate
end tell
end run"#;
    let mut cmd = Command::new("osascript");
    cmd.arg("-e").arg(SCRIPT).arg(to.join("\n")).arg(&draft.subject).arg(&draft.body).args(paths);
    if crate::convert::run_with_timeout(cmd, false).is_some() {
        return Ok("mail".into());
    }
    let url = mailto(to, &draft.subject, &draft.body);
    Command::new("open").arg(&url).spawn()?;
    if let Some(first) = paths.first() {
        let _ = Command::new("open").arg("-R").arg(first).spawn();
    }
    Ok("mailto".into())
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn open_in_app(to: &[String], draft: &MailDraft, _paths: &[PathBuf]) -> AppResult<String> {
    std::process::Command::new("xdg-open").arg(mailto(to, &draft.subject, &draft.body)).spawn()?;
    Ok("mailto".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presets_by_domain() {
        assert_eq!(preset_for("victor@gmail.com").map(|p| p.host), Some("smtp.gmail.com"));
        assert_eq!(preset_for("ana@hotmail.es").map(|p| p.port), Some(587));
        assert_eq!(preset_for("luis@icloud.com").map(|p| p.security), Some(MailSecurity::Starttls));
        assert_eq!(preset_for("eva@yahoo.co.uk").map(|p| p.host), Some("smtp.mail.yahoo.com"));
        assert!(preset_for("yo@miempresa.com").is_none());
        assert!(preset_for("sin-arroba").is_none());
        // "me" solo vale como dominio entero, no como prefijo de otro.
        assert!(preset_for("x@meetup.com").is_none());
    }

    #[test]
    fn manual_server_wins() {
        let mail = MailSettings {
            address: "yo@miempresa.com".into(),
            host: "smtp.miempresa.com".into(),
            security: MailSecurity::Starttls,
            ..MailSettings::default()
        };
        assert_eq!(server(&mail).unwrap(), ("smtp.miempresa.com".into(), 587, MailSecurity::Starttls));
        let unknown = MailSettings { address: "yo@miempresa.com".into(), ..MailSettings::default() };
        assert!(matches!(server(&unknown), Err(AppError::MailSetup)));
    }

    #[test]
    fn recipients_are_parsed() {
        let list = parse_recipients(" ana@x.com, Luis <luis@y.es>; eva@z.org\n").unwrap();
        assert_eq!(list.len(), 3);
        assert_eq!(list[1].to_string(), "luis@y.es");
        assert!(parse_recipients("   ").is_err());
        assert!(parse_recipients("ana@x.com, no-es-correo").is_err());
    }

    #[test]
    fn message_has_the_attachment() {
        let dir = std::env::temp_dir().join(format!("tico-mail-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let pdf = dir.join("Informe final.pdf");
        std::fs::write(&pdf, b"%PDF-1.4 hola").unwrap();
        let mail = MailSettings { address: "victor@gmail.com".into(), name: "Víctor".into(), ..MailSettings::default() };
        let draft = MailDraft {
            to: "ana@x.com".into(),
            subject: "Te paso el informe".into(),
            body: "Hola Ana,\nahí va.".into(),
            attachments: vec![pdf.to_string_lossy().into_owned()],
        };
        let to = parse_recipients(&draft.to).unwrap();
        let raw = String::from_utf8(build_message(&mail, &draft, &to).unwrap().formatted()).unwrap();
        assert!(raw.contains("To: ana@x.com"));
        assert!(raw.contains("Content-Type: application/pdf"));
        assert!(raw.contains("Informe final.pdf"));
        assert!(raw.contains("multipart/mixed"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn mailto_is_encoded() {
        let url = mailto(&["ana@x.com".into()], "Hola qué tal", "a&b");
        assert_eq!(url, "mailto:ana@x.com?subject=Hola%20qu%C3%A9%20tal&body=a%26b");
    }
}
