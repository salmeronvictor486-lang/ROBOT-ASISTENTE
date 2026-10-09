//! Lector de documentos de Word (.docx). Saca el contenido con su formato básico
//! (estilos, títulos, negritas, listas, tablas, imágenes y tamaño de página) para
//! convertirlo a PDF con el motor propio o para leerlo en el chat.
//!
//! Un .docx es un zip con XML dentro: `word/document.xml` (el texto), `styles.xml`
//! (los estilos), `numbering.xml` (las listas) y las imágenes en `word/media/`.

use std::collections::HashMap;
use std::io::{Cursor, Read, Seek};

use quick_xml::events::{BytesStart, Event};
use quick_xml::name::QName;
use quick_xml::Reader;

use crate::error::{AppError, AppResult};

/// Medidas en puntos (1/72 de pulgada), como en PDF.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PageSetup {
    pub width: f32,
    pub height: f32,
    pub margin_top: f32,
    pub margin_right: f32,
    pub margin_bottom: f32,
    pub margin_left: f32,
}

impl Default for PageSetup {
    /// A4 con márgenes de 2,5 cm.
    fn default() -> Self {
        Self {
            width: 595.28,
            height: 841.89,
            margin_top: 70.87,
            margin_right: 70.87,
            margin_bottom: 70.87,
            margin_left: 70.87,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Align {
    #[default]
    Left,
    Center,
    Right,
    Justify,
}

/// Formato de un trozo de texto.
#[derive(Clone, Debug, PartialEq)]
pub struct TextStyle {
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub strike: bool,
    /// Tamaño en puntos.
    pub size: f32,
    pub color: Option<[u8; 3]>,
    /// Letra de ancho fijo (código).
    pub mono: bool,
}

impl Default for TextStyle {
    fn default() -> Self {
        Self { bold: false, italic: false, underline: false, strike: false, size: 11.0, color: None, mono: false }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Inline {
    Text(String, TextStyle),
    Tab,
    Break,
    Image(Image),
}

#[derive(Clone, Debug, PartialEq)]
pub struct Image {
    /// Bytes del archivo (PNG, JPEG…).
    pub data: Vec<u8>,
    /// Tamaño en el documento, en puntos.
    pub width: f32,
    pub height: f32,
}

#[derive(Clone, Debug, PartialEq, Default)]
pub struct Paragraph {
    pub inlines: Vec<Inline>,
    pub align: Align,
    /// 0 = texto normal; 1–6 = título.
    pub heading: u8,
    pub space_before: f32,
    pub space_after: f32,
    /// Interlineado como múltiplo del tamaño de letra (1.0 = sencillo).
    pub line: f32,
    pub indent_left: f32,
    pub indent_first: f32,
    /// Viñeta o número de lista ("•", "1.", "a)").
    pub marker: Option<String>,
    /// Estilo de párrafo (para el "espaciado contextual" de Word).
    pub style: Option<String>,
    /// Sin espacio entre párrafos seguidos del mismo estilo (típico de las listas).
    pub contextual: bool,
}

impl Paragraph {
    pub fn text(&self) -> String {
        let mut out = String::new();
        for inline in &self.inlines {
            match inline {
                Inline::Text(t, _) => out.push_str(t),
                Inline::Tab => out.push('\t'),
                Inline::Break => out.push('\n'),
                Inline::Image(_) => {}
            }
        }
        out
    }
}

#[derive(Clone, Debug, PartialEq, Default)]
pub struct Cell {
    pub paragraphs: Vec<Paragraph>,
    /// Cuántas columnas ocupa.
    pub span: usize,
}

#[derive(Clone, Debug, PartialEq, Default)]
pub struct Table {
    /// Ancho de cada columna en puntos (puede venir vacío).
    pub columns: Vec<f32>,
    pub rows: Vec<Vec<Cell>>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Block {
    Paragraph(Paragraph),
    Table(Table),
    PageBreak,
}

#[derive(Clone, Debug, PartialEq, Default)]
pub struct Document {
    pub page: PageSetup,
    pub blocks: Vec<Block>,
}

impl Document {
    /// Texto plano (para leerlo en el chat): párrafos, listas y tablas con " | ".
    pub fn plain_text(&self) -> String {
        let mut out = String::new();
        for block in &self.blocks {
            match block {
                Block::Paragraph(p) => {
                    if let Some(marker) = &p.marker {
                        out.push_str(marker);
                        out.push(' ');
                    }
                    if p.heading > 0 {
                        out.push_str(&"#".repeat(p.heading as usize));
                        out.push(' ');
                    }
                    out.push_str(&p.text());
                    out.push('\n');
                }
                Block::Table(t) => {
                    for row in &t.rows {
                        let cells: Vec<String> = row
                            .iter()
                            .map(|c| c.paragraphs.iter().map(Paragraph::text).collect::<Vec<_>>().join(" "))
                            .collect();
                        out.push_str(&cells.join(" | "));
                        out.push('\n');
                    }
                }
                Block::PageBreak => out.push('\n'),
            }
        }
        out
    }
}

// ---------------------------------------------------------------------------
// Utilidades de XML
// ---------------------------------------------------------------------------

fn local(e: &BytesStart) -> Vec<u8> {
    e.local_name().as_ref().to_vec()
}

/// Sustituye las entidades básicas de XML.
pub fn unescape(text: &str) -> String {
    if !text.contains('&') {
        return text.to_string();
    }
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(pos) = rest.find('&') {
        out.push_str(&rest[..pos]);
        let after = &rest[pos + 1..];
        match after.find(';') {
            Some(end) if end <= 10 => {
                let name = &after[..end];
                match entity(name) {
                    Some(c) => out.push(c),
                    None => out.push_str(&rest[pos..pos + end + 2]),
                }
                rest = &after[end + 1..];
            }
            _ => {
                out.push('&');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

fn entity(name: &str) -> Option<char> {
    match name {
        "amp" => Some('&'),
        "lt" => Some('<'),
        "gt" => Some('>'),
        "quot" => Some('"'),
        "apos" => Some('\''),
        _ => {
            let num = name.strip_prefix('#')?;
            let code = match num.strip_prefix('x').or_else(|| num.strip_prefix('X')) {
                Some(hex) => u32::from_str_radix(hex, 16).ok()?,
                None => num.parse().ok()?,
            };
            char::from_u32(code)
        }
    }
}

/// Valor de un atributo por su nombre local (sin prefijo `w:`/`r:`).
fn attr(e: &BytesStart, name: &str) -> Option<String> {
    e.attributes().flatten().find_map(|a| {
        (a.key.local_name().as_ref() == name.as_bytes())
            .then(|| unescape(&String::from_utf8_lossy(&a.value)))
    })
}

/// Propiedades booleanas de Word: `<w:b/>` es sí; `w:val="0"`/`"false"`/`"none"` es no.
fn on_off(e: &BytesStart) -> bool {
    !matches!(attr(e, "val").as_deref(), Some("0" | "false" | "off" | "none"))
}

/// Twips (1/20 de punto) a puntos.
fn twips(value: Option<String>) -> Option<f32> {
    value?.parse::<f32>().ok().map(|v| v / 20.0)
}

fn hex_color(value: &str) -> Option<[u8; 3]> {
    if value.len() != 6 || value.eq_ignore_ascii_case("auto") {
        return None;
    }
    let n = u32::from_str_radix(value, 16).ok()?;
    Some([(n >> 16) as u8, (n >> 8) as u8, n as u8])
}

/// Salta un elemento entero (con todo lo que tiene dentro).
fn skip(r: &mut Reader<&[u8]>, e: &BytesStart) {
    let name = e.name().as_ref().to_vec();
    let _ = r.read_to_end(QName(&name));
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default, PartialEq)]
struct RunProps {
    bold: Option<bool>,
    italic: Option<bool>,
    underline: Option<bool>,
    strike: Option<bool>,
    size: Option<f32>,
    color: Option<[u8; 3]>,
    mono: Option<bool>,
    hidden: Option<bool>,
    style: Option<String>,
}

impl RunProps {
    /// `over` manda sobre `self`.
    fn merged(&self, over: &RunProps) -> RunProps {
        RunProps {
            bold: over.bold.or(self.bold),
            italic: over.italic.or(self.italic),
            underline: over.underline.or(self.underline),
            strike: over.strike.or(self.strike),
            size: over.size.or(self.size),
            color: over.color.or(self.color),
            mono: over.mono.or(self.mono),
            hidden: over.hidden.or(self.hidden),
            style: over.style.clone().or_else(|| self.style.clone()),
        }
    }

    fn to_style(&self, default_size: f32) -> TextStyle {
        TextStyle {
            bold: self.bold.unwrap_or(false),
            italic: self.italic.unwrap_or(false),
            underline: self.underline.unwrap_or(false),
            strike: self.strike.unwrap_or(false),
            size: self.size.unwrap_or(default_size).clamp(4.0, 120.0),
            color: self.color,
            mono: self.mono.unwrap_or(false),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
struct ParaProps {
    style: Option<String>,
    align: Option<Align>,
    before: Option<f32>,
    after: Option<f32>,
    line: Option<f32>,
    indent_left: Option<f32>,
    indent_first: Option<f32>,
    num: Option<(String, u8)>,
    outline: Option<u8>,
    page_break_before: bool,
    contextual: Option<bool>,
}

impl ParaProps {
    fn merged(&self, over: &ParaProps) -> ParaProps {
        ParaProps {
            style: over.style.clone().or_else(|| self.style.clone()),
            align: over.align.or(self.align),
            before: over.before.or(self.before),
            after: over.after.or(self.after),
            line: over.line.or(self.line),
            indent_left: over.indent_left.or(self.indent_left),
            indent_first: over.indent_first.or(self.indent_first),
            num: over.num.clone().or_else(|| self.num.clone()),
            outline: over.outline.or(self.outline),
            page_break_before: over.page_break_before || self.page_break_before,
            contextual: over.contextual.or(self.contextual),
        }
    }
}

#[derive(Clone, Debug, Default)]
struct StyleDef {
    name: String,
    based_on: Option<String>,
    para: ParaProps,
    run: RunProps,
}

#[derive(Default)]
struct Styles {
    defs: HashMap<String, StyleDef>,
    default_para: ParaProps,
    default_run: RunProps,
    /// Estilo de párrafo por defecto ("Normal").
    normal: Option<String>,
}

impl Styles {
    /// Propiedades de un estilo con toda su cadena `basedOn` aplicada.
    fn resolve(&self, id: Option<&str>) -> (ParaProps, RunProps, u8) {
        let mut chain = Vec::new();
        let mut current = id.map(str::to_string).or_else(|| self.normal.clone());
        while let Some(id) = current {
            if chain.len() > 12 || chain.iter().any(|(i, _): &(String, &StyleDef)| *i == id) {
                break;
            }
            let Some(def) = self.defs.get(&id) else { break };
            current = def.based_on.clone();
            chain.push((id, def));
        }
        let mut para = self.default_para.clone();
        let mut run = RunProps::default();
        let mut heading = 0;
        for (_, def) in chain.iter().rev() {
            para = para.merged(&def.para);
            run = run.merged(&def.run);
            heading = heading_level(&def.name).unwrap_or(heading);
        }
        if let Some(level) = para.outline {
            if level < 6 {
                heading = level + 1;
            }
        }
        // Títulos cuyo estilo no dice tamaño ni negrita (documentos hechos con otros programas).
        if heading > 0 && run.size.is_none() && run.bold.is_none() {
            run.size = Some(heading_size(heading));
            run.bold = Some(true);
        }
        (para, self.default_run.merged(&run), heading)
    }

    fn run_style(&self, id: &str) -> RunProps {
        let mut chain = Vec::new();
        let mut current = Some(id.to_string());
        while let Some(id) = current {
            if chain.len() > 12 {
                break;
            }
            let Some(def) = self.defs.get(&id) else { break };
            current = def.based_on.clone();
            chain.push(def);
        }
        chain.iter().rev().fold(RunProps::default(), |acc, d| acc.merged(&d.run))
    }
}

/// "heading 1" → 1, "Title" → 1, "Subtitle" → 2 (los nombres internos van siempre en inglés).
fn heading_level(name: &str) -> Option<u8> {
    let lower = name.to_lowercase();
    if lower == "title" {
        return Some(1);
    }
    if lower == "subtitle" {
        return Some(2);
    }
    let n = lower.strip_prefix("heading ")?.trim().parse::<u8>().ok()?;
    (1..=9).contains(&n).then_some(n.min(6))
}

fn parse_rpr(r: &mut Reader<&[u8]>) -> RunProps {
    let mut p = RunProps::default();
    loop {
        match r.read_event() {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => match local(&e).as_slice() {
                b"b" => p.bold = Some(on_off(&e)),
                b"i" => p.italic = Some(on_off(&e)),
                b"u" => p.underline = Some(on_off(&e)),
                b"strike" | b"dstrike" => p.strike = Some(on_off(&e)),
                b"vanish" => p.hidden = Some(on_off(&e)),
                b"sz" => p.size = attr(&e, "val").and_then(|v| v.parse::<f32>().ok()).map(|v| v / 2.0),
                b"color" => p.color = attr(&e, "val").and_then(|v| hex_color(&v)),
                b"rStyle" => p.style = attr(&e, "val"),
                b"rFonts" => {
                    let font = attr(&e, "ascii").or_else(|| attr(&e, "hAnsi")).unwrap_or_default().to_lowercase();
                    if !font.is_empty() {
                        p.mono = Some(["courier", "consolas", "mono", "menlo", "code"].iter().any(|m| font.contains(m)));
                    }
                }
                _ => {}
            },
            Ok(Event::End(e)) if e.local_name().as_ref() == b"rPr" => break,
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    p
}

fn parse_ppr(r: &mut Reader<&[u8]>, page: &mut Option<PageSetup>) -> ParaProps {
    let mut p = ParaProps::default();
    loop {
        let (e, is_start) = match r.read_event() {
            Ok(Event::Start(e)) => (e, true),
            Ok(Event::Empty(e)) => (e, false),
            Ok(Event::End(e)) if e.local_name().as_ref() == b"pPr" => break,
            Ok(Event::Eof) | Err(_) => break,
            _ => continue,
        };
        match local(&e).as_slice() {
                b"pStyle" => p.style = attr(&e, "val"),
                b"jc" => {
                    p.align = match attr(&e, "val").as_deref() {
                        Some("center") => Some(Align::Center),
                        Some("right" | "end") => Some(Align::Right),
                        Some("both" | "distribute") => Some(Align::Justify),
                        Some(_) => Some(Align::Left),
                        None => None,
                    }
                }
                b"spacing" => {
                    p.before = twips(attr(&e, "before")).or(p.before);
                    p.after = twips(attr(&e, "after")).or(p.after);
                    if let Some(line) = attr(&e, "line").and_then(|v| v.parse::<f32>().ok()) {
                        p.line = Some(match attr(&e, "lineRule").as_deref() {
                            // "exact"/"atLeast": puntos; lo pasamos a múltiplo aproximado.
                            Some("exact" | "atLeast") => -(line / 20.0),
                            _ => line / 240.0,
                        });
                    }
                }
                b"ind" => {
                    p.indent_left = twips(attr(&e, "left").or_else(|| attr(&e, "start"))).or(p.indent_left);
                    if let Some(first) = twips(attr(&e, "firstLine")) {
                        p.indent_first = Some(first);
                    }
                    if let Some(hanging) = twips(attr(&e, "hanging")) {
                        p.indent_first = Some(-hanging);
                    }
                }
                b"ilvl" => {
                    let level = attr(&e, "val").and_then(|v| v.parse().ok()).unwrap_or(0);
                    let id = p.num.as_ref().map(|(id, _)| id.clone()).unwrap_or_default();
                    p.num = Some((id, level));
                }
                b"numId" => {
                    let id = attr(&e, "val").unwrap_or_default();
                    let level = p.num.as_ref().map_or(0, |(_, l)| *l);
                    p.num = Some((id, level));
                }
                b"outlineLvl" => p.outline = attr(&e, "val").and_then(|v| v.parse().ok()),
                b"pageBreakBefore" => p.page_break_before = on_off(&e),
                b"contextualSpacing" => p.contextual = Some(on_off(&e)),
                // La marca de párrafo tiene su propio formato (y "spacing" ahí significa otra
                // cosa): no nos interesa.
                b"rPr" if is_start => skip(r, &e),
                b"sectPr" if is_start => {
                    let setup = parse_sect(r);
                    page.get_or_insert(setup);
                }
                _ => {}
        }
    }
    p
}

fn parse_sect(r: &mut Reader<&[u8]>) -> PageSetup {
    let mut page = PageSetup::default();
    loop {
        match r.read_event() {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => match local(&e).as_slice() {
                b"pgSz" => {
                    if let (Some(w), Some(h)) = (twips(attr(&e, "w")), twips(attr(&e, "h"))) {
                        if w > 72.0 && h > 72.0 {
                            page.width = w;
                            page.height = h;
                        }
                    }
                }
                b"pgMar" => {
                    let m = |name: &str, fallback: f32| twips(attr(&e, name)).map_or(fallback, |v| v.abs().min(300.0));
                    page.margin_top = m("top", page.margin_top);
                    page.margin_right = m("right", page.margin_right);
                    page.margin_bottom = m("bottom", page.margin_bottom);
                    page.margin_left = m("left", page.margin_left);
                }
                _ => {}
            },
            Ok(Event::End(e)) if e.local_name().as_ref() == b"sectPr" => break,
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    page
}

fn parse_styles(xml: &str) -> Styles {
    let mut styles = Styles::default();
    let mut r = Reader::from_str(xml);
    let mut ignored = None;
    let mut current: Option<(String, StyleDef)> = None;
    loop {
        let (e, is_start) = match r.read_event() {
            Ok(Event::Start(e)) => (e, true),
            Ok(Event::Empty(e)) => (e, false),
            Ok(Event::End(e)) if e.local_name().as_ref() == b"style" => {
                if let Some((id, def)) = current.take() {
                    styles.defs.insert(id, def);
                }
                continue;
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => continue,
        };
        match local(&e).as_slice() {
            b"style" => {
                let id = attr(&e, "styleId").unwrap_or_default();
                if attr(&e, "default").as_deref() == Some("1") && attr(&e, "type").as_deref() == Some("paragraph") {
                    styles.normal = Some(id.clone());
                }
                let def = StyleDef::default();
                if is_start {
                    current = Some((id, def));
                } else {
                    styles.defs.insert(id, def);
                }
            }
            b"name" => {
                if let Some((_, def)) = current.as_mut() {
                    def.name = attr(&e, "val").unwrap_or_default();
                }
            }
            b"basedOn" => {
                if let Some((_, def)) = current.as_mut() {
                    def.based_on = attr(&e, "val");
                }
            }
            b"rPr" if is_start => {
                let props = parse_rpr(&mut r);
                match current.as_mut() {
                    Some((_, def)) => def.run = props,
                    None => styles.default_run = props,
                }
            }
            b"pPr" if is_start => {
                let props = parse_ppr(&mut r, &mut ignored);
                match current.as_mut() {
                    Some((_, def)) => def.para = props,
                    None => styles.default_para = props,
                }
            }
            b"tblPr" | b"tblStylePr" | b"trPr" | b"tcPr" if is_start => skip(&mut r, &e),
            _ => {}
        }
    }
    styles
}

// ---------------------------------------------------------------------------
// Listas
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
struct Level {
    format: String,
    text: String,
    start: u32,
}

#[derive(Default)]
struct Numbering {
    abstracts: HashMap<String, HashMap<u8, Level>>,
    nums: HashMap<String, String>,
    counters: HashMap<String, [u32; 9]>,
}

fn parse_numbering(xml: &str) -> Numbering {
    let mut numbering = Numbering::default();
    let mut r = Reader::from_str(xml);
    let mut abstract_id: Option<String> = None;
    let mut level: Option<(u8, Level)> = None;
    let mut num_id: Option<String> = None;
    loop {
        let event = r.read_event();
        let is_start = matches!(event, Ok(Event::Start(_)));
        match event {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => match local(&e).as_slice() {
                b"abstractNum" => abstract_id = attr(&e, "abstractNumId"),
                b"lvl" => {
                    let ilvl = attr(&e, "ilvl").and_then(|v| v.parse().ok()).unwrap_or(0);
                    level = Some((ilvl, Level { start: 1, ..Level::default() }));
                }
                b"start" => {
                    if let Some((_, l)) = level.as_mut() {
                        l.start = attr(&e, "val").and_then(|v| v.parse().ok()).unwrap_or(1);
                    }
                }
                b"numFmt" => {
                    if let Some((_, l)) = level.as_mut() {
                        l.format = attr(&e, "val").unwrap_or_default();
                    }
                }
                b"lvlText" => {
                    if let Some((_, l)) = level.as_mut() {
                        l.text = attr(&e, "val").unwrap_or_default();
                    }
                }
                b"num" => num_id = attr(&e, "numId"),
                b"abstractNumId" => {
                    if let (Some(id), Some(abs)) = (num_id.clone(), attr(&e, "val")) {
                        numbering.nums.insert(id, abs);
                    }
                }
                b"pPr" | b"rPr" if is_start => skip(&mut r, &e),
                _ => {}
            },
            Ok(Event::End(e)) => match e.local_name().as_ref() {
                b"lvl" => {
                    if let (Some(abs), Some((ilvl, l))) = (abstract_id.as_ref(), level.take()) {
                        numbering.abstracts.entry(abs.clone()).or_default().insert(ilvl, l);
                    }
                }
                b"abstractNum" => abstract_id = None,
                b"num" => num_id = None,
                _ => {}
            },
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    numbering
}

fn roman(mut n: u32) -> String {
    const TABLE: [(u32, &str); 13] = [
        (1000, "m"), (900, "cm"), (500, "d"), (400, "cd"), (100, "c"), (90, "xc"), (50, "l"),
        (40, "xl"), (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i"),
    ];
    let mut out = String::new();
    for (value, s) in TABLE {
        while n >= value {
            out.push_str(s);
            n -= value;
        }
    }
    out
}

fn letters(n: u32) -> String {
    let n = n.max(1) - 1;
    let c = (b'a' + (n % 26) as u8) as char;
    c.to_string().repeat((n / 26 + 1) as usize)
}

fn format_number(n: u32, format: &str) -> String {
    match format {
        "lowerLetter" => letters(n),
        "upperLetter" => letters(n).to_uppercase(),
        "lowerRoman" => roman(n),
        "upperRoman" => roman(n).to_uppercase(),
        "none" => String::new(),
        _ => n.to_string(),
    }
}

/// Las viñetas de Word suelen usar letras de las fuentes Symbol/Wingdings: las cambiamos
/// por caracteres normales.
fn bullet(text: &str) -> String {
    let c = text.chars().next().unwrap_or('•');
    match c {
        'o' => "◦".into(),
        '\u{F0A7}' | '§' | '\u{F0FC}' | '▪' | '■' => "▪".into(),
        '-' | '–' | '—' => "–".into(),
        '\u{F000}'..='\u{F8FF}' => "•".into(),
        c if c.is_alphanumeric() || c.is_whitespace() => "•".into(),
        c => c.to_string(),
    }
}

impl Numbering {
    /// Texto de la viñeta o del número para este párrafo (y avanza el contador).
    fn marker(&mut self, num_id: &str, ilvl: u8) -> Option<String> {
        if num_id.is_empty() || num_id == "0" {
            return None;
        }
        let abs = self.nums.get(num_id)?.clone();
        let levels = self.abstracts.get(&abs)?;
        let ilvl = ilvl.min(8);
        let level = levels.get(&ilvl)?.clone();
        if level.format == "bullet" {
            return Some(bullet(&level.text));
        }
        if level.format == "none" {
            return None;
        }
        let starts: Vec<u32> = (0..9u8).map(|i| levels.get(&i).map_or(1, |l| l.start)).collect();
        let counters = self.counters.entry(abs.clone()).or_insert_with(|| {
            let mut c = [0u32; 9];
            for (i, s) in starts.iter().enumerate() {
                c[i] = s.saturating_sub(1);
            }
            c
        });
        counters[ilvl as usize] += 1;
        for deeper in (ilvl as usize + 1)..9 {
            counters[deeper] = starts[deeper].saturating_sub(1);
        }
        let counters = *counters;
        let mut text = level.text.clone();
        for i in (1..=9).rev() {
            let placeholder = format!("%{i}");
            if text.contains(&placeholder) {
                let fmt = levels.get(&(i as u8 - 1)).map_or("decimal", |l| l.format.as_str());
                let value = counters[i - 1].max(1);
                text = text.replace(&placeholder, &format_number(value, fmt));
            }
        }
        Some(text)
    }
}

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

struct Ctx<'z> {
    styles: Styles,
    numbering: Numbering,
    rels: HashMap<String, String>,
    media: &'z mut dyn FnMut(&str) -> Option<Vec<u8>>,
    page: Option<PageSetup>,
}

/// Tamaños de los títulos si su estilo no dice nada.
fn heading_size(level: u8) -> f32 {
    match level {
        1 => 20.0,
        2 => 16.0,
        3 => 14.0,
        _ => 12.0,
    }
}

fn parse_drawing(r: &mut Reader<&[u8]>, ctx: &mut Ctx) -> Option<Image> {
    let mut size: Option<(f32, f32)> = None;
    let mut embed: Option<String> = None;
    loop {
        match r.read_event() {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => match local(&e).as_slice() {
                b"extent" if size.is_none() => {
                    let cx = attr(&e, "cx").and_then(|v| v.parse::<f32>().ok());
                    let cy = attr(&e, "cy").and_then(|v| v.parse::<f32>().ok());
                    if let (Some(cx), Some(cy)) = (cx, cy) {
                        // 12 700 EMU = 1 punto.
                        size = Some((cx / 12_700.0, cy / 12_700.0));
                    }
                }
                b"blip" if embed.is_none() => embed = attr(&e, "embed"),
                _ => {}
            },
            Ok(Event::End(e)) if e.local_name().as_ref() == b"drawing" => break,
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    let target = ctx.rels.get(&embed?)?.clone();
    let path = if let Some(abs) = target.strip_prefix('/') { abs.to_string() } else { format!("word/{target}") };
    let data = (ctx.media)(&path)?;
    let (width, height) = size.unwrap_or((200.0, 150.0));
    (width > 1.0 && height > 1.0).then_some(Image { data, width, height })
}

/// Lee un `w:r`: su formato y su contenido.
fn parse_run(r: &mut Reader<&[u8]>, ctx: &mut Ctx, base: &RunProps, out: &mut Vec<Inline>, breaks: &mut Vec<usize>) {
    let mut props = base.clone();
    loop {
        match r.read_event() {
            Ok(Event::Start(e)) => match local(&e).as_slice() {
                b"rPr" => {
                    let own = parse_rpr(r);
                    let style = own.style.as_deref().map(|s| ctx.styles.run_style(s)).unwrap_or_default();
                    props = base.merged(&style).merged(&own);
                }
                b"t" => {
                    let mut text = String::new();
                    loop {
                        match r.read_event() {
                            Ok(Event::Text(t)) => text.push_str(&t.decode().unwrap_or_default()),
                            Ok(Event::GeneralRef(g)) => {
                                let name = g.decode().unwrap_or_default();
                                if let Some(c) = entity(&name) {
                                    text.push(c);
                                }
                            }
                            Ok(Event::CData(c)) => text.push_str(&String::from_utf8_lossy(&c)),
                            Ok(Event::End(_)) | Ok(Event::Eof) | Err(_) => break,
                            _ => {}
                        }
                    }
                    if !props.hidden.unwrap_or(false) && !text.is_empty() {
                        out.push(Inline::Text(text, props.to_style(11.0)));
                    }
                }
                b"drawing" => {
                    if let Some(image) = parse_drawing(r, ctx) {
                        out.push(Inline::Image(image));
                    }
                }
                // AlternateContent trae el dibujo moderno (Choice) y uno antiguo (Fallback):
                // leemos el primero y saltamos el segundo.
                b"delText" | b"instrText" | b"pict" | b"object" | b"Fallback" => skip(r, &e),
                _ => {}
            },
            Ok(Event::Empty(e)) => match local(&e).as_slice() {
                b"tab" | b"ptab" => out.push(Inline::Tab),
                b"br" => {
                    if attr(&e, "type").as_deref() == Some("page") {
                        breaks.push(out.len());
                    } else {
                        out.push(Inline::Break);
                    }
                }
                b"cr" => out.push(Inline::Break),
                b"noBreakHyphen" => out.push(Inline::Text("-".into(), props.to_style(11.0))),
                b"sym" => out.push(Inline::Text("•".into(), props.to_style(11.0))),
                _ => {}
            },
            Ok(Event::End(e)) if e.local_name().as_ref() == b"r" => break,
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
}

/// Lee un `w:p`. Si tiene saltos de página dentro, devuelve varios bloques.
fn parse_paragraph(r: &mut Reader<&[u8]>, ctx: &mut Ctx) -> Vec<Block> {
    let mut own = ParaProps::default();
    let mut inlines = Vec::new();
    let mut breaks = Vec::new();
    let mut run_base: Option<RunProps> = None;
    let mut resolved: Option<(ParaProps, RunProps, u8)> = None;
    loop {
        match r.read_event() {
            Ok(Event::Start(e)) => match local(&e).as_slice() {
                b"pPr" => {
                    own = parse_ppr(r, &mut ctx.page);
                    resolved = None;
                    run_base = None;
                }
                b"r" => {
                    let base = run_base
                        .get_or_insert_with(|| {
                            let (_, run, _) = resolved.get_or_insert_with(|| {
                                let (p, rp, h) = ctx.styles.resolve(own.style.as_deref());
                                (p.merged(&own), rp, h)
                            });
                            run.clone()
                        })
                        .clone();
                    parse_run(r, ctx, &base, &mut inlines, &mut breaks);
                }
                b"del" | b"moveFrom" | b"commentRangeStart" => skip(r, &e),
                // hyperlink, ins, smartTag, sdt…: seguimos leyendo lo de dentro.
                _ => {}
            },
            Ok(Event::End(e)) if e.local_name().as_ref() == b"p" => break,
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    let (para, run, heading) = resolved.unwrap_or_else(|| {
        let (p, rp, h) = ctx.styles.resolve(own.style.as_deref());
        (p.merged(&own), rp, h)
    });
    let default_size = run.size.unwrap_or(11.0);
    let marker = para.num.as_ref().and_then(|(id, lvl)| ctx.numbering.marker(id, *lvl));
    let line = match para.line {
        Some(l) if l > 0.0 => l.clamp(0.8, 3.0),
        // Interlineado exacto en puntos: lo pasamos a múltiplo del tamaño de letra.
        Some(l) => (-l / (default_size * 1.17)).clamp(0.8, 3.0),
        // Sin nada dicho, Word usa interlineado sencillo y ningún espacio entre párrafos.
        None => 1.0,
    };
    let template = Paragraph {
        inlines: Vec::new(),
        align: para.align.unwrap_or_default(),
        heading,
        space_before: para.before.unwrap_or(if heading > 0 { 12.0 } else { 0.0 }).min(72.0),
        space_after: para.after.unwrap_or(if heading > 0 { 4.0 } else { 0.0 }).min(72.0),
        line,
        indent_left: para.indent_left.unwrap_or(if marker.is_some() { 36.0 } else { 0.0 }).max(0.0),
        indent_first: para.indent_first.unwrap_or(if marker.is_some() { -18.0 } else { 0.0 }),
        marker,
        style: para.style.clone(),
        contextual: para.contextual.unwrap_or(false),
    };

    let mut blocks = Vec::new();
    if para.page_break_before {
        blocks.push(Block::PageBreak);
    }
    let mut start = 0;
    for (n, at) in breaks.iter().enumerate() {
        let mut p = template.clone();
        p.inlines = inlines[start..*at].to_vec();
        if n > 0 {
            p.marker = None;
        }
        if !p.inlines.is_empty() || n == 0 {
            blocks.push(Block::Paragraph(p));
        }
        blocks.push(Block::PageBreak);
        start = *at;
    }
    let mut last = template;
    if !breaks.is_empty() {
        last.marker = None;
    }
    last.inlines = inlines[start..].to_vec();
    if breaks.is_empty() || !last.inlines.is_empty() {
        blocks.push(Block::Paragraph(last));
    }
    blocks
}

fn parse_table(r: &mut Reader<&[u8]>, ctx: &mut Ctx) -> Table {
    let mut table = Table::default();
    let mut row: Option<Vec<Cell>> = None;
    let mut cell: Option<Cell> = None;
    loop {
        match r.read_event() {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) if local(&e).as_slice() == b"gridCol" => {
                if let Some(w) = twips(attr(&e, "w")) {
                    table.columns.push(w);
                }
            }
            Ok(Event::Start(e)) => match local(&e).as_slice() {
                b"tr" => row = Some(Vec::new()),
                b"tc" => cell = Some(Cell { paragraphs: Vec::new(), span: 1 }),
                b"tcPr" => {
                    // gridSpan: la celda ocupa varias columnas.
                    loop {
                        match r.read_event() {
                            Ok(Event::Empty(e)) | Ok(Event::Start(e)) if local(&e).as_slice() == b"gridSpan" => {
                                if let Some(c) = cell.as_mut() {
                                    c.span = attr(&e, "val").and_then(|v| v.parse().ok()).unwrap_or(1).clamp(1, 63);
                                }
                            }
                            Ok(Event::End(e)) if e.local_name().as_ref() == b"tcPr" => break,
                            Ok(Event::Eof) | Err(_) => break,
                            _ => {}
                        }
                    }
                }
                b"p" => {
                    let blocks = parse_paragraph(r, ctx);
                    if let Some(c) = cell.as_mut() {
                        c.paragraphs.extend(blocks.into_iter().filter_map(|b| match b {
                            Block::Paragraph(p) => Some(p),
                            _ => None,
                        }));
                    }
                }
                b"tbl" => {
                    // Tabla dentro de una celda: la aplanamos en líneas de texto.
                    let inner = parse_table(r, ctx);
                    if let Some(c) = cell.as_mut() {
                        for inner_row in inner.rows {
                            let text: Vec<String> = inner_row
                                .iter()
                                .map(|ic| ic.paragraphs.iter().map(Paragraph::text).collect::<Vec<_>>().join(" "))
                                .collect();
                            c.paragraphs.push(Paragraph {
                                inlines: vec![Inline::Text(text.join(" | "), TextStyle { size: 9.0, ..TextStyle::default() })],
                                line: 1.0,
                                ..Paragraph::default()
                            });
                        }
                    }
                }
                b"tblPr" | b"trPr" | b"tblPrEx" => skip(r, &e),
                _ => {}
            },
            Ok(Event::End(e)) => match e.local_name().as_ref() {
                b"tc" => {
                    if let (Some(row), Some(c)) = (row.as_mut(), cell.take()) {
                        row.push(c);
                    }
                }
                b"tr" => {
                    if let Some(row) = row.take() {
                        table.rows.push(row);
                    }
                }
                b"tbl" => break,
                _ => {}
            },
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    table
}

fn parse_document(xml: &str, ctx: &mut Ctx) -> Vec<Block> {
    let mut blocks = Vec::new();
    let mut r = Reader::from_str(xml);
    loop {
        match r.read_event() {
            Ok(Event::Start(e)) => match local(&e).as_slice() {
                b"p" => blocks.extend(parse_paragraph(&mut r, ctx)),
                b"tbl" => blocks.push(Block::Table(parse_table(&mut r, ctx))),
                b"sectPr" => {
                    // El sectPr del cuerpo es el de la última sección: manda sobre los demás.
                    ctx.page = Some(parse_sect(&mut r));
                }
                _ => {}
            },
            Ok(Event::Empty(e)) if local(&e).as_slice() == b"p" => {
                blocks.push(Block::Paragraph(Paragraph { line: 1.0, ..Paragraph::default() }));
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    blocks
}

fn parse_rels(xml: &str) -> HashMap<String, String> {
    let mut rels = HashMap::new();
    let mut r = Reader::from_str(xml);
    loop {
        match r.read_event() {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) if local(&e).as_slice() == b"Relationship" => {
                if let (Some(id), Some(target)) = (attr(&e, "Id"), attr(&e, "Target")) {
                    rels.insert(id, target);
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    rels
}

/// Lee un archivo de dentro del zip como texto (vacío si no existe).
pub fn zip_text<R: Read + Seek>(zip: &mut zip::ZipArchive<R>, name: &str) -> Option<String> {
    let mut file = zip.by_name(name).ok()?;
    let mut text = String::new();
    file.read_to_string(&mut text).ok()?;
    Some(text)
}

fn zip_bytes<R: Read + Seek>(zip: &mut zip::ZipArchive<R>, name: &str) -> Option<Vec<u8>> {
    let mut file = zip.by_name(name).ok()?;
    // Imágenes de más de 40 MB: ni las intentamos.
    if file.size() > 40 * 1024 * 1024 {
        return None;
    }
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).ok()?;
    Some(bytes)
}

/// Lee un .docx de memoria.
pub fn parse(bytes: &[u8]) -> AppResult<Document> {
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|_| AppError::File("no es un documento de Word válido (.docx)".into()))?;
    let document = zip_text(&mut zip, "word/document.xml")
        .ok_or_else(|| AppError::File("el documento no tiene contenido (word/document.xml)".into()))?;
    let styles = zip_text(&mut zip, "word/styles.xml").map(|x| parse_styles(&x)).unwrap_or_default();
    let numbering = zip_text(&mut zip, "word/numbering.xml").map(|x| parse_numbering(&x)).unwrap_or_default();
    let rels = zip_text(&mut zip, "word/_rels/document.xml.rels").map(|x| parse_rels(&x)).unwrap_or_default();
    let mut media = |name: &str| zip_bytes(&mut zip, name);
    let mut ctx = Ctx { styles, numbering, rels, media: &mut media, page: None };
    let blocks = parse_document(&document, &mut ctx);
    Ok(Document { page: ctx.page.unwrap_or_default(), blocks })
}

#[cfg(test)]
pub mod tests {
    use std::io::Write;

    use super::*;

    /// Crea un .docx mínimo en memoria con el `body` dado (y estilos y listas de ejemplo).
    pub fn make_docx(body: &str) -> Vec<u8> {
        let mut out = Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut out);
            let opts = zip::write::SimpleFileOptions::default();
            let files = [
                ("[Content_Types].xml", r#"<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>"#.to_string()),
                ("word/document.xml", format!(
                    r#"<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>{body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>"#
                )),
                ("word/styles.xml", r#"<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Ttulo1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="2F5496"/></w:rPr></w:style></w:styles>"#.to_string()),
                ("word/numbering.xml", r#"<?xml version="1.0"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2)"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="&#61623;"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>"#.to_string()),
            ];
            for (name, content) in files {
                zip.start_file(name, opts).unwrap();
                zip.write_all(content.as_bytes()).unwrap();
            }
            zip.finish().unwrap();
        }
        out.into_inner()
    }

    fn paragraphs(doc: &Document) -> Vec<&Paragraph> {
        doc.blocks
            .iter()
            .filter_map(|b| match b {
                Block::Paragraph(p) => Some(p),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn reads_styles_headings_and_runs() {
        let doc = parse(&make_docx(
            r#"<w:p><w:pPr><w:pStyle w:val="Ttulo1"/></w:pPr><w:r><w:t>Informe &amp; datos</w:t></w:r></w:p>
               <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">Hola </w:t></w:r><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>mundo</w:t></w:r></w:p>"#,
        ))
        .unwrap();
        assert_eq!(doc.page.width, 612.0);
        let ps = paragraphs(&doc);
        assert_eq!(ps[0].heading, 1);
        assert_eq!(ps[0].text(), "Informe & datos");
        let Inline::Text(_, style) = &ps[0].inlines[0] else { panic!() };
        assert!(style.bold);
        assert_eq!(style.size, 16.0);
        assert_eq!(style.color, Some([0x2F, 0x54, 0x96]));
        assert_eq!(ps[1].align, Align::Center);
        let Inline::Text(t, s) = &ps[1].inlines[1] else { panic!() };
        assert_eq!(t, "mundo");
        assert!(s.bold && !s.italic);
        assert_eq!(s.size, 14.0);
        let Inline::Text(_, s) = &ps[1].inlines[0] else { panic!() };
        assert!(s.italic);
        assert_eq!(s.size, 12.0);
    }

    #[test]
    fn numbers_lists_and_bullets() {
        let item = |num: u8, lvl: u8, text: &str| {
            format!(r#"<w:p><w:pPr><w:numPr><w:ilvl w:val="{lvl}"/><w:numId w:val="{num}"/></w:numPr></w:pPr><w:r><w:t>{text}</w:t></w:r></w:p>"#)
        };
        let body = [item(1, 0, "uno"), item(1, 1, "sub"), item(1, 1, "sub2"), item(1, 0, "dos"), item(1, 1, "otra"), item(2, 0, "viñeta")].concat();
        let doc = parse(&make_docx(&body)).unwrap();
        let markers: Vec<_> = paragraphs(&doc).iter().map(|p| p.marker.clone().unwrap_or_default()).collect();
        assert_eq!(markers, ["1.", "a)", "b)", "2.", "a)", "•"]);
    }

    #[test]
    fn reads_tables_and_page_breaks() {
        let doc = parse(&make_docx(
            r#"<w:tbl><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="4000"/></w:tblGrid>
               <w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
               <w:p><w:r><w:t>antes</w:t><w:br w:type="page"/><w:t>después</w:t></w:r></w:p>"#,
        ))
        .unwrap();
        let Block::Table(t) = &doc.blocks[0] else { panic!("no hay tabla") };
        assert_eq!(t.columns, vec![100.0, 200.0]);
        assert_eq!(t.rows[0][1].paragraphs[0].text(), "B");
        assert!(matches!(doc.blocks[2], Block::PageBreak));
        assert_eq!(doc.plain_text(), "A | B\nantes\n\ndespués\n");
    }

    #[test]
    fn skips_deleted_and_hidden_text() {
        let doc = parse(&make_docx(
            r#"<w:p><w:r><w:t>sí</w:t></w:r><w:del><w:r><w:delText>borrado</w:delText></w:r></w:del><w:r><w:rPr><w:vanish/></w:rPr><w:t>oculto</w:t></w:r></w:p>"#,
        ))
        .unwrap();
        assert_eq!(doc.plain_text().trim(), "sí");
    }

    #[test]
    fn rejects_non_docx() {
        assert!(matches!(parse(b"esto no es un zip"), Err(AppError::File(_))));
    }

    #[test]
    fn unescape_handles_entities() {
        assert_eq!(unescape("a &amp; b &lt;c&gt; &#233; &#x20AC;"), "a & b <c> é €");
        assert_eq!(unescape("sin entidades"), "sin entidades");
        assert_eq!(unescape("suelto & roto"), "suelto & roto");
    }
}
