//! Archivos que el usuario suelta en la isla o adjunta: qué son, qué contienen y
//! abrirlos o enseñarlos en su carpeta. Nada se sube a ningún sitio salvo a la IA
//! elegida, y solo cuando el usuario envía el mensaje.

use std::io::Cursor;
use std::path::{Path, PathBuf};

use quick_xml::events::Event;
use quick_xml::Reader;
use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::ai::ImageData;
use crate::capture::{encode_jpeg, MAX_SIDE};
use crate::convert::docx;
use crate::error::{AppError, AppResult};

/// Archivos más grandes que esto no se leen (para no colgar la app).
const MAX_READ_BYTES: u64 = 60 * 1024 * 1024;
/// Máximo de texto de un archivo que mandamos a la IA.
pub const MAX_TEXT_CHARS: usize = 60_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileKind {
    Word,
    Pdf,
    Image,
    Sheet,
    Slides,
    Text,
    Code,
    Other,
}

pub fn extension(path: &Path) -> String {
    path.extension().and_then(|e| e.to_str()).unwrap_or_default().to_lowercase()
}

pub fn kind_of(path: &Path) -> FileKind {
    match extension(path).as_str() {
        "docx" | "doc" | "docm" | "dotx" | "odt" | "rtf" | "pages" => FileKind::Word,
        "pdf" => FileKind::Pdf,
        "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "tif" | "tiff" => FileKind::Image,
        "xlsx" | "xlsm" | "xls" | "ods" | "csv" | "tsv" | "numbers" => FileKind::Sheet,
        "pptx" | "ppt" | "odp" | "key" => FileKind::Slides,
        "txt" | "md" | "markdown" | "log" | "json" | "xml" | "yaml" | "yml" | "ini" | "toml" | "html"
        | "htm" | "srt" | "vtt" => FileKind::Text,
        "rs" | "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" | "py" | "java" | "c" | "cc" | "cpp" | "h"
        | "hpp" | "cs" | "go" | "rb" | "php" | "swift" | "kt" | "kts" | "sql" | "sh" | "bash" | "zsh"
        | "ps1" | "bat" | "cmd" | "css" | "scss" | "sass" | "less" | "vue" | "svelte" | "lua" | "r"
        | "dart" | "scala" | "pl" | "ex" | "exs" | "hs" | "m" | "mm" | "gradle" | "dockerfile" => FileKind::Code,
        _ => FileKind::Other,
    }
}

/// ¿Se puede pasar a PDF? (Con Word, Pages o LibreOffice, o con el motor propio.)
pub fn can_convert(path: &Path) -> bool {
    match extension(path).as_str() {
        // Los de Apple solo se pueden abrir con sus apps (en Mac).
        "pages" | "numbers" | "key" => cfg!(target_os = "macos"),
        "tif" | "tiff" => false,
        _ => !matches!(kind_of(path), FileKind::Pdf | FileKind::Other),
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub kind: FileKind,
    pub can_convert: bool,
}

pub fn info(path: &Path) -> Option<FileInfo> {
    let meta = std::fs::metadata(path).ok()?;
    if !meta.is_file() {
        return None;
    }
    Some(FileInfo {
        path: path.to_string_lossy().into_owned(),
        name: path.file_name()?.to_string_lossy().into_owned(),
        size: meta.len(),
        kind: kind_of(path),
        can_convert: can_convert(path),
    })
}

// ---------------------------------------------------------------------------
// Sacar texto
// ---------------------------------------------------------------------------

fn read_limited(path: &Path) -> AppResult<Vec<u8>> {
    let size = std::fs::metadata(path)?.len();
    if size > MAX_READ_BYTES {
        return Err(AppError::File(format!("es demasiado grande ({} MB)", size / (1024 * 1024))));
    }
    Ok(std::fs::read(path)?)
}

/// Texto de un XML de un zip (OpenDocument, PowerPoint): párrafos en líneas y celdas con " | ".
fn xml_text(xml: &str, paragraph: &[&[u8]], cell: &[&[u8]], row: &[&[u8]]) -> String {
    let mut out = String::new();
    let mut r = Reader::from_str(xml);
    loop {
        match r.read_event() {
            Ok(Event::Text(t)) => out.push_str(&t.decode().unwrap_or_default()),
            Ok(Event::GeneralRef(g)) => out.push_str(&docx::unescape(&format!("&{};", g.decode().unwrap_or_default()))),
            Ok(Event::Empty(e)) => match e.local_name().as_ref() {
                b"tab" => out.push('\t'),
                b"line-break" | b"br" => out.push('\n'),
                b"s" => out.push(' '),
                _ => {}
            },
            Ok(Event::End(e)) => {
                let name = e.local_name();
                let name = name.as_ref();
                if paragraph.contains(&name) {
                    out.push('\n');
                } else if cell.contains(&name) {
                    out.push_str(" | ");
                } else if row.contains(&name) {
                    out.push('\n');
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    out
}

fn open_zip(bytes: &[u8]) -> AppResult<zip::ZipArchive<Cursor<&[u8]>>> {
    zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| AppError::File("el archivo está dañado".into()))
}

/// Número que aparece en un nombre ("slide12.xml" → 12) para ordenar.
fn number_in(name: &str) -> u32 {
    name.chars().filter(char::is_ascii_digit).collect::<String>().parse().unwrap_or(0)
}

fn pptx_text(bytes: &[u8]) -> AppResult<String> {
    let mut zip = open_zip(bytes)?;
    let mut slides: Vec<String> = zip
        .file_names()
        .filter(|n| n.starts_with("ppt/slides/slide") && n.ends_with(".xml"))
        .map(str::to_string)
        .collect();
    slides.sort_by_key(|n| number_in(n));
    let mut out = String::new();
    for (i, name) in slides.iter().enumerate() {
        if let Some(xml) = docx::zip_text(&mut zip, name) {
            out.push_str(&format!("--- {} {} ---\n", "Diapositiva", i + 1));
            out.push_str(&xml_text(&xml, &[b"p"], &[b"tc"], &[b"tr"]));
            out.push('\n');
        }
    }
    Ok(out)
}

/// Filas de una hoja de cálculo (.xlsx): todas las hojas, con su nombre delante.
pub fn xlsx_rows(bytes: &[u8]) -> AppResult<Vec<(String, Vec<Vec<String>>)>> {
    let mut zip = open_zip(bytes)?;
    let shared: Vec<String> = docx::zip_text(&mut zip, "xl/sharedStrings.xml")
        .map(|xml| {
            let mut strings = Vec::new();
            let mut current = String::new();
            let mut in_t = false;
            let mut r = Reader::from_str(&xml);
            loop {
                match r.read_event() {
                    Ok(Event::Start(e)) if e.local_name().as_ref() == b"t" => in_t = true,
                    Ok(Event::Text(t)) if in_t => current.push_str(&t.decode().unwrap_or_default()),
                    Ok(Event::GeneralRef(g)) if in_t => {
                        current.push_str(&docx::unescape(&format!("&{};", g.decode().unwrap_or_default())))
                    }
                    Ok(Event::End(e)) if e.local_name().as_ref() == b"t" => in_t = false,
                    Ok(Event::End(e)) if e.local_name().as_ref() == b"si" => strings.push(std::mem::take(&mut current)),
                    Ok(Event::Eof) | Err(_) => break,
                    _ => {}
                }
            }
            strings
        })
        .unwrap_or_default();
    let names: Vec<String> = docx::zip_text(&mut zip, "xl/workbook.xml")
        .map(|xml| {
            let mut names = Vec::new();
            let mut r = Reader::from_str(&xml);
            loop {
                match r.read_event() {
                    Ok(Event::Empty(e)) | Ok(Event::Start(e)) if e.local_name().as_ref() == b"sheet" => {
                        let name = e
                            .attributes()
                            .flatten()
                            .find(|a| a.key.local_name().as_ref() == b"name")
                            .map(|a| docx::unescape(&String::from_utf8_lossy(&a.value)));
                        names.push(name.unwrap_or_default());
                    }
                    Ok(Event::Eof) | Err(_) => break,
                    _ => {}
                }
            }
            names
        })
        .unwrap_or_default();
    let mut sheets: Vec<String> = zip
        .file_names()
        .filter(|n| n.starts_with("xl/worksheets/sheet") && n.ends_with(".xml"))
        .map(str::to_string)
        .collect();
    sheets.sort_by_key(|n| number_in(n));
    let mut out = Vec::new();
    for (i, sheet) in sheets.iter().enumerate() {
        let Some(xml) = docx::zip_text(&mut zip, sheet) else { continue };
        let mut rows = Vec::new();
        let mut row: Vec<String> = Vec::new();
        let mut cell_type = String::new();
        let mut value = String::new();
        let mut in_value = false;
        let mut r = Reader::from_str(&xml);
        loop {
            match r.read_event() {
                Ok(Event::Start(e)) => match e.local_name().as_ref() {
                    b"c" => {
                        cell_type = e
                            .attributes()
                            .flatten()
                            .find(|a| a.key.local_name().as_ref() == b"t")
                            .map(|a| String::from_utf8_lossy(&a.value).into_owned())
                            .unwrap_or_default();
                        value.clear();
                    }
                    b"v" | b"t" => in_value = true,
                    _ => {}
                },
                Ok(Event::Text(t)) if in_value => value.push_str(&t.decode().unwrap_or_default()),
                Ok(Event::GeneralRef(g)) if in_value => {
                    value.push_str(&docx::unescape(&format!("&{};", g.decode().unwrap_or_default())))
                }
                Ok(Event::End(e)) => match e.local_name().as_ref() {
                    b"v" | b"t" => in_value = false,
                    b"c" => {
                        let text = if cell_type == "s" {
                            value.trim().parse::<usize>().ok().and_then(|i| shared.get(i).cloned()).unwrap_or_default()
                        } else {
                            value.clone()
                        };
                        row.push(text);
                    }
                    b"row" => rows.push(std::mem::take(&mut row)),
                    _ => {}
                },
                Ok(Event::Eof) | Err(_) => break,
                _ => {}
            }
        }
        let name = names.get(i).cloned().unwrap_or_else(|| format!("Hoja {}", i + 1));
        out.push((name, rows));
    }
    Ok(out)
}

/// Filas de un CSV/TSV (separador detectado: coma, punto y coma o tabulador).
pub fn csv_rows(text: &str) -> Vec<Vec<String>> {
    let first = text.lines().next().unwrap_or_default();
    let sep = [';', '\t', ',']
        .into_iter()
        .max_by_key(|s| first.matches(*s).count())
        .unwrap_or(',');
    let mut rows = Vec::new();
    for line in text.lines() {
        let mut cells = Vec::new();
        let mut cell = String::new();
        let mut quoted = false;
        let mut chars = line.chars().peekable();
        while let Some(c) = chars.next() {
            match c {
                '"' if quoted && chars.peek() == Some(&'"') => {
                    cell.push('"');
                    chars.next();
                }
                '"' => quoted = !quoted,
                c if c == sep && !quoted => cells.push(std::mem::take(&mut cell)),
                c => cell.push(c),
            }
        }
        cells.push(cell);
        rows.push(cells);
    }
    rows
}

/// Texto de un RTF (quita los códigos de formato).
pub fn rtf_text(rtf: &str) -> String {
    let mut out = String::new();
    let mut chars = rtf.chars().peekable();
    // Grupos que no son texto: {\fonttbl…}, {\colortbl…}, {\*…}, {\pict…}.
    let mut skip_depth: Option<usize> = None;
    let mut depth = 0usize;
    let mut skip_chars = 0usize;
    while let Some(c) = chars.next() {
        match c {
            '{' => {
                depth += 1;
                let mut lookahead = String::new();
                let mut clone = chars.clone();
                for _ in 0..10 {
                    match clone.next() {
                        Some(ch) => lookahead.push(ch),
                        None => break,
                    }
                }
                if skip_depth.is_none()
                    && ["\\*", "\\fonttbl", "\\colortbl", "\\stylesheet", "\\info", "\\pict", "\\header", "\\footer"]
                        .iter()
                        .any(|p| lookahead.starts_with(p))
                {
                    skip_depth = Some(depth);
                }
            }
            '}' => {
                if skip_depth == Some(depth) {
                    skip_depth = None;
                }
                depth = depth.saturating_sub(1);
            }
            '\\' => {
                let mut word = String::new();
                while let Some(&n) = chars.peek() {
                    if n.is_ascii_alphabetic() {
                        word.push(n);
                        chars.next();
                    } else {
                        break;
                    }
                }
                if word.is_empty() {
                    match chars.next() {
                        Some('\'') => {
                            let hex: String = chars.by_ref().take(2).collect();
                            if skip_depth.is_none() && skip_chars == 0 {
                                if let Ok(b) = u8::from_str_radix(&hex, 16) {
                                    out.push(cp1252(b));
                                }
                            } else {
                                skip_chars = skip_chars.saturating_sub(1);
                            }
                        }
                        Some(ch) if skip_depth.is_none() && matches!(ch, '\\' | '{' | '}') => out.push(ch),
                        Some('~') if skip_depth.is_none() => out.push('\u{a0}'),
                        _ => {}
                    }
                    continue;
                }
                let mut num = String::new();
                if chars.peek() == Some(&'-') {
                    num.push('-');
                    chars.next();
                }
                while let Some(&n) = chars.peek() {
                    if n.is_ascii_digit() {
                        num.push(n);
                        chars.next();
                    } else {
                        break;
                    }
                }
                if chars.peek() == Some(&' ') {
                    chars.next();
                }
                if skip_depth.is_some() {
                    continue;
                }
                match word.as_str() {
                    "par" | "line" | "row" => out.push('\n'),
                    "tab" => out.push('\t'),
                    "cell" => out.push_str(" | "),
                    "u" => {
                        if let Some(c) = num.parse::<i32>().ok().map(|n| if n < 0 { n + 65536 } else { n }).and_then(|n| char::from_u32(n as u32)) {
                            out.push(c);
                        }
                        // Tras \uN viene un carácter de repuesto que hay que saltar.
                        skip_chars = 1;
                    }
                    _ => {}
                }
            }
            '\r' | '\n' => {}
            c => {
                if skip_depth.is_none() {
                    if skip_chars > 0 {
                        skip_chars -= 1;
                    } else {
                        out.push(c);
                    }
                }
            }
        }
    }
    out
}

/// Windows-1252 (lo que usan los `\'hh` de RTF) a Unicode.
fn cp1252(b: u8) -> char {
    const HIGH: [char; 32] = [
        '€', '\u{81}', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', '\u{8d}', 'Ž', '\u{8f}',
        '\u{90}', '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', '\u{9d}', 'ž', 'Ÿ',
    ];
    if (0x80..0xA0).contains(&b) {
        HIGH[(b - 0x80) as usize]
    } else {
        b as char
    }
}

/// HTML a texto (quita etiquetas, scripts y estilos).
fn html_text(html: &str) -> String {
    let mut out = String::new();
    let lower = html.to_lowercase();
    let mut i = 0;
    let bytes = html.as_bytes();
    while i < bytes.len() {
        if bytes[i] == b'<' {
            for block in ["script", "style"] {
                if lower[i..].starts_with(&format!("<{block}")) {
                    if let Some(end) = lower[i..].find(&format!("</{block}>")) {
                        i += end + block.len() + 3;
                    }
                }
            }
            let tag_end = html[i..].find('>').map_or(bytes.len(), |e| i + e + 1);
            let tag = &lower[i..tag_end.min(lower.len())];
            if ["<br", "<p", "</p", "<div", "</div", "<li", "<tr", "<h1", "<h2", "<h3"].iter().any(|t| tag.starts_with(t)) {
                out.push('\n');
            }
            i = tag_end;
        } else {
            let next = html[i..].find('<').map_or(bytes.len(), |n| i + n);
            out.push_str(&docx::unescape(&html[i..next]));
            i = next;
        }
    }
    out
}

fn pdf_text(bytes: &[u8]) -> AppResult<String> {
    // El lector de PDF puede fallar con archivos raros: lo aislamos para que no tumbe Tico.
    let bytes = bytes.to_vec();
    std::panic::catch_unwind(move || pdf_extract::extract_text_from_mem(&bytes))
        .map_err(|_| AppError::File("el PDF tiene un formato que no sé leer".into()))?
        .map_err(|e| AppError::File(format!("no he podido leer el PDF ({e})")))
}

/// Texto completo de un archivo (sin recortar).
pub fn extract_text(path: &Path) -> AppResult<String> {
    let ext = extension(path);
    let bytes = read_limited(path)?;
    let text = match ext.as_str() {
        "docx" | "docm" | "dotx" => docx::parse(&bytes)?.plain_text(),
        "odt" | "odp" | "ods" => {
            let mut zip = open_zip(&bytes)?;
            let xml = docx::zip_text(&mut zip, "content.xml")
                .ok_or_else(|| AppError::File("el documento no tiene contenido".into()))?;
            xml_text(&xml, &[b"p", b"h"], &[b"table-cell"], &[b"table-row"])
        }
        "pptx" => pptx_text(&bytes)?,
        "xlsx" | "xlsm" => xlsx_rows(&bytes)?
            .into_iter()
            .map(|(name, rows)| {
                let body: Vec<String> = rows.iter().map(|r| r.join("\t")).collect();
                format!("--- {name} ---\n{}", body.join("\n"))
            })
            .collect::<Vec<_>>()
            .join("\n\n"),
        "pdf" => pdf_text(&bytes)?,
        "rtf" => rtf_text(&String::from_utf8_lossy(&bytes)),
        "html" | "htm" => html_text(&String::from_utf8_lossy(&bytes)),
        "doc" | "xls" | "ppt" => {
            return Err(AppError::File(
                "es un formato antiguo de Office; guárdalo como .docx/.xlsx/.pptx o pásalo a PDF".into(),
            ))
        }
        _ => match kind_of(path) {
            FileKind::Text | FileKind::Code | FileKind::Sheet => String::from_utf8_lossy(&bytes).into_owned(),
            FileKind::Other if std::str::from_utf8(&bytes[..bytes.len().min(4096)]).is_ok() => {
                String::from_utf8_lossy(&bytes).into_owned()
            }
            _ => return Err(AppError::File("no sé leer este tipo de archivo".into())),
        },
    };
    Ok(text)
}

/// Recorta un texto largo y avisa de que falta el resto.
pub fn truncate(text: &str, max: usize) -> String {
    let text = text.trim();
    if text.chars().count() <= max {
        return text.to_string();
    }
    let cut: String = text.chars().take(max).collect();
    format!("{cut}\n[… the rest of the file was cut because it is too long]")
}

/// Lo que se manda a la IA de un archivo adjunto.
pub struct Attachment {
    pub context: String,
    pub image: Option<ImageData>,
}

/// Prepara un archivo para mandarlo en el chat: su texto, o la imagen (y su texto con OCR).
pub fn read_for_chat(path: &Path, ocr: bool) -> Attachment {
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    if kind_of(path) == FileKind::Image {
        let result = read_limited(path).and_then(|bytes| {
            let decoded = image::load_from_memory(&bytes).map_err(|e| AppError::File(e.to_string()))?;
            let rgba = decoded.to_rgba8();
            let (b64, _, _) = encode_jpeg(&rgba, MAX_SIDE, 85)?;
            let text = if ocr { crate::ocr::recognize(&rgba) } else { None };
            Ok((b64, text))
        });
        return match result {
            Ok((base64, text)) => {
                let mut context = format!("[Attached file: {name} (image)]");
                if let Some(text) = text {
                    context.push_str(&format!("\n[Text read from the image with OCR]\n{text}"));
                }
                Attachment { context, image: Some(ImageData { base64, media_type: "image/jpeg" }) }
            }
            Err(e) => Attachment { context: format!("[Attached file: {name} — it could not be read: {e}]"), image: None },
        };
    }
    match extract_text(path) {
        Ok(text) if text.trim().is_empty() => Attachment {
            context: format!("[Attached file: {name} — it has no readable text (it may be scanned images)]"),
            image: None,
        },
        Ok(text) => Attachment {
            context: format!("[Attached file: {name}]\n{}", truncate(&text, MAX_TEXT_CHARS)),
            image: None,
        },
        Err(e) => Attachment { context: format!("[Attached file: {name} — it could not be read: {e}]"), image: None },
    }
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

/// Datos de los archivos soltados en la isla (ignora carpetas y lo que no existe).
#[tauri::command]
pub fn files_inspect(paths: Vec<String>) -> Vec<FileInfo> {
    paths.iter().filter_map(|p| info(Path::new(p))).collect()
}

/// Abre el selector de archivos del sistema.
#[tauri::command]
pub async fn files_pick(app: AppHandle, documents: bool) -> AppResult<Vec<FileInfo>> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = app.dialog().file();
        if documents {
            dialog = dialog.add_filter(
                "Documentos",
                &["docx", "doc", "odt", "rtf", "txt", "md", "xlsx", "xls", "ods", "csv", "pptx", "ppt", "odp", "png", "jpg", "jpeg", "pages", "numbers", "key"],
            );
        }
        dialog.blocking_pick_files()
    })
    .await
    .map_err(|e| AppError::File(e.to_string()))?;
    Ok(picked
        .unwrap_or_default()
        .into_iter()
        .filter_map(|p| p.into_path().ok())
        .filter_map(|p| info(&p))
        .collect())
}

fn existing(path: &str) -> AppResult<PathBuf> {
    let path = PathBuf::from(path);
    if path.exists() {
        Ok(path)
    } else {
        Err(AppError::File("el archivo ya no está ahí".into()))
    }
}

/// Abre un archivo con su programa (el PDF convertido, por ejemplo).
#[tauri::command]
pub fn file_open(path: String) -> AppResult<()> {
    let path = existing(&path)?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer").arg(&path).spawn()?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&path).spawn()?;
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    std::process::Command::new("xdg-open").arg(&path).spawn()?;
    Ok(())
}

/// Enseña el archivo en su carpeta (Explorador / Finder).
#[tauri::command]
pub fn file_reveal(path: String) -> AppResult<()> {
    let path = existing(&path)?;
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer")
            .raw_arg(format!("/select,\"{}\"", path.display()))
            .spawn()?;
    }
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg("-R").arg(&path).spawn()?;
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    std::process::Command::new("xdg-open")
        .arg(path.parent().unwrap_or(Path::new("/")))
        .spawn()?;
    Ok(())
}

/// Imagen de un archivo en base64 (para la miniatura de los adjuntos).
#[tauri::command]
pub async fn file_thumbnail(path: String) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = read_limited(Path::new(&path))?;
        let image = image::load_from_memory(&bytes).map_err(|e| AppError::File(e.to_string()))?;
        let (b64, _, _) = encode_jpeg(&image.to_rgba8(), 160, 70)?;
        Ok(format!("data:image/jpeg;base64,{b64}"))
    })
    .await
    .map_err(|e| AppError::File(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use super::*;

    #[test]
    fn kinds_by_extension() {
        assert_eq!(kind_of(Path::new("Informe Final.DOCX")), FileKind::Word);
        assert_eq!(kind_of(Path::new("a.pdf")), FileKind::Pdf);
        assert_eq!(kind_of(Path::new("foto.JPG")), FileKind::Image);
        assert_eq!(kind_of(Path::new("main.rs")), FileKind::Code);
        assert_eq!(kind_of(Path::new("datos.csv")), FileKind::Sheet);
        assert_eq!(kind_of(Path::new("nada")), FileKind::Other);
        assert!(can_convert(Path::new("a.docx")));
        assert!(can_convert(Path::new("a.png")));
        assert!(!can_convert(Path::new("a.pdf")));
        assert!(!can_convert(Path::new("a.exe")));
    }

    #[test]
    fn rtf_to_text() {
        let rtf = r"{\rtf1\ansi{\fonttbl{\f0 Arial;}}{\colortbl;\red0\green0\blue0;}\f0 Hola \b mundo\b0\par Adi\'f3s \u8364? fin\par}";
        assert_eq!(rtf_text(rtf).trim(), "Hola mundo\nAdiós € fin");
    }

    #[test]
    fn csv_detects_separator_and_quotes() {
        let rows = csv_rows("nombre;edad\n\"Pérez; Ana\";30\n");
        assert_eq!(rows[1], vec!["Pérez; Ana".to_string(), "30".to_string()]);
    }

    #[test]
    fn html_to_text() {
        let text = html_text("<html><style>p{}</style><p>Hola &amp; adiós</p><script>x()</script><br>fin</html>");
        assert!(text.contains("Hola & adiós"));
        assert!(!text.contains("x()"));
        assert!(text.contains("fin"));
    }

    #[test]
    fn reads_xlsx_and_pptx() {
        let mut out = Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut out);
            let o = zip::write::SimpleFileOptions::default();
            zip.start_file("xl/sharedStrings.xml", o).unwrap();
            zip.write_all(br#"<sst><si><t>Nombre</t></si><si><t>Ana &amp; Luis</t></si></sst>"#).unwrap();
            zip.start_file("xl/workbook.xml", o).unwrap();
            zip.write_all(br#"<workbook><sheets><sheet name="Ventas" sheetId="1"/></sheets></workbook>"#).unwrap();
            zip.start_file("xl/worksheets/sheet1.xml", o).unwrap();
            zip.write_all(br#"<worksheet><sheetData><row><c t="s"><v>0</v></c><c><v>12</v></c></row><row><c t="s"><v>1</v></c><c t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>"#).unwrap();
            zip.finish().unwrap();
        }
        let rows = xlsx_rows(out.get_ref()).unwrap();
        assert_eq!(rows[0].0, "Ventas");
        assert_eq!(rows[0].1, vec![vec!["Nombre".to_string(), "12".into()], vec!["Ana & Luis".into(), "x".into()]]);

        let mut ppt = Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut ppt);
            let o = zip::write::SimpleFileOptions::default();
            for (n, text) in [(2, "Segunda"), (1, "Primera"), (10, "Décima")] {
                zip.start_file(format!("ppt/slides/slide{n}.xml"), o).unwrap();
                zip.write_all(format!(r#"<p:sld><a:p><a:r><a:t>{text}</a:t></a:r></a:p></p:sld>"#).as_bytes()).unwrap();
            }
            zip.finish().unwrap();
        }
        let text = pptx_text(ppt.get_ref()).unwrap();
        let first = text.find("Primera").unwrap();
        let second = text.find("Segunda").unwrap();
        let tenth = text.find("Décima").unwrap();
        assert!(first < second && second < tenth);
    }

    #[test]
    fn chat_attachment_from_text_file() {
        let dir = std::env::temp_dir().join(format!("tico-files-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("notas.txt");
        std::fs::write(&path, "Comprar pan").unwrap();
        let a = read_for_chat(&path, false);
        assert!(a.context.contains("[Attached file: notas.txt]\nComprar pan"));
        assert!(a.image.is_none());
        let missing = read_for_chat(&dir.join("no-existe.docx"), false);
        assert!(missing.context.contains("could not be read"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn truncate_marks_the_cut() {
        assert_eq!(truncate("  corto ", 10), "corto");
        assert!(truncate(&"x".repeat(50), 10).ends_with("too long]"));
    }
}
