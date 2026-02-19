use std::path::PathBuf;

use tauri::Manager;

use crate::ja_tokenize::{LinderaAnalyzer, SegmentResult};
use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::AppHandle;

#[cfg(feature = "yomitan_import")]
mod yomitan_import;

#[cfg(feature = "yomitan_import")]
use yomitan_import::{find_resources_dir, import_bundled_zips};

#[cfg(not(feature = "yomitan_import"))]
fn find_resources_dir() -> Option<std::path::PathBuf> {
    None
}

#[cfg(not(feature = "yomitan_import"))]
fn import_bundled_zips(_db_path: &std::path::Path, _res: &std::path::Path) -> anyhow::Result<()> {
    Ok(())
}

pub mod ja_tokenize;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn segment(text: &str, state: tauri::State<MyState>) -> Result<Vec<SegmentResult>, ()> {
    let result = state.lindera.analyze(text);
    Ok(result.unwrap())
}

#[derive(Serialize)]
struct SearchRow {
    term: String,
    reading: String,
    def_tags: String,
    rules: String,
    score: i64,
    glossary_json: String,
    sequence: Option<i64>,
    term_tags: String,
    dict_title: String,
}

#[tauri::command]
fn search_terms(app: AppHandle, q_term: String, q_reading: String, limit: u32, offset: u32) -> Result<Vec<SearchRow>, String> {
    let cfg_dir = app.path().config_dir();
    let app_dir = cfg_dir
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        .join("cc.polv.cjdic");
    let _ = std::fs::create_dir_all(&app_dir);
    let db_path = app_dir.join("yomitan.db");
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let sql = r#"
      SELECT
        t.term,
        t.reading,
        COALESCE(dt.tags,  '')  AS def_tags,
        COALESCE(r.rules,  '')  AS rules,
        t.score,
        g.content               AS glossary_json,
        t.sequence,
        COALESCE(tt.tags,  '')  AS term_tags,
        d.title                 AS dict_title
      FROM terms t
      JOIN  glossaries    g  ON g.id  = t.glossary_id
      JOIN  dictionaries  d  ON d.id  = t.dict_id
      LEFT JOIN def_tag_sets  dt ON dt.id = t.def_tags_id
      LEFT JOIN rule_sets      r ON r.id  = t.rules_id
      LEFT JOIN term_tag_sets tt ON tt.id = t.term_tags_id
      WHERE t.term LIKE ?1 ESCAPE '\' OR t.reading LIKE ?2 ESCAPE '\'
      ORDER BY t.score DESC
      LIMIT ?3 OFFSET ?4
    "#;

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![q_term, q_reading, limit, offset], |r| {
            Ok(SearchRow {
                term: r.get(0)?,
                reading: r.get(1)?,
                def_tags: r.get(2)?,
                rules: r.get(3)?,
                score: r.get(4)?,
                glossary_json: r.get(5)?,
                sequence: r.get(6)?,
                term_tags: r.get(7)?,
                dict_title: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

struct MyState {
    lindera: LinderaAnalyzer,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // On first run, import bundled dictionaries into app-local `yomitan.db`
            if let Some(res) = find_resources_dir() {
                let cfg_dir = app.path().config_dir();
                let app_dir = cfg_dir
                    .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from(".")))
                    .join("cc.polv.cjdic");
                if let Err(e) = std::fs::create_dir_all(&app_dir) {
                    eprintln!("failed to create app dir {}: {}", app_dir.display(), e);
                } else {
                    let db_path = app_dir.join("yomitan.db");
                    if !db_path.exists() {
                        if let Err(e) = import_bundled_zips(&db_path, &res) {
                            eprintln!("yomitan import failed: {:#?}", e);
                        }
                    }
                }
            }

            app.manage(MyState {
                lindera: LinderaAnalyzer::new()?,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, segment, search_terms])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
