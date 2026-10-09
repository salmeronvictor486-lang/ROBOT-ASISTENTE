//! Motor propio de PDF: dibuja un `Document` (de Word, de texto o de imágenes) usando
//! las fuentes del sistema. Es el plan B cuando no hay Word, Pages ni LibreOffice, así
//! que la conversión siempre funciona.
//!
//! Las fuentes se incrustan recortadas (solo las letras usadas) y con su tabla Unicode,
//! así el PDF pesa poco y se puede copiar y buscar texto en él.

use std::collections::BTreeMap;
use std::io::Cursor;
use std::path::PathBuf;

use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, GenericImageView};
use pdf_writer::types::{CidFontType, FontFlags, SystemInfo, UnicodeCmap};
use pdf_writer::{Content, Filter, Finish, Name, Pdf, Rect, Ref, Str, TextStr};
use subsetter::GlyphRemapper;
use ttf_parser::Face;

use super::docx::{Align, Block, Document, Image, Inline, PageSetup, Paragraph, Table, TextStyle};
use crate::error::{AppError, AppResult};

/// Lado máximo de las imágenes incrustadas (más grande solo engorda el PDF).
const MAX_IMAGE_SIDE: u32 = 2000;
const TAB: f32 = 36.0;
/// Márgenes de las celdas de las tablas (los de Word: 0,19 cm a los lados).
const CELL_PAD_X: f32 = 5.4;
const CELL_PAD_Y: f32 = 1.5;

// ---------------------------------------------------------------------------
// Fuentes
// ---------------------------------------------------------------------------

/// Variantes de letra que usamos.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Variant {
    Regular = 0,
    Bold = 1,
    Italic = 2,
    BoldItalic = 3,
    Mono = 4,
}

fn variant(style: &TextStyle) -> Variant {
    match (style.mono, style.bold, style.italic) {
        (true, _, _) => Variant::Mono,
        (_, true, true) => Variant::BoldItalic,
        (_, true, false) => Variant::Bold,
        (_, false, true) => Variant::Italic,
        _ => Variant::Regular,
    }
}

/// Fuentes candidatas de cada sistema, por orden de preferencia (Calibri es la de Word).
fn font_candidates() -> [Vec<PathBuf>; 5] {
    let mut sets: [Vec<PathBuf>; 5] = Default::default();
    let mut add = |v: Variant, paths: &[&str]| sets[v as usize].extend(paths.iter().map(PathBuf::from));
    if cfg!(target_os = "windows") {
        let dir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".into());
        let f = |name: &str| format!("{dir}\\Fonts\\{name}");
        let reg = [f("calibri.ttf"), f("arial.ttf"), f("segoeui.ttf")];
        let bold = [f("calibrib.ttf"), f("arialbd.ttf"), f("segoeuib.ttf")];
        let it = [f("calibrii.ttf"), f("ariali.ttf"), f("segoeuii.ttf")];
        let bi = [f("calibriz.ttf"), f("arialbi.ttf"), f("segoeuiz.ttf")];
        let mono = [f("consola.ttf"), f("cour.ttf")];
        for (v, list) in [
            (Variant::Regular, &reg[..]),
            (Variant::Bold, &bold[..]),
            (Variant::Italic, &it[..]),
            (Variant::BoldItalic, &bi[..]),
            (Variant::Mono, &mono[..]),
        ] {
            add(v, &list.iter().map(String::as_str).collect::<Vec<_>>());
        }
    } else if cfg!(target_os = "macos") {
        let s = "/System/Library/Fonts/Supplemental/";
        let l = "/Library/Fonts/";
        add(Variant::Regular, &[&format!("{l}Microsoft/Calibri.ttf"), &format!("{s}Arial.ttf"), &format!("{s}Verdana.ttf")]);
        add(Variant::Bold, &[&format!("{l}Microsoft/Calibri Bold.ttf"), &format!("{s}Arial Bold.ttf"), &format!("{s}Verdana Bold.ttf")]);
        add(Variant::Italic, &[&format!("{l}Microsoft/Calibri Italic.ttf"), &format!("{s}Arial Italic.ttf"), &format!("{s}Verdana Italic.ttf")]);
        add(Variant::BoldItalic, &[&format!("{l}Microsoft/Calibri Bold Italic.ttf"), &format!("{s}Arial Bold Italic.ttf"), &format!("{s}Verdana Bold Italic.ttf")]);
        add(Variant::Mono, &[&format!("{s}Courier New.ttf"), &format!("{s}Andale Mono.ttf")]);
    } else {
        let d = "/usr/share/fonts/truetype/";
        add(Variant::Regular, &[&format!("{d}crosextra/Carlito-Regular.ttf"), &format!("{d}liberation/LiberationSans-Regular.ttf"), &format!("{d}dejavu/DejaVuSans.ttf")]);
        add(Variant::Bold, &[&format!("{d}crosextra/Carlito-Bold.ttf"), &format!("{d}liberation/LiberationSans-Bold.ttf"), &format!("{d}dejavu/DejaVuSans-Bold.ttf")]);
        add(Variant::Italic, &[&format!("{d}crosextra/Carlito-Italic.ttf"), &format!("{d}liberation/LiberationSans-Italic.ttf"), &format!("{d}dejavu/DejaVuSans-Oblique.ttf")]);
        add(Variant::BoldItalic, &[&format!("{d}crosextra/Carlito-BoldItalic.ttf"), &format!("{d}liberation/LiberationSans-BoldItalic.ttf"), &format!("{d}dejavu/DejaVuSans-BoldOblique.ttf")]);
        add(Variant::Mono, &[&format!("{d}liberation/LiberationMono-Regular.ttf"), &format!("{d}dejavu/DejaVuSansMono.ttf")]);
    }
    sets
}

/// Lee la primera fuente que exista (y sea TrueType de verdad) de cada variante.
fn load_font_files() -> AppResult<Vec<Option<Vec<u8>>>> {
    let files: Vec<Option<Vec<u8>>> = font_candidates()
        .iter()
        .map(|paths| {
            paths.iter().find_map(|p| {
                let data = std::fs::read(p).ok()?;
                Face::parse(&data, 0).ok()?;
                Some(data)
            })
        })
        .collect();
    if files[Variant::Regular as usize].is_none() {
        return Err(AppError::Convert("no encuentro ninguna fuente en el sistema".into()));
    }
    Ok(files)
}

struct Font<'a> {
    data: &'a [u8],
    face: Face<'a>,
    remapper: GlyphRemapper,
    /// Glifo nuevo → (texto que representa, ancho en unidades de la fuente).
    used: BTreeMap<u16, (String, u16)>,
    upem: f32,
}

impl<'a> Font<'a> {
    fn new(data: &'a [u8]) -> Option<Self> {
        let face = Face::parse(data, 0).ok()?;
        let upem = f32::from(face.units_per_em());
        Some(Self { data, face, remapper: GlyphRemapper::new(), used: BTreeMap::new(), upem })
    }

    fn advance(&self, c: char) -> f32 {
        let gid = self.face.glyph_index(c).unwrap_or_default();
        f32::from(self.face.glyph_hor_advance(gid).unwrap_or(0)) / self.upem
    }

    fn width(&self, text: &str, size: f32) -> f32 {
        text.chars().map(|c| self.advance(c)).sum::<f32>() * size
    }

    fn ascent(&self) -> f32 {
        f32::from(self.face.ascender()) / self.upem
    }

    fn descent(&self) -> f32 {
        f32::from(self.face.descender()).abs() / self.upem
    }

    fn line_gap(&self) -> f32 {
        f32::from(self.face.line_gap()) / self.upem
    }

    /// Códigos de 2 bytes (glifos recortados) para escribir `text`.
    fn encode(&mut self, text: &str) -> Vec<u8> {
        let mut out = Vec::with_capacity(text.len() * 2);
        for c in text.chars() {
            let gid = self.face.glyph_index(c).unwrap_or_default();
            let new = self.remapper.remap(gid.0);
            let advance = self.face.glyph_hor_advance(gid).unwrap_or(0);
            self.used.entry(new).or_insert_with(|| (c.to_string(), advance));
            out.extend_from_slice(&new.to_be_bytes());
        }
        out
    }
}

// ---------------------------------------------------------------------------
// Maquetación
// ---------------------------------------------------------------------------

/// Una pieza que no se parte: una palabra, un espacio, un tabulador o una imagen.
#[derive(Clone, Debug)]
enum Atom {
    Word { text: String, style: TextStyle, width: f32 },
    Space { style: TextStyle, width: f32 },
    Tab { style: TextStyle },
    Image { index: usize, width: f32, height: f32 },
    Break,
}

#[derive(Clone, Debug)]
struct Placed {
    atom: Atom,
    x: f32,
    width: f32,
}

#[derive(Clone, Debug, Default)]
struct Line {
    items: Vec<Placed>,
    /// Alto de la línea y distancia del borde superior a la línea base.
    height: f32,
    ascent: f32,
}

struct Fonts<'a> {
    list: Vec<Font<'a>>,
    /// Variante → índice en `list` (las que faltan usan la normal).
    map: [usize; 5],
}

impl<'a> Fonts<'a> {
    fn get(&self, style: &TextStyle) -> &Font<'a> {
        &self.list[self.map[variant(style) as usize]]
    }

    fn get_mut(&mut self, style: &TextStyle) -> (&mut Font<'a>, usize) {
        let index = self.map[variant(style) as usize];
        (&mut self.list[index], index)
    }
}

/// Imagen ya preparada para el PDF.
struct PdfImage {
    data: Vec<u8>,
    alpha: Option<Vec<u8>>,
    jpeg: bool,
    width: u32,
    height: u32,
}

fn prepare_image(image: &Image) -> Option<PdfImage> {
    let decoded = image::load_from_memory(&image.data).ok()?;
    let decoded = if decoded.width().max(decoded.height()) > MAX_IMAGE_SIDE {
        decoded.resize(MAX_IMAGE_SIDE, MAX_IMAGE_SIDE, image::imageops::FilterType::Triangle)
    } else {
        decoded
    };
    let (width, height) = decoded.dimensions();
    if decoded.color().has_alpha() {
        let rgba = decoded.to_rgba8();
        let mut rgb = Vec::with_capacity((width * height * 3) as usize);
        let mut alpha = Vec::with_capacity((width * height) as usize);
        for px in rgba.pixels() {
            rgb.extend_from_slice(&px.0[..3]);
            alpha.push(px.0[3]);
        }
        let opaque = alpha.iter().all(|a| *a == 255);
        Some(PdfImage {
            data: miniz_oxide::deflate::compress_to_vec_zlib(&rgb, 6),
            alpha: (!opaque).then(|| miniz_oxide::deflate::compress_to_vec_zlib(&alpha, 6)),
            jpeg: false,
            width,
            height,
        })
    } else {
        let rgb = DynamicImage::ImageRgb8(decoded.to_rgb8());
        let mut bytes = Cursor::new(Vec::new());
        JpegEncoder::new_with_quality(&mut bytes, 88).encode_image(&rgb).ok()?;
        Some(PdfImage { data: bytes.into_inner(), alpha: None, jpeg: true, width, height })
    }
}

struct Writer<'a> {
    fonts: Fonts<'a>,
    page: PageSetup,
    images: Vec<PdfImage>,
    /// Páginas terminadas: contenido e imágenes que usan.
    pages: Vec<(Vec<u8>, Vec<usize>)>,
    content: Content,
    page_images: Vec<usize>,
    /// Distancia desde arriba de la página a donde toca escribir.
    y: f32,
    started: bool,
    /// Estilo y espacio final del párrafo anterior (para el espaciado contextual).
    previous: Option<(Option<String>, f32)>,
}

impl<'a> Writer<'a> {
    fn content_width(&self) -> f32 {
        (self.page.width - self.page.margin_left - self.page.margin_right).max(72.0)
    }

    fn bottom(&self) -> f32 {
        self.page.height - self.page.margin_bottom
    }

    fn new_page(&mut self) {
        let content = std::mem::replace(&mut self.content, Content::new());
        self.pages.push((content.finish().into_vec(), std::mem::take(&mut self.page_images)));
        self.y = self.page.margin_top;
        self.started = false;
    }

    /// Divide un párrafo en piezas.
    fn atoms(&mut self, p: &Paragraph) -> Vec<Atom> {
        let mut atoms = Vec::new();
        for inline in &p.inlines {
            match inline {
                Inline::Text(text, style) => {
                    let font = self.fonts.get(style);
                    let mut word = String::new();
                    let flush = |word: &mut String, atoms: &mut Vec<Atom>| {
                        if !word.is_empty() {
                            let width = font.width(word, style.size);
                            atoms.push(Atom::Word { text: std::mem::take(word), style: style.clone(), width });
                        }
                    };
                    for c in text.chars() {
                        match c {
                            ' ' | '\u{a0}' => {
                                flush(&mut word, &mut atoms);
                                atoms.push(Atom::Space { style: style.clone(), width: font.width(" ", style.size) });
                            }
                            '\t' => {
                                flush(&mut word, &mut atoms);
                                atoms.push(Atom::Tab { style: style.clone() });
                            }
                            '\n' | '\r' => {
                                flush(&mut word, &mut atoms);
                                atoms.push(Atom::Break);
                            }
                            c if c.is_control() => {}
                            c => word.push(c),
                        }
                    }
                    flush(&mut word, &mut atoms);
                }
                Inline::Tab => atoms.push(Atom::Tab { style: last_style(p) }),
                Inline::Break => atoms.push(Atom::Break),
                Inline::Image(image) => {
                    if let Some(prepared) = prepare_image(image) {
                        self.images.push(prepared);
                        atoms.push(Atom::Image { index: self.images.len() - 1, width: image.width, height: image.height });
                    }
                }
            }
        }
        atoms
    }

    /// Altura y ascenso de una línea de texto con este estilo.
    fn text_metrics(&self, style: &TextStyle, line: f32) -> (f32, f32) {
        let font = self.fonts.get(style);
        let natural = (font.ascent() + font.descent() + font.line_gap()) * style.size;
        let height = natural * line;
        // El espacio extra del interlineado va encima del texto, como en Word.
        (height, height - font.descent() * style.size)
    }

    /// Reparte las piezas en líneas de `width` puntos (la primera puede empezar más a la derecha).
    fn break_lines(&self, atoms: Vec<Atom>, width: f32, first_offset: f32, line: f32, fallback: &TextStyle) -> Vec<Line> {
        let mut lines = Vec::new();
        let mut current = Line::default();
        let mut x = first_offset;
        let max_image_h = (self.bottom() - self.page.margin_top).max(72.0);
        let finish = |current: &mut Line, lines: &mut Vec<Line>, writer: &Writer| {
            // Quitamos los espacios del final (no ocupan sitio visible).
            while matches!(current.items.last(), Some(Placed { atom: Atom::Space { .. }, .. })) {
                current.items.pop();
            }
            let (mut height, mut ascent) = writer.text_metrics(fallback, line);
            let mut has_text = false;
            for item in &current.items {
                match &item.atom {
                    Atom::Word { style, .. } | Atom::Space { style, .. } | Atom::Tab { style } => {
                        let (h, a) = writer.text_metrics(style, line);
                        if !has_text {
                            height = h;
                            ascent = a;
                            has_text = true;
                        } else {
                            height = height.max(h);
                            ascent = ascent.max(a);
                        }
                    }
                    Atom::Image { height: ih, .. } => {
                        let extra = height - ascent;
                        ascent = ascent.max(*ih);
                        height = height.max(ascent + extra);
                    }
                    Atom::Break => {}
                }
            }
            current.height = height;
            current.ascent = ascent;
            lines.push(std::mem::take(current));
        };
        for atom in atoms {
            let limit = if lines.is_empty() { width - first_offset } else { width };
            let start = if lines.is_empty() { first_offset } else { 0.0 };
            match atom {
                Atom::Break => {
                    current.items.push(Placed { atom: Atom::Break, x, width: 0.0 });
                    finish(&mut current, &mut lines, self);
                    x = 0.0;
                }
                Atom::Space { ref style, width: w } => {
                    if current.items.is_empty() && !lines.is_empty() {
                        continue;
                    }
                    let _ = style;
                    current.items.push(Placed { atom, x, width: w });
                    x += w;
                }
                Atom::Tab { ref style } => {
                    let next = ((x / TAB).floor() + 1.0) * TAB;
                    let _ = style;
                    current.items.push(Placed { atom, x, width: next - x });
                    x = next;
                }
                Atom::Word { ref text, ref style, width: w } => {
                    if x + w > start + limit && !current.items.is_empty() {
                        finish(&mut current, &mut lines, self);
                        x = 0.0;
                    }
                    let room = if lines.is_empty() { width - first_offset } else { width };
                    if w > room {
                        // Palabra más larga que la línea (enlaces, códigos): la partimos.
                        let font = self.fonts.get(style);
                        let mut piece = String::new();
                        for c in text.chars() {
                            let candidate = font.width(&format!("{piece}{c}"), style.size);
                            if x + candidate > width && !piece.is_empty() {
                                let pw = font.width(&piece, style.size);
                                current.items.push(Placed {
                                    atom: Atom::Word { text: std::mem::take(&mut piece), style: style.clone(), width: pw },
                                    x,
                                    width: pw,
                                });
                                finish(&mut current, &mut lines, self);
                                x = 0.0;
                            }
                            piece.push(c);
                        }
                        let pw = font.width(&piece, style.size);
                        current.items.push(Placed { atom: Atom::Word { text: piece, style: style.clone(), width: pw }, x, width: pw });
                        x += pw;
                    } else {
                        current.items.push(Placed { atom: atom.clone(), x, width: w });
                        x += w;
                    }
                }
                Atom::Image { index, width: iw, height: ih } => {
                    // Las imágenes demasiado grandes se encogen para caber.
                    let scale = (width / iw).min(max_image_h / ih).min(1.0);
                    let (iw, ih) = (iw * scale, ih * scale);
                    if x + iw > width && !current.items.is_empty() {
                        finish(&mut current, &mut lines, self);
                        x = 0.0;
                    }
                    current.items.push(Placed { atom: Atom::Image { index, width: iw, height: ih }, x, width: iw });
                    x += iw;
                }
            }
        }
        if !current.items.is_empty() || lines.is_empty() {
            finish(&mut current, &mut lines, self);
        }
        lines
    }

    /// Dibuja una línea con su esquina superior izquierda en (`left`, `top`).
    fn draw_line(&mut self, line: &Line, left: f32, top: f32, align: Align, width: f32, last: bool) {
        let used = line.items.iter().map(|i| i.x + i.width).fold(0.0f32, f32::max);
        let first_x = line.items.first().map_or(0.0, |i| i.x);
        let free = (width - used).max(0.0);
        let ends_with_break = matches!(line.items.last(), Some(Placed { atom: Atom::Break, .. }));
        let (shift, gap) = match align {
            Align::Center => (free / 2.0, 0.0),
            Align::Right => (free, 0.0),
            Align::Justify if !last && !ends_with_break => {
                let spaces = line.items.iter().filter(|i| matches!(i.atom, Atom::Space { .. })).count();
                (0.0, if spaces > 0 { free / spaces as f32 } else { 0.0 })
            }
            _ => (0.0, 0.0),
        };
        let _ = first_x;
        let baseline = self.page.height - (top + line.ascent);
        let mut extra = 0.0;
        for item in &line.items {
            let x = left + shift + item.x + extra;
            match &item.atom {
                Atom::Space { .. } => extra += gap,
                Atom::Word { text, style, width: w } => {
                    let color = style.color.unwrap_or([0, 0, 0]);
                    let (r, g, b) = (f32::from(color[0]) / 255.0, f32::from(color[1]) / 255.0, f32::from(color[2]) / 255.0);
                    let (font, index) = self.fonts.get_mut(style);
                    let bytes = font.encode(text);
                    let name = format!("F{index}");
                    self.content.set_fill_rgb(r, g, b);
                    self.content
                        .begin_text()
                        .set_font(Name(name.as_bytes()), style.size)
                        .set_text_matrix([1.0, 0.0, 0.0, 1.0, x, baseline])
                        .show(Str(&bytes))
                        .end_text();
                    if style.underline || style.strike {
                        let y = if style.underline { baseline - style.size * 0.12 } else { baseline + style.size * 0.3 };
                        self.content
                            .set_stroke_rgb(r, g, b)
                            .set_line_width((style.size * 0.06).max(0.4))
                            .move_to(x, y)
                            .line_to(x + w, y)
                            .stroke();
                    }
                }
                Atom::Image { index, width: w, height: h } => {
                    let name = format!("Im{index}");
                    self.content
                        .save_state()
                        .transform([*w, 0.0, 0.0, *h, x, baseline])
                        .x_object(Name(name.as_bytes()))
                        .restore_state();
                    if !self.page_images.contains(index) {
                        self.page_images.push(*index);
                    }
                }
                Atom::Tab { .. } | Atom::Break => {}
            }
        }
    }

    fn paragraph_lines(&mut self, p: &Paragraph, width: f32) -> (Vec<Line>, f32, Option<(String, f32)>) {
        let atoms = self.atoms(p);
        let fallback = first_style(p);
        // Viñeta o número: va colgando a la izquierda del texto.
        let marker = p.marker.as_ref().map(|m| {
            let w = self.fonts.get(&fallback).width(m, fallback.size);
            (m.clone(), w)
        });
        let first_offset = match &marker {
            Some((_, mw)) => (p.indent_first.min(0.0) + mw + 6.0).max(0.0),
            None => p.indent_first,
        }
        .clamp(-p.indent_left, width * 0.5);
        let lines = self.break_lines(atoms, width, first_offset.max(0.0), p.line.max(0.5), &fallback);
        (lines, first_offset, marker)
    }

    fn paragraph(&mut self, p: &Paragraph) {
        let left = self.page.margin_left + p.indent_left;
        let width = (self.content_width() - p.indent_left).max(36.0);
        let (lines, first_offset, marker) = self.paragraph_lines(p, width);
        // Espaciado contextual: dos párrafos seguidos del mismo estilo (una lista) van juntos.
        let joined = p.contextual
            && matches!(&self.previous, Some((style, _)) if style.is_some() && *style == p.style);
        if joined {
            if let Some((_, after)) = &self.previous {
                self.y -= after;
            }
        } else if self.started {
            self.y += p.space_before;
        }
        // Un título nunca se queda solo al final de una página.
        if p.heading > 0 {
            let needed: f32 = lines.iter().map(|l| l.height).sum::<f32>() + 40.0;
            if self.y + needed > self.bottom() && self.started {
                self.new_page();
            }
        }
        let count = lines.len();
        for (i, line) in lines.iter().enumerate() {
            if self.y + line.height > self.bottom() && self.started {
                self.new_page();
            }
            let line_left = if i == 0 { left + first_offset.min(0.0) } else { left };
            if i == 0 {
                if let Some((text, _)) = &marker {
                    let style = first_style(p);
                    let x = left + p.indent_first.min(0.0);
                    let marker_line = Line {
                        items: vec![Placed { atom: Atom::Word { text: text.clone(), style: style.clone(), width: 0.0 }, x: 0.0, width: 0.0 }],
                        ..line.clone()
                    };
                    self.draw_line(&marker_line, x, self.y, Align::Left, width, true);
                }
            }
            self.draw_line(line, line_left, self.y, p.align, width, i + 1 == count);
            self.y += line.height;
            self.started = true;
        }
        self.y += p.space_after;
        self.previous = Some((p.style.clone(), p.space_after));
    }

    fn table(&mut self, table: &Table) {
        let width = self.content_width();
        let grid = table
            .rows
            .iter()
            .map(|r| r.iter().map(|c| c.span.max(1)).sum::<usize>())
            .max()
            .unwrap_or(1)
            .max(table.columns.len())
            .max(1);
        let mut columns: Vec<f32> = if table.columns.len() == grid && table.columns.iter().all(|w| *w > 0.0) {
            table.columns.clone()
        } else {
            vec![width / grid as f32; grid]
        };
        let total: f32 = columns.iter().sum();
        if total > width {
            columns.iter_mut().for_each(|w| *w *= width / total);
        }
        let left = self.page.margin_left;
        if self.started {
            self.y += 4.0;
        }
        for row in &table.rows {
            // Primero maquetamos cada celda para saber el alto de la fila.
            let mut col = 0;
            let mut cells = Vec::new();
            for cell in row {
                let span = cell.span.max(1).min(grid - col.min(grid - 1));
                let x = left + columns[..col.min(grid)].iter().sum::<f32>();
                let w: f32 = columns[col.min(grid - 1)..(col + span).min(grid)].iter().sum();
                let inner = (w - CELL_PAD_X * 2.0).max(12.0);
                let mut laid = Vec::new();
                let count = cell.paragraphs.len();
                for (i, p) in cell.paragraphs.iter().enumerate() {
                    // En las tablas Word quita el espacio extra (estilo "Tabla con cuadrícula").
                    let p = Paragraph { line: p.line.min(1.0), ..p.clone() };
                    let (lines, _, _) = self.paragraph_lines(&p, inner);
                    let after = if i + 1 == count { 0.0 } else { p.space_after.min(6.0) };
                    laid.push((p.align, lines, after));
                }
                cells.push((x, w, inner, laid));
                col += span;
            }
            let row_h = cells
                .iter()
                .map(|(_, _, _, laid)| laid.iter().map(|(_, ls, sa)| ls.iter().map(|l| l.height).sum::<f32>() + sa).sum::<f32>())
                .fold(0.0f32, f32::max)
                + CELL_PAD_Y * 2.0;
            // Fila más alta que una página entera (formularios, CV maquetados con tablas):
            // no cabe en ningún sitio, así que su contenido sigue como texto normal por las
            // páginas que haga falta, en vez de cortarse.
            let page_room = self.bottom() - self.page.margin_top;
            if row_h > page_room {
                for cell in row {
                    for p in &cell.paragraphs {
                        self.paragraph(p);
                    }
                }
                self.previous = None;
                continue;
            }
            if self.y + row_h > self.bottom() && self.started {
                self.new_page();
            }
            let top = self.y;
            for (x, w, inner, laid) in cells {
                let mut y = top + CELL_PAD_Y;
                for (align, lines, space_after) in laid {
                    let count = lines.len();
                    for (i, line) in lines.iter().enumerate() {
                        self.draw_line(line, x + CELL_PAD_X, y, align, inner, i + 1 == count);
                        y += line.height;
                    }
                    y += space_after;
                }
                self.content
                    .set_stroke_rgb(0.62, 0.62, 0.62)
                    .set_line_width(0.5)
                    .rect(x, self.page.height - top - row_h, w, row_h)
                    .stroke();
            }
            self.y = top + row_h;
            self.started = true;
        }
        self.y += 8.0;
    }

    fn finish(mut self, title: &str) -> AppResult<Vec<u8>> {
        if self.started || self.pages.is_empty() {
            self.new_page();
        }
        let mut pdf = Pdf::new();
        let mut next = 1;
        let mut alloc = || {
            let r = Ref::new(next);
            next += 1;
            r
        };
        let catalog = alloc();
        let tree = alloc();
        let info = alloc();
        let page_refs: Vec<(Ref, Ref)> = self.pages.iter().map(|_| (alloc(), alloc())).collect();
        let font_refs: Vec<[Ref; 5]> = self.fonts.list.iter().map(|_| [alloc(), alloc(), alloc(), alloc(), alloc()]).collect();
        let image_refs: Vec<(Ref, Ref)> = self.images.iter().map(|_| (alloc(), alloc())).collect();

        pdf.catalog(catalog).pages(tree);
        pdf.pages(tree).kids(page_refs.iter().map(|(p, _)| *p)).count(page_refs.len() as i32);
        pdf.document_info(info).title(TextStr(title)).producer(TextStr("Tico"));

        for ((content, images), (page_ref, content_ref)) in self.pages.iter().zip(&page_refs) {
            let mut page = pdf.page(*page_ref);
            page.media_box(Rect::new(0.0, 0.0, self.page.width, self.page.height))
                .parent(tree)
                .contents(*content_ref);
            let mut resources = page.resources();
            let mut fonts = resources.fonts();
            for (i, refs) in font_refs.iter().enumerate() {
                fonts.pair(Name(format!("F{i}").as_bytes()), refs[0]);
            }
            fonts.finish();
            let mut objects = resources.x_objects();
            for index in images {
                objects.pair(Name(format!("Im{index}").as_bytes()), image_refs[*index].0);
            }
            objects.finish();
            resources.finish();
            page.finish();
            let compressed = miniz_oxide::deflate::compress_to_vec_zlib(content, 6);
            pdf.stream(*content_ref, &compressed).filter(Filter::FlateDecode);
        }

        for (i, font) in self.fonts.list.iter().enumerate() {
            write_font(&mut pdf, font, &font_refs[i], i)?;
        }

        for (image, (image_ref, mask_ref)) in self.images.iter().zip(&image_refs) {
            let mut x = pdf.image_xobject(*image_ref, &image.data);
            x.filter(if image.jpeg { Filter::DctDecode } else { Filter::FlateDecode });
            x.width(image.width as i32).height(image.height as i32);
            x.color_space().device_rgb();
            x.bits_per_component(8);
            if image.alpha.is_some() {
                x.s_mask(*mask_ref);
            }
            x.finish();
            if let Some(alpha) = &image.alpha {
                let mut m = pdf.image_xobject(*mask_ref, alpha);
                m.filter(Filter::FlateDecode);
                m.width(image.width as i32).height(image.height as i32);
                m.color_space().device_gray();
                m.bits_per_component(8);
                m.finish();
            }
        }
        Ok(pdf.finish())
    }
}

fn first_style(p: &Paragraph) -> TextStyle {
    p.inlines
        .iter()
        .find_map(|i| match i {
            Inline::Text(_, s) => Some(s.clone()),
            _ => None,
        })
        .unwrap_or_default()
}

fn last_style(p: &Paragraph) -> TextStyle {
    p.inlines
        .iter()
        .rev()
        .find_map(|i| match i {
            Inline::Text(_, s) => Some(s.clone()),
            _ => None,
        })
        .unwrap_or_default()
}

/// Escribe una fuente recortada (Type0 + CIDFontType2) con su tabla Unicode.
fn write_font(pdf: &mut Pdf, font: &Font, refs: &[Ref; 5], index: usize) -> AppResult<()> {
    let [type0, cid, descriptor, file, cmap_ref] = *refs;
    let subset = subsetter::subset(font.data, 0, &font.remapper)
        .map_err(|e| AppError::Convert(format!("no he podido preparar la fuente ({e})")))?;
    let postscript = font
        .face
        .names()
        .into_iter()
        .find(|n| n.name_id == ttf_parser::name_id::POST_SCRIPT_NAME)
        .and_then(|n| n.to_string())
        .unwrap_or_else(|| format!("TicoFont{index}"))
        .replace(|c: char| !c.is_ascii_alphanumeric() && c != '-', "");
    // Prefijo de 6 letras: así se marcan las fuentes recortadas.
    let base = format!("TICO{}{}+{postscript}", (b'A' + (index as u8 % 26)) as char, (b'A' + (index as u8 / 26)) as char);
    let system = SystemInfo { registry: Str(b"Adobe"), ordering: Str(b"Identity"), supplement: 0 };

    pdf.type0_font(type0)
        .base_font(Name(base.as_bytes()))
        .encoding_predefined(Name(b"Identity-H"))
        .descendant_font(cid)
        .to_unicode(cmap_ref);

    let scale = 1000.0 / font.upem;
    let mut cid_font = pdf.cid_font(cid);
    cid_font
        .subtype(CidFontType::Type2)
        .base_font(Name(base.as_bytes()))
        .system_info(system)
        .font_descriptor(descriptor)
        .default_width(0.0)
        .cid_to_gid_map_predefined(Name(b"Identity"));
    let mut widths = cid_font.widths();
    for (gid, (_, advance)) in &font.used {
        widths.consecutive(*gid, [f32::from(*advance) * scale]);
    }
    widths.finish();
    cid_font.finish();

    let bbox = font.face.global_bounding_box();
    let italic = font.face.is_italic();
    let mut flags = FontFlags::NON_SYMBOLIC;
    if italic {
        flags |= FontFlags::ITALIC;
    }
    if font.face.is_monospaced() {
        flags |= FontFlags::FIXED_PITCH;
    }
    pdf.font_descriptor(descriptor)
        .name(Name(base.as_bytes()))
        .flags(flags)
        .bbox(Rect::new(
            f32::from(bbox.x_min) * scale,
            f32::from(bbox.y_min) * scale,
            f32::from(bbox.x_max) * scale,
            f32::from(bbox.y_max) * scale,
        ))
        .italic_angle(font.face.italic_angle())
        .ascent(f32::from(font.face.ascender()) * scale)
        .descent(f32::from(font.face.descender()) * scale)
        .cap_height(f32::from(font.face.capital_height().unwrap_or(font.face.ascender())) * scale)
        .stem_v(80.0)
        .font_file2(file);

    let compressed = miniz_oxide::deflate::compress_to_vec_zlib(&subset, 6);
    pdf.stream(file, &compressed)
        .filter(Filter::FlateDecode)
        .pair(Name(b"Length1"), subset.len() as i32);

    let mut cmap = UnicodeCmap::new(Name(b"Tico-UTF16"), system);
    for (gid, (text, _)) in &font.used {
        if let Some(c) = text.chars().next() {
            cmap.pair(*gid, c);
        }
    }
    pdf.cmap(cmap_ref, &cmap.finish());
    Ok(())
}

/// Convierte un documento en PDF (bytes).
pub fn render(doc: &Document, title: &str) -> AppResult<Vec<u8>> {
    let files = load_font_files()?;
    let mut list = Vec::new();
    let mut map = [0usize; 5];
    let regular = files[Variant::Regular as usize].as_deref().unwrap_or_default();
    list.push(Font::new(regular).ok_or_else(|| AppError::Convert("fuente ilegible".into()))?);
    for v in [Variant::Bold, Variant::Italic, Variant::BoldItalic, Variant::Mono] {
        if let Some(font) = files[v as usize].as_deref().and_then(Font::new) {
            list.push(font);
            map[v as usize] = list.len() - 1;
        }
    }
    let mut writer = Writer {
        fonts: Fonts { list, map },
        page: doc.page,
        images: Vec::new(),
        pages: Vec::new(),
        content: Content::new(),
        page_images: Vec::new(),
        y: doc.page.margin_top,
        started: false,
        previous: None,
    };
    for block in &doc.blocks {
        match block {
            Block::Paragraph(p) => writer.paragraph(p),
            Block::Table(t) => {
                writer.previous = None;
                writer.table(t);
            }
            Block::PageBreak => {
                writer.previous = None;
                writer.new_page();
            }
        }
    }
    writer.finish(title)
}

// ---------------------------------------------------------------------------
// Otros orígenes: texto, Markdown e imágenes
// ---------------------------------------------------------------------------

fn text_paragraph(text: &str, style: TextStyle) -> Paragraph {
    Paragraph {
        inlines: vec![Inline::Text(text.to_string(), style)],
        line: 1.15,
        space_after: 2.0,
        ..Paragraph::default()
    }
}

/// Texto con **negritas** y `código` (lo básico de Markdown).
fn markdown_inlines(text: &str, base: &TextStyle) -> Vec<Inline> {
    let mut out = Vec::new();
    let mut style = base.clone();
    let mut buf = String::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        let toggle = if c == '*' && chars.peek() == Some(&'*') {
            chars.next();
            Some("bold")
        } else if c == '`' {
            Some("code")
        } else {
            None
        };
        match toggle {
            Some(kind) => {
                if !buf.is_empty() {
                    out.push(Inline::Text(std::mem::take(&mut buf), style.clone()));
                }
                if kind == "bold" {
                    style.bold = !style.bold;
                } else {
                    style.mono = !style.mono;
                }
            }
            None => buf.push(c),
        }
    }
    if !buf.is_empty() {
        out.push(Inline::Text(buf, style));
    }
    out
}

/// Documento a partir de texto plano o Markdown.
pub fn document_from_text(text: &str, markdown: bool) -> Document {
    let base = TextStyle { size: 11.0, ..TextStyle::default() };
    let mut blocks = Vec::new();
    let mut in_code = false;
    for raw in text.lines() {
        let line = raw.trim_end();
        if markdown && line.trim_start().starts_with("```") {
            in_code = !in_code;
            continue;
        }
        if !markdown || in_code {
            let style = TextStyle { mono: in_code, size: if in_code { 9.5 } else { 11.0 }, ..TextStyle::default() };
            blocks.push(Block::Paragraph(text_paragraph(if line.is_empty() { " " } else { line }, style)));
            continue;
        }
        let trimmed = line.trim_start();
        let level = trimmed.chars().take_while(|c| *c == '#').count();
        if (1..=6).contains(&level) && trimmed[level..].starts_with(' ') {
            let size = [22.0, 17.0, 14.0, 12.5, 12.0, 11.0][level - 1];
            let style = TextStyle { bold: true, size, ..TextStyle::default() };
            blocks.push(Block::Paragraph(Paragraph {
                inlines: markdown_inlines(trimmed[level..].trim(), &style),
                heading: level as u8,
                space_before: 10.0,
                space_after: 4.0,
                line: 1.1,
                ..Paragraph::default()
            }));
        } else if let Some(item) = trimmed.strip_prefix("- ").or_else(|| trimmed.strip_prefix("* ")) {
            blocks.push(Block::Paragraph(Paragraph {
                inlines: markdown_inlines(item, &base),
                marker: Some("•".into()),
                indent_left: 24.0,
                indent_first: -14.0,
                line: 1.15,
                space_after: 2.0,
                ..Paragraph::default()
            }));
        } else if line.is_empty() {
            blocks.push(Block::Paragraph(text_paragraph(" ", base.clone())));
        } else {
            blocks.push(Block::Paragraph(Paragraph {
                inlines: markdown_inlines(line, &base),
                line: 1.15,
                space_after: 4.0,
                ..Paragraph::default()
            }));
        }
    }
    Document { page: PageSetup::default(), blocks }
}

/// Documento con una imagen por página.
pub fn document_from_images(images: Vec<Vec<u8>>) -> AppResult<Document> {
    let page = PageSetup { margin_top: 36.0, margin_right: 36.0, margin_bottom: 36.0, margin_left: 36.0, ..PageSetup::default() };
    let mut blocks = Vec::new();
    for (i, data) in images.into_iter().enumerate() {
        let (w, h) = image::load_from_memory(&data)
            .map_err(|e| AppError::Convert(format!("imagen ilegible ({e})")))?
            .dimensions();
        if i > 0 {
            blocks.push(Block::PageBreak);
        }
        blocks.push(Block::Paragraph(Paragraph {
            inlines: vec![Inline::Image(Image { data, width: w as f32, height: h as f32 })],
            align: Align::Center,
            line: 1.0,
            ..Paragraph::default()
        }));
    }
    Ok(Document { page, blocks })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::convert::docx;

    fn has_fonts() -> bool {
        load_font_files().is_ok()
    }

    #[test]
    fn renders_text_document() {
        if !has_fonts() {
            return;
        }
        let doc = document_from_text("# Título\n\nHola **mundo**, esto es `código`.\n- uno\n- dos\n\n```\nfn main() {}\n```", true);
        let pdf = render(&doc, "Prueba").unwrap();
        assert!(pdf.starts_with(b"%PDF-"));
        assert!(pdf.len() > 1000);
        // Las fuentes van recortadas: el PDF debe ser pequeño.
        assert!(pdf.len() < 400_000, "PDF demasiado grande: {} bytes", pdf.len());
    }

    #[test]
    fn renders_docx_with_tables_lists_and_images() {
        if !has_fonts() {
            return;
        }
        let long = "palabra ".repeat(400);
        let body = format!(
            r#"<w:p><w:pPr><w:pStyle w:val="Ttulo1"/></w:pPr><w:r><w:t>Informe</w:t></w:r></w:p>
            <w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r><w:t>{long}</w:t></w:r></w:p>
            <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Primero</w:t></w:r></w:p>
            <w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B con texto largo {long}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
            <w:p><w:r><w:br w:type="page"/><w:t>Última página</w:t></w:r></w:p>"#
        );
        let doc = docx::parse(&docx::tests::make_docx(&body)).unwrap();
        let pdf = render(&doc, "Informe").unwrap();
        assert!(pdf.starts_with(b"%PDF-"));
        let pages = String::from_utf8_lossy(&pdf).matches("/Type /Page\n").count()
            + String::from_utf8_lossy(&pdf).matches("/Type /Page>>").count()
            + String::from_utf8_lossy(&pdf).matches("/Type /Page ").count();
        assert!(pages >= 2, "esperaba varias páginas, hay {pages}");
    }

    #[test]
    fn huge_table_row_flows_across_pages() {
        if !has_fonts() {
            return;
        }
        let paragraph = |i: usize| Paragraph {
            inlines: vec![Inline::Text(format!("Línea {i}"), TextStyle::default())],
            line: 1.0,
            ..Paragraph::default()
        };
        let cell = super::super::docx::Cell { paragraphs: (0..300).map(paragraph).collect(), span: 1 };
        let doc = Document {
            page: PageSetup::default(),
            blocks: vec![Block::Table(Table { columns: Vec::new(), rows: vec![vec![cell]] })],
        };
        let pdf = render(&doc, "Tabla").unwrap();
        let text = String::from_utf8_lossy(&pdf);
        let pages = text.matches("/Type /Page").count() - text.matches("/Type /Pages").count();
        assert!(pages >= 5, "solo {pages} páginas: se ha cortado la fila");
    }

    #[test]
    fn renders_images() {
        if !has_fonts() {
            return;
        }
        let mut png = Cursor::new(Vec::new());
        image::RgbaImage::from_pixel(300, 200, image::Rgba([200, 30, 30, 128]))
            .write_to(&mut png, image::ImageFormat::Png)
            .unwrap();
        let mut jpg = Cursor::new(Vec::new());
        image::RgbImage::from_pixel(4000, 1000, image::Rgb([30, 30, 200]))
            .write_to(&mut jpg, image::ImageFormat::Jpeg)
            .unwrap();
        let doc = document_from_images(vec![png.into_inner(), jpg.into_inner()]).unwrap();
        let pdf = render(&doc, "Imágenes").unwrap();
        let text = String::from_utf8_lossy(&pdf);
        assert!(text.contains("/SMask"));
        assert!(text.contains("/DCTDecode"));
    }

    #[test]
    fn markdown_inlines_toggle_styles() {
        let inlines = markdown_inlines("a **b** `c`", &TextStyle::default());
        let styles: Vec<(String, bool, bool)> = inlines
            .iter()
            .filter_map(|i| match i {
                Inline::Text(t, s) => Some((t.clone(), s.bold, s.mono)),
                _ => None,
            })
            .collect();
        assert_eq!(
            styles,
            vec![("a ".into(), false, false), ("b".into(), true, false), (" ".into(), false, false), ("c".into(), false, true)]
        );
    }
}
