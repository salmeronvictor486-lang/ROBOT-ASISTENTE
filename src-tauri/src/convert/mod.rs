//! "Pásame este Word a PDF": convierte documentos a PDF por su cuenta, sin pasar por la IA.
//!
//! Prueba, en este orden, lo que dé el mejor resultado y esté instalado:
//! 1. La app original: Word/Excel/PowerPoint en Windows; Pages/Numbers/Keynote en Mac.
//! 2. LibreOffice (gratis), si está instalado.
//! 3. El motor propio de Tico (`pdf.rs`), que funciona siempre.

pub mod docx;
pub mod pdf;

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::files::{self, extension, kind_of, FileKind};
use crate::island::lock;
use crate::settings::OutputFolder;
use crate::state::AppState;

/// Una conversión no puede tardar más que esto (Word a veces se queda con un diálogo abierto).
const TIMEOUT: Duration = Duration::from_secs(150);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertResult {
    /// Archivo de origen (o el nombre del documento abierto).
    pub source: String,
    /// PDF creado.
    pub output: String,
    pub name: String,
    pub size: u64,
    /// Con qué se ha hecho: "word", "excel", "powerpoint", "pages", "numbers", "keynote",
    /// "libreoffice" o "tico".
    pub engine: String,
}

/// Nombre libre en `dir`: "Informe.pdf", y si existe "Informe (2).pdf"…
pub fn unique_pdf_path(dir: &Path, stem: &str) -> PathBuf {
    let stem: String = stem
        .chars()
        .map(|c| if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') { '_' } else { c })
        .collect();
    let stem = if stem.trim().is_empty() { "documento".to_string() } else { stem.trim().to_string() };
    let first = dir.join(format!("{stem}.pdf"));
    if !first.exists() {
        return first;
    }
    (2..1000)
        .map(|n| dir.join(format!("{stem} ({n}).pdf")))
        .find(|p| !p.exists())
        .unwrap_or(first)
}

/// Ejecuta un programa con un tiempo máximo. Devuelve si ha terminado bien.
fn run(mut cmd: Command) -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // Sin ventana negra de consola.
        cmd.creation_flags(0x0800_0000);
    }
    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    let Ok(mut child) = cmd.spawn() else { return false };
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return status.success(),
            Ok(None) if start.elapsed() > TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();
                return false;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(120)),
            Err(_) => return false,
        }
    }
}

/// Igual que `run`, pero devolviendo lo que el programa escribe (para preguntar cosas).
#[cfg(any(target_os = "windows", target_os = "macos"))]
fn output_of(mut cmd: Command) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.stdin(std::process::Stdio::null()).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn produced(out: &Path) -> bool {
    std::fs::metadata(out).is_ok_and(|m| m.len() > 0)
}

// --- Windows: Office por automatización (PowerShell + COM) --------------------------------

#[cfg(target_os = "windows")]
fn powershell(script: &str, envs: &[(&str, &Path)]) -> Command {
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]);
    // Las rutas van en variables de entorno: así un nombre raro no puede romper el script.
    for (key, value) in envs {
        cmd.env(key, value);
    }
    cmd
}

#[cfg(target_os = "windows")]
const WORD_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
try {
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Open($env:TICO_IN, $false, $true, $false)
  $doc.ExportAsFixedFormat($env:TICO_OUT, 17)
  $doc.Close(0)
} finally {
  if ($word.Documents.Count -eq 0) { $word.Quit() }
}
"#;

#[cfg(target_os = "windows")]
const EXCEL_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$xl = New-Object -ComObject Excel.Application
try {
  $xl.Visible = $false
  $xl.DisplayAlerts = $false
  $book = $xl.Workbooks.Open($env:TICO_IN, 0, $true)
  $book.ExportAsFixedFormat(0, $env:TICO_OUT)
  $book.Close($false)
} finally {
  if ($xl.Workbooks.Count -eq 0) { $xl.Quit() }
}
"#;

#[cfg(target_os = "windows")]
const POWERPOINT_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$pp = New-Object -ComObject PowerPoint.Application
try {
  $pres = $pp.Presentations.Open($env:TICO_IN, -1, 0, 0)
  $pres.SaveAs($env:TICO_OUT, 32)
  $pres.Close()
} finally {
  if ($pp.Presentations.Count -eq 0) { $pp.Quit() }
}
"#;

/// El documento que está abierto en Word ahora mismo (ruta completa y nombre).
#[cfg(target_os = "windows")]
fn active_word_document() -> Option<(String, String)> {
    let script = r#"
$ErrorActionPreference = 'Stop'
$word = [Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application')
$doc = $word.ActiveDocument
Write-Output $doc.FullName
Write-Output $doc.Name
"#;
    let out = output_of(powershell(script, &[]))?;
    let mut lines = out.lines();
    let full = lines.next()?.trim().to_string();
    let name = lines.next()?.trim().to_string();
    (!full.is_empty()).then_some((full, name))
}

/// Exporta a PDF el documento activo de Word (vale aunque esté en OneDrive o sin guardar).
#[cfg(target_os = "windows")]
fn export_active_word(out: &Path) -> bool {
    let script = r#"
$ErrorActionPreference = 'Stop'
$word = [Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application')
$word.ActiveDocument.ExportAsFixedFormat($env:TICO_OUT, 17)
"#;
    run(powershell(script, &[("TICO_OUT", out)])) && produced(out)
}

#[cfg(target_os = "windows")]
fn office(input: &Path, out: &Path) -> Option<&'static str> {
    let (script, engine) = match kind_of(input) {
        FileKind::Word => (WORD_SCRIPT, "word"),
        FileKind::Sheet if extension(input) != "csv" => (EXCEL_SCRIPT, "excel"),
        FileKind::Slides => (POWERPOINT_SCRIPT, "powerpoint"),
        _ => return None,
    };
    (run(powershell(script, &[("TICO_IN", input), ("TICO_OUT", out)])) && produced(out)).then_some(engine)
}

// --- macOS: Pages, Numbers y Keynote por AppleScript --------------------------------------

#[cfg(target_os = "macos")]
fn apple_app(input: &Path, out: &Path) -> Option<&'static str> {
    let (app, engine) = match kind_of(input) {
        FileKind::Word => ("Pages", "pages"),
        FileKind::Sheet => ("Numbers", "numbers"),
        FileKind::Slides => ("Keynote", "keynote"),
        _ => return None,
    };
    if !Path::new(&format!("/Applications/{app}.app")).exists() {
        return None;
    }
    // Si la app no estaba abierta, la cerramos al terminar.
    let script = format!(
        r#"on run argv
set wasRunning to application "{app}" is running
tell application "{app}"
  set theDoc to open (POSIX file (item 1 of argv))
  export theDoc to (POSIX file (item 2 of argv)) as PDF
  close theDoc saving no
  if not wasRunning then quit
end tell
end run"#
    );
    let mut cmd = Command::new("osascript");
    cmd.arg("-e").arg(script).arg(input).arg(out);
    (run(cmd) && produced(out)).then_some(engine)
}

/// El documento que está abierto en Word o Pages ahora mismo (ruta y nombre).
#[cfg(target_os = "macos")]
fn active_mac_document() -> Option<(String, String)> {
    let script = r#"
if application "Microsoft Word" is running then
  tell application "Microsoft Word"
    if (count of documents) > 0 then return POSIX path of ((full name of active document) as text)
  end tell
end if
if application "Pages" is running then
  tell application "Pages"
    if (count of documents) > 0 then return POSIX path of ((file of front document) as alias)
  end tell
end if
return ""
"#;
    let mut cmd = Command::new("osascript");
    cmd.arg("-e").arg(script);
    let path = output_of(cmd)?;
    if path.is_empty() {
        return None;
    }
    let name = Path::new(&path).file_name()?.to_string_lossy().into_owned();
    Some((path, name))
}

// --- LibreOffice (cualquier sistema) -------------------------------------------------------

fn soffice() -> Option<PathBuf> {
    let candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
        ["ProgramFiles", "ProgramFiles(x86)"]
            .iter()
            .filter_map(|v| std::env::var(v).ok())
            .map(|dir| PathBuf::from(dir).join("LibreOffice").join("program").join("soffice.exe"))
            .collect()
    } else if cfg!(target_os = "macos") {
        vec![PathBuf::from("/Applications/LibreOffice.app/Contents/MacOS/soffice")]
    } else {
        std::env::var_os("PATH")
            .map(|paths| {
                std::env::split_paths(&paths)
                    .flat_map(|d| [d.join("soffice"), d.join("libreoffice")])
                    .collect()
            })
            .unwrap_or_default()
    };
    candidates.into_iter().find(|p| p.exists())
}

fn libreoffice(input: &Path, out: &Path) -> bool {
    let Some(soffice) = soffice() else { return false };
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    let work = std::env::temp_dir().join(format!("tico-lo-{}-{stamp}", std::process::id()));
    let outdir = work.join("out");
    if std::fs::create_dir_all(&outdir).is_err() {
        return false;
    }
    // Perfil propio: así funciona aunque el usuario tenga LibreOffice abierto.
    let profile = format!("-env:UserInstallation=file:///{}", work.join("profile").to_string_lossy().replace('\\', "/").trim_start_matches('/'));
    let mut cmd = Command::new(soffice);
    cmd.arg(profile)
        .args(["--headless", "--norestore", "--nologo", "--convert-to", "pdf", "--outdir"])
        .arg(&outdir)
        .arg(input);
    let ok = run(cmd);
    let stem = input.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let made = outdir.join(format!("{stem}.pdf"));
    let moved = ok && produced(&made) && (std::fs::rename(&made, out).is_ok() || std::fs::copy(&made, out).is_ok());
    let _ = std::fs::remove_dir_all(&work);
    moved && produced(out)
}

// --- Motor propio -------------------------------------------------------------------------

fn builtin(input: &Path, out: &Path) -> AppResult<()> {
    let title = input.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = extension(input);
    let doc = match (kind_of(input), ext.as_str()) {
        (_, "docx" | "docm" | "dotx") => {
            let bytes = std::fs::read(input)?;
            docx::parse(&bytes)?
        }
        (FileKind::Image, _) => pdf::document_from_images(vec![std::fs::read(input)?])?,
        (_, "md" | "markdown") => pdf::document_from_text(&files::extract_text(input)?, true),
        (_, "xlsx" | "xlsm" | "csv" | "tsv") => table_document(input)?,
        (_, "doc" | "xls" | "ppt" | "pages" | "numbers" | "key") => {
            return Err(AppError::Convert(
                "este formato necesita su programa (Word, LibreOffice o las apps de Apple) y no lo encuentro".into(),
            ))
        }
        _ => pdf::document_from_text(&files::extract_text(input)?, false),
    };
    let bytes = pdf::render(&doc, &title)?;
    std::fs::write(out, bytes)?;
    Ok(())
}

/// Hoja de cálculo o CSV como tablas (una por hoja).
fn table_document(input: &Path) -> AppResult<docx::Document> {
    let sheets = if matches!(extension(input).as_str(), "csv" | "tsv") {
        let text = files::extract_text(input)?;
        vec![(String::new(), files::csv_rows(&text))]
    } else {
        files::xlsx_rows(&std::fs::read(input)?)?
    };
    let cell_style = docx::TextStyle { size: 9.0, ..docx::TextStyle::default() };
    let mut blocks = Vec::new();
    for (i, (name, rows)) in sheets.into_iter().enumerate() {
        if i > 0 {
            blocks.push(docx::Block::PageBreak);
        }
        if !name.is_empty() {
            blocks.push(docx::Block::Paragraph(docx::Paragraph {
                inlines: vec![docx::Inline::Text(name, docx::TextStyle { bold: true, size: 14.0, ..docx::TextStyle::default() })],
                heading: 2,
                space_after: 6.0,
                line: 1.1,
                ..docx::Paragraph::default()
            }));
        }
        let rows: Vec<Vec<docx::Cell>> = rows
            .into_iter()
            .filter(|r| r.iter().any(|c| !c.trim().is_empty()))
            .map(|r| {
                r.into_iter()
                    .map(|text| docx::Cell {
                        paragraphs: vec![docx::Paragraph {
                            inlines: vec![docx::Inline::Text(text, cell_style.clone())],
                            line: 1.0,
                            ..docx::Paragraph::default()
                        }],
                        span: 1,
                    })
                    .collect()
            })
            .collect();
        blocks.push(docx::Block::Table(docx::Table { columns: Vec::new(), rows }));
    }
    let page = docx::PageSetup { width: 841.89, height: 595.28, ..docx::PageSetup::default() };
    Ok(docx::Document { page, blocks })
}

/// Convierte `input` en el PDF `out` con lo mejor que haya. Devuelve el motor usado.
pub fn convert_file(input: &Path, out: &Path) -> AppResult<&'static str> {
    if !input.is_file() {
        return Err(AppError::File("el archivo ya no está ahí".into()));
    }
    if kind_of(input) == FileKind::Pdf {
        return Err(AppError::Convert("ya es un PDF".into()));
    }
    #[cfg(target_os = "windows")]
    if let Some(engine) = office(input, out) {
        return Ok(engine);
    }
    #[cfg(target_os = "macos")]
    if let Some(engine) = apple_app(input, out) {
        return Ok(engine);
    }
    // Documentos de oficina: LibreOffice respeta mejor el diseño que el motor propio.
    // Texto, Markdown, CSV e imágenes salen igual de bien (y más rápido) con el propio.
    let office_like = matches!(kind_of(input), FileKind::Word | FileKind::Sheet | FileKind::Slides)
        && !matches!(extension(input).as_str(), "csv" | "tsv");
    if office_like && libreoffice(input, out) {
        return Ok("libreoffice");
    }
    builtin(input, out)?;
    Ok("tico")
}

fn output_dir(app: &AppHandle, input: Option<&Path>) -> PathBuf {
    let folder = lock(&app.state::<AppState>().settings).output_folder;
    let same = input.and_then(Path::parent).filter(|d| d.is_dir()).map(Path::to_path_buf);
    let downloads = app.path().download_dir().ok().filter(|d| d.is_dir());
    let home = app.path().home_dir().ok();
    match folder {
        OutputFolder::Same => same.or(downloads),
        OutputFolder::Downloads => downloads.or(same),
    }
    .or(home)
    .unwrap_or_else(std::env::temp_dir)
}

fn result(source: String, out: &Path, engine: &str) -> AppResult<ConvertResult> {
    Ok(ConvertResult {
        source,
        output: out.to_string_lossy().into_owned(),
        name: out.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        size: std::fs::metadata(out)?.len(),
        engine: engine.to_string(),
    })
}

/// Convierte el documento abierto ahora mismo en Word (o Pages). `NoDocument` si no hay.
fn convert_active(app: &AppHandle) -> AppResult<ConvertResult> {
    #[cfg(target_os = "windows")]
    if let Some((full, name)) = active_word_document() {
        let path = Path::new(&full);
        let stem = Path::new(&name).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or(name.clone());
        // Si está guardado en el disco, lo exportamos desde Word tal cual se ve.
        let local = path.is_file().then_some(path);
        let out = unique_pdf_path(&output_dir(app, local), &stem);
        if export_active_word(&out) {
            return result(name, &out, "word");
        }
        if let Some(local) = local {
            let engine = convert_file(local, &out)?;
            return result(name, &out, engine);
        }
        return Err(AppError::Convert("Word no ha podido exportar el documento".into()));
    }
    #[cfg(target_os = "macos")]
    if let Some((full, name)) = active_mac_document() {
        let path = PathBuf::from(&full);
        let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or(name.clone());
        let out = unique_pdf_path(&output_dir(app, Some(&path)), &stem);
        let engine = convert_file(&path, &out)?;
        return result(name, &out, engine);
    }
    let _ = app;
    Err(AppError::NoDocument)
}

/// Pasa a PDF el archivo `path`, o (sin `path`) el documento abierto en Word/Pages.
#[tauri::command]
pub async fn convert_to_pdf(app: AppHandle, path: Option<String>) -> AppResult<ConvertResult> {
    tauri::async_runtime::spawn_blocking(move || match path {
        Some(path) => {
            let input = PathBuf::from(&path);
            let stem = input.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
            let out = unique_pdf_path(&output_dir(&app, Some(&input)), &stem);
            let engine = convert_file(&input, &out)?;
            let name = input.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or(path);
            result(name, &out, engine)
        }
        None => convert_active(&app),
    })
    .await
    .map_err(|e| AppError::Convert(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Para revisar a ojo el motor propio:
    /// `TICO_SAMPLE=informe.docx cargo test render_sample -- --ignored` (deja informe.tico.pdf).
    #[test]
    #[ignore]
    fn render_sample() {
        let input = PathBuf::from(std::env::var("TICO_SAMPLE").expect("falta TICO_SAMPLE"));
        let out = input.with_extension("tico.pdf");
        builtin(&input, &out).unwrap();
    }

    #[test]
    fn unique_names_do_not_overwrite() {
        let dir = std::env::temp_dir().join(format!("tico-pdf-names-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(unique_pdf_path(&dir, "Informe"), dir.join("Informe.pdf"));
        std::fs::write(dir.join("Informe.pdf"), b"x").unwrap();
        assert_eq!(unique_pdf_path(&dir, "Informe"), dir.join("Informe (2).pdf"));
        assert_eq!(unique_pdf_path(&dir, "a/b:c"), dir.join("a_b_c.pdf"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn converts_docx_text_and_csv() {
        if pdf::render(&pdf::document_from_text("x", false), "x").is_err() {
            return; // sin fuentes en este sistema
        }
        let dir = std::env::temp_dir().join(format!("tico-convert-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let docx_path = dir.join("Carta.docx");
        std::fs::write(&docx_path, docx::tests::make_docx(r#"<w:p><w:r><w:t>Hola</w:t></w:r></w:p>"#)).unwrap();
        let csv_path = dir.join("datos.csv");
        std::fs::write(&csv_path, "a;b\n1;2\n").unwrap();
        for input in [&docx_path, &csv_path] {
            let out = unique_pdf_path(&dir, &input.file_stem().unwrap().to_string_lossy());
            let engine = convert_file(input, &out).unwrap();
            assert!(["libreoffice", "tico"].contains(&engine));
            let bytes = std::fs::read(&out).unwrap();
            assert!(bytes.starts_with(b"%PDF"), "{engine} no ha hecho un PDF");
        }
        assert!(matches!(convert_file(&dir.join("x.pdf"), &dir.join("y.pdf")), Err(AppError::File(_))));
        let _ = std::fs::remove_dir_all(dir);
    }
}
