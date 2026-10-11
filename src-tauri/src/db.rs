//! Base de datos local de Tico: un archivo SQLite (`tico.db`) en la carpeta de datos de la
//! app. Guarda los ajustes, las conversaciones (por espacio y Tico) y los PDF convertidos.
//!
//! Privacidad: de cada mensaje se guarda solo el texto, los nombres de los archivos
//! adjuntos y si llevaba captura. Las capturas y el texto leído de ellas (OCR) nunca se
//! escriben en disco. Las claves de API siguen en el llavero del sistema.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::convert::ConvertResult;
use crate::error::{AppError, AppResult};
use crate::island::lock;
use crate::settings::Settings;

/// Versión del esquema. Cada cambio de tablas añade un paso en `migrate`.
const SCHEMA_VERSION: i64 = 1;

const SCHEMA_V1: &str = "
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace TEXT NOT NULL,
    tico TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    text TEXT NOT NULL,
    files TEXT NOT NULL DEFAULT '[]',
    capture INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_by_chat ON messages (workspace, tico, id);
CREATE TABLE IF NOT EXISTS conversions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    output TEXT NOT NULL,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    engine TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
";

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX))
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        AppError::Database(err.to_string())
    }
}

/// Un mensaje guardado, tal como lo pinta la isla.
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredMessage {
    pub id: i64,
    pub role: String,
    pub text: String,
    /// Los archivos que se adjuntaron (`FileInfo` en JSON).
    pub files: serde_json::Value,
    pub capture: bool,
    pub created_at: i64,
}

/// Lo que ocupa la base de datos (para enseñarlo en Ajustes).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbInfo {
    pub path: String,
    pub bytes: u64,
    pub messages: i64,
    pub conversations: i64,
    pub conversions: i64,
}

pub struct Db {
    conn: Mutex<Connection>,
    path: PathBuf,
}

impl Db {
    /// Abre (o crea) la base de datos. Si el archivo está roto, lo aparta y empieza una
    /// nueva; y si ni eso se puede, trabaja en memoria para que Tico arranque igualmente.
    pub fn open(path: &Path) -> AppResult<Self> {
        let conn = Self::open_file(path)
            .or_else(|err| {
                eprintln!("Base de datos ilegible ({err}); la aparto y creo una nueva");
                let broken = path.with_extension(format!("db.broken-{}", now_ms()));
                let _ = std::fs::rename(path, broken);
                Self::open_file(path)
            })
            .or_else(|err| {
                eprintln!("No se pudo crear la base de datos ({err}); uso una en memoria");
                Self::prepare(Connection::open_in_memory()?)
            })?;
        Ok(Self { conn: Mutex::new(conn), path: path.to_path_buf() })
    }

    fn open_file(path: &Path) -> AppResult<Connection> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        Self::prepare(Connection::open(path)?)
    }

    fn prepare(conn: Connection) -> AppResult<Connection> {
        // WAL: escribir no bloquea leer y un corte de luz no deja el archivo a medias.
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;")?;
        conn.busy_timeout(std::time::Duration::from_secs(3))?;
        migrate(&conn)?;
        Ok(conn)
    }

    #[cfg(test)]
    pub fn in_memory() -> Self {
        let conn = Self::prepare(Connection::open_in_memory().unwrap()).unwrap();
        Self { conn: Mutex::new(conn), path: PathBuf::from(":memory:") }
    }

    // --- Ajustes ---------------------------------------------------------------------

    /// Los ajustes guardados (`None` si aún no hay o están rotos).
    pub fn load_settings(&self) -> Option<Settings> {
        let conn = lock(&self.conn);
        let json: Option<String> = conn
            .query_row("SELECT json FROM settings WHERE id = 1", [], |r| r.get(0))
            .optional()
            .ok()
            .flatten();
        json.and_then(|j| match serde_json::from_str(&j) {
            Ok(settings) => Some(settings),
            Err(err) => {
                eprintln!("Ajustes ilegibles en la base de datos ({err})");
                None
            }
        })
    }

    pub fn save_settings(&self, settings: &Settings) -> AppResult<()> {
        let json = serde_json::to_string(settings)?;
        lock(&self.conn).execute(
            "INSERT INTO settings (id, json, updated_at) VALUES (1, ?1, ?2)
             ON CONFLICT (id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at",
            params![json, now_ms()],
        )?;
        Ok(())
    }

    // --- Conversaciones --------------------------------------------------------------

    /// Guarda una pregunta y su respuesta juntas (o ninguna, si algo falla).
    pub fn add_exchange(
        &self,
        workspace: &str,
        tico: &str,
        question: &str,
        files: &serde_json::Value,
        capture: bool,
        answer: &str,
    ) -> AppResult<()> {
        let mut conn = lock(&self.conn);
        let tx = conn.transaction()?;
        let at = now_ms();
        tx.execute(
            "INSERT INTO messages (workspace, tico, role, text, files, capture, created_at)
             VALUES (?1, ?2, 'user', ?3, ?4, ?5, ?6)",
            params![workspace, tico, question, files.to_string(), capture, at],
        )?;
        tx.execute(
            "INSERT INTO messages (workspace, tico, role, text, created_at) VALUES (?1, ?2, 'assistant', ?3, ?4)",
            params![workspace, tico, answer, at],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// Los últimos `limit` mensajes de una conversación, del más antiguo al más nuevo.
    pub fn history(&self, workspace: &str, tico: &str, limit: usize) -> AppResult<Vec<StoredMessage>> {
        let conn = lock(&self.conn);
        let mut stmt = conn.prepare(
            "SELECT id, role, text, files, capture, created_at FROM messages
             WHERE workspace = ?1 AND tico = ?2 ORDER BY id DESC LIMIT ?3",
        )?;
        let limit = i64::try_from(limit).unwrap_or(i64::MAX);
        let rows = stmt.query_map(params![workspace, tico, limit], |r| {
            let files: String = r.get(3)?;
            Ok(StoredMessage {
                id: r.get(0)?,
                role: r.get(1)?,
                text: r.get(2)?,
                files: serde_json::from_str(&files).unwrap_or_else(|_| serde_json::json!([])),
                capture: r.get(4)?,
                created_at: r.get(5)?,
            })
        })?;
        let mut list = rows.collect::<Result<Vec<_>, _>>()?;
        list.reverse();
        Ok(list)
    }

    /// Borra la última pregunta y su respuesta (para pedir otra respuesta).
    pub fn forget_last_exchange(&self, workspace: &str, tico: &str) -> AppResult<()> {
        lock(&self.conn).execute(
            "DELETE FROM messages WHERE id IN (
                SELECT id FROM messages WHERE workspace = ?1 AND tico = ?2 ORDER BY id DESC LIMIT 2)",
            params![workspace, tico],
        )?;
        Ok(())
    }

    pub fn clear_chat(&self, workspace: &str, tico: &str) -> AppResult<()> {
        lock(&self.conn).execute("DELETE FROM messages WHERE workspace = ?1 AND tico = ?2", params![workspace, tico])?;
        Ok(())
    }

    pub fn clear_all_chats(&self) -> AppResult<()> {
        lock(&self.conn).execute("DELETE FROM messages", [])?;
        Ok(())
    }

    /// Borra las conversaciones de Ticos o espacios que ya no existen.
    pub fn prune(&self, settings: &Settings) -> AppResult<()> {
        let conn = lock(&self.conn);
        let mut stmt = conn.prepare("SELECT DISTINCT workspace, tico FROM messages")?;
        let pairs = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        for (workspace, tico) in pairs {
            let alive = settings.workspaces.iter().any(|w| w.id == workspace)
                && settings.ticos.iter().any(|t| t.id == tico);
            if !alive {
                conn.execute("DELETE FROM messages WHERE workspace = ?1 AND tico = ?2", params![workspace, tico])?;
            }
        }
        Ok(())
    }

    // --- PDF convertidos -------------------------------------------------------------

    pub fn add_conversion(&self, result: &ConvertResult) -> AppResult<()> {
        let conn = lock(&self.conn);
        conn.execute(
            "INSERT INTO conversions (source, output, name, size, engine, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                result.source,
                result.output,
                result.name,
                i64::try_from(result.size).unwrap_or(i64::MAX),
                result.engine,
                now_ms()
            ],
        )?;
        // Solo guardamos los 200 últimos.
        conn.execute(
            "DELETE FROM conversions WHERE id NOT IN (SELECT id FROM conversions ORDER BY id DESC LIMIT 200)",
            [],
        )?;
        Ok(())
    }

    /// Los últimos PDF, del más nuevo al más antiguo.
    pub fn conversions(&self, limit: usize) -> AppResult<Vec<ConvertResult>> {
        let conn = lock(&self.conn);
        let mut stmt =
            conn.prepare("SELECT source, output, name, size, engine FROM conversions ORDER BY id DESC LIMIT ?1")?;
        let limit = i64::try_from(limit).unwrap_or(i64::MAX);
        let rows = stmt.query_map(params![limit], |r| {
            Ok(ConvertResult {
                source: r.get(0)?,
                output: r.get(1)?,
                name: r.get(2)?,
                size: u64::try_from(r.get::<_, i64>(3)?).unwrap_or(0),
                engine: r.get(4)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn clear_conversions(&self) -> AppResult<()> {
        lock(&self.conn).execute("DELETE FROM conversions", [])?;
        Ok(())
    }

    // --- Mantenimiento ---------------------------------------------------------------

    pub fn info(&self) -> AppResult<DbInfo> {
        let conn = lock(&self.conn);
        let count = |sql: &str| conn.query_row(sql, [], |r| r.get::<_, i64>(0));
        let bytes = ["", "-wal"]
            .iter()
            .filter_map(|suffix| std::fs::metadata(format!("{}{suffix}", self.path.display())).ok())
            .map(|m| m.len())
            .sum();
        Ok(DbInfo {
            path: self.path.to_string_lossy().into_owned(),
            bytes,
            messages: count("SELECT COUNT(*) FROM messages")?,
            conversations: count("SELECT COUNT(*) FROM (SELECT DISTINCT workspace, tico FROM messages)")?,
            conversions: count("SELECT COUNT(*) FROM conversions")?,
        })
    }

    /// Copia de seguridad completa y compacta en `target` (no puede existir).
    pub fn backup_to(&self, target: &Path) -> AppResult<()> {
        let target = target.to_string_lossy().into_owned();
        lock(&self.conn).execute("VACUUM INTO ?1", params![target])?;
        Ok(())
    }
}

fn migrate(conn: &Connection) -> AppResult<()> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version > SCHEMA_VERSION {
        // Base de datos de una versión más nueva de Tico: la usamos tal cual.
        return Ok(());
    }
    if version < 1 {
        conn.execute_batch(SCHEMA_V1)?;
    }
    conn.execute_batch(&format!("PRAGMA user_version = {SCHEMA_VERSION}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::IslandPosition;

    #[test]
    fn settings_roundtrip() {
        let db = Db::in_memory();
        assert!(db.load_settings().is_none());
        let s = Settings { island_position: IslandPosition::Left, ..Settings::default() }.sanitized();
        db.save_settings(&s).unwrap();
        db.save_settings(&s).unwrap();
        assert_eq!(db.load_settings(), Some(s));
    }

    #[test]
    fn conversations_are_kept_per_workspace_and_tico() {
        let db = Db::in_memory();
        let files = serde_json::json!([{ "name": "tema1.docx" }]);
        db.add_exchange("clase", "teach", "¿Qué es una célula?", &files, false, "La unidad de la vida.").unwrap();
        db.add_exchange("clase", "teach", "¿Y un átomo?", &serde_json::json!([]), true, "La unidad de la materia.").unwrap();
        db.add_exchange("trabajo", "teach", "Hola", &serde_json::json!([]), false, "¡Hola!").unwrap();

        let clase = db.history("clase", "teach", 100).unwrap();
        assert_eq!(clase.len(), 4);
        assert_eq!(clase[0].text, "¿Qué es una célula?");
        assert_eq!(clase[0].files[0]["name"], "tema1.docx");
        assert_eq!(clase[1].role, "assistant");
        assert!(clase[2].capture);
        // Con límite, salen los últimos y en orden.
        let last = db.history("clase", "teach", 2).unwrap();
        assert_eq!(last[0].text, "¿Y un átomo?");
        assert_eq!(last[1].text, "La unidad de la materia.");

        db.forget_last_exchange("clase", "teach").unwrap();
        assert_eq!(db.history("clase", "teach", 100).unwrap().len(), 2);
        db.clear_chat("clase", "teach").unwrap();
        assert!(db.history("clase", "teach", 100).unwrap().is_empty());
        assert_eq!(db.history("trabajo", "teach", 100).unwrap().len(), 2);
        assert_eq!(db.info().unwrap().conversations, 1);
    }

    #[test]
    fn deleted_ticos_lose_their_chats() {
        let db = Db::in_memory();
        db.add_exchange("general", "tico", "a", &serde_json::json!([]), false, "b").unwrap();
        db.add_exchange("general", "borrado", "a", &serde_json::json!([]), false, "b").unwrap();
        db.add_exchange("viejo", "tico", "a", &serde_json::json!([]), false, "b").unwrap();
        db.prune(&Settings::default().sanitized()).unwrap();
        let info = db.info().unwrap();
        assert_eq!(info.conversations, 1);
        assert_eq!(info.messages, 2);
    }

    #[test]
    fn conversions_newest_first() {
        let db = Db::in_memory();
        for name in ["uno.docx", "dos.docx"] {
            db.add_conversion(&ConvertResult {
                source: name.into(),
                output: format!("/tmp/{name}.pdf"),
                name: name.into(),
                size: 1234,
                engine: "tico".into(),
            })
            .unwrap();
        }
        let list = db.conversions(10).unwrap();
        assert_eq!(list[0].name, "dos.docx");
        assert_eq!(list[1].size, 1234);
        db.clear_conversions().unwrap();
        assert!(db.conversions(10).unwrap().is_empty());
    }

    #[test]
    fn file_database_survives_reopen_and_backup() {
        let dir = std::env::temp_dir().join(format!("tico-db-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("tico.db");
        {
            let db = Db::open(&path).unwrap();
            db.add_exchange("general", "tico", "¿Sigues ahí?", &serde_json::json!([]), false, "¡Sí!").unwrap();
            db.backup_to(&dir.join("copia.db")).unwrap();
        }
        let db = Db::open(&path).unwrap();
        assert_eq!(db.history("general", "tico", 10).unwrap().len(), 2);
        let copy = Db::open(&dir.join("copia.db")).unwrap();
        assert_eq!(copy.history("general", "tico", 10).unwrap()[1].text, "¡Sí!");
        drop((db, copy));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn broken_file_is_set_aside() {
        let dir = std::env::temp_dir().join(format!("tico-db-broken-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("tico.db");
        std::fs::write(&path, b"esto no es sqlite, es basura ".repeat(200)).unwrap();
        let db = Db::open(&path).unwrap();
        db.save_settings(&Settings::default()).unwrap();
        assert!(db.load_settings().is_some());
        let broken = std::fs::read_dir(&dir).unwrap().filter_map(Result::ok).any(|e| e.file_name().to_string_lossy().contains("broken"));
        assert!(broken);
        drop(db);
        let _ = std::fs::remove_dir_all(dir);
    }
}
