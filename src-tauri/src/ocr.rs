//! Leer el texto de una imagen con el OCR que ya trae el sistema (gratis y sin internet):
//! Windows.Media.Ocr en Windows y Vision en macOS. Así Tico lee la pantalla al pie de la
//! letra, y también funciona con modelos que no ven imágenes.

use image::RgbaImage;

/// Máximo de caracteres que mandamos a la IA (una pantalla llena de texto cabe de sobra).
pub const MAX_CHARS: usize = 8000;

/// Texto de la imagen, línea a línea, o `None` si no hay OCR o no ha encontrado nada.
pub fn recognize(image: &RgbaImage) -> Option<String> {
    let text = recognize_impl(image)?;
    let cleaned = clean(&text);
    (!cleaned.is_empty()).then_some(cleaned)
}

/// Quita líneas vacías repetidas y espacios sobrantes, y recorta a `MAX_CHARS`.
pub fn clean(text: &str) -> String {
    let mut out = String::new();
    let mut blank = false;
    for line in text.lines() {
        let line = line.split_whitespace().collect::<Vec<_>>().join(" ");
        if line.is_empty() {
            blank = !out.is_empty();
            continue;
        }
        if !out.is_empty() {
            out.push_str(if blank { "\n\n" } else { "\n" });
        }
        blank = false;
        out.push_str(&line);
        if out.chars().count() > MAX_CHARS {
            let cut: String = out.chars().take(MAX_CHARS).collect();
            return format!("{cut}…");
        }
    }
    out
}

#[cfg(target_os = "windows")]
fn recognize_impl(image: &RgbaImage) -> Option<String> {
    use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::DataWriter;
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

    // SAFETY: prepara WinRT en este hilo; si ya lo estaba, devuelve un aviso que ignoramos.
    unsafe {
        let _ = RoInitialize(RO_INIT_MULTITHREADED);
    }
    let max = OcrEngine::MaxImageDimension().unwrap_or(2600).max(1000);
    let (w, h) = crate::capture::fit_within(image.width(), image.height(), max);
    let resized = if (w, h) == image.dimensions() {
        image.clone()
    } else {
        image::imageops::resize(image, w, h, image::imageops::FilterType::Triangle)
    };
    // Windows quiere los píxeles en BGRA.
    let mut bgra = resized.into_raw();
    for px in bgra.chunks_exact_mut(4) {
        px.swap(0, 2);
    }
    let writer = DataWriter::new().ok()?;
    writer.WriteBytes(&bgra).ok()?;
    let buffer = writer.DetachBuffer().ok()?;
    let bitmap =
        SoftwareBitmap::CreateCopyFromBuffer(&buffer, BitmapPixelFormat::Bgra8, w as i32, h as i32).ok()?;
    // El idioma de Windows; si no tiene OCR instalado, el primero que haya.
    let engine = OcrEngine::TryCreateFromUserProfileLanguages().ok().or_else(|| {
        let languages = OcrEngine::AvailableRecognizerLanguages().ok()?;
        (0..languages.Size().ok()?).find_map(|i| {
            let language = languages.GetAt(i).ok()?;
            OcrEngine::TryCreateFromLanguage(&language).ok()
        })
    })?;
    let result = engine.RecognizeAsync(&bitmap).ok()?.join().ok()?;
    let lines = result.Lines().ok()?;
    let mut out = Vec::new();
    for i in 0..lines.Size().ok()? {
        if let Ok(text) = lines.GetAt(i).and_then(|line| line.Text()) {
            out.push(text.to_string());
        }
    }
    Some(out.join("\n"))
}

#[cfg(target_os = "macos")]
fn recognize_impl(image: &RgbaImage) -> Option<String> {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::AnyThread;
    use objc2_foundation::{NSArray, NSData, NSDictionary, NSString};
    use objc2_vision::{
        VNImageRequestHandler, VNRecognizeTextRequest, VNRequest, VNRequestTextRecognitionLevel,
    };

    let mut png = std::io::Cursor::new(Vec::new());
    image.write_to(&mut png, image::ImageFormat::Png).ok()?;
    let data = NSData::with_bytes(png.get_ref());
    let options = NSDictionary::<NSString, AnyObject>::new();
    let handler = VNImageRequestHandler::initWithData_options(VNImageRequestHandler::alloc(), &data, &options);

    let request = VNRecognizeTextRequest::new();
    request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
    request.setUsesLanguageCorrection(true);
    let languages = NSArray::from_retained_slice(&[
        NSString::from_str("es-ES"),
        NSString::from_str("en-US"),
        NSString::from_str("fr-FR"),
        NSString::from_str("pt-BR"),
    ]);
    request.setRecognitionLanguages(&languages);
    let as_request: Retained<VNRequest> = Retained::into_super(Retained::into_super(request.clone()));
    handler
        .performRequests_error(&NSArray::from_retained_slice(&[as_request]))
        .ok()?;

    let mut out = Vec::new();
    for observation in request.results()?.iter() {
        if let Some(best) = observation.topCandidates(1).firstObject() {
            out.push(best.string().to_string());
        }
    }
    Some(out.join("\n"))
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn recognize_impl(_image: &RgbaImage) -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_collapses_blank_lines_and_spaces() {
        let text = "  Hola   mundo \n\n\n\nSegunda   línea\nTercera\n\n";
        assert_eq!(clean(text), "Hola mundo\n\nSegunda línea\nTercera");
    }

    #[test]
    fn clean_cuts_long_text() {
        let long = "a ".repeat(MAX_CHARS * 2);
        assert!(clean(&long).chars().count() <= MAX_CHARS + 1);
    }
}
