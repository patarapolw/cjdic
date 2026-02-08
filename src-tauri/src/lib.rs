use tauri::Manager;

use crate::ja_tokenize::{LinderaAnalyzer, SegmentResult};

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

struct MyState {
    lindera: LinderaAnalyzer,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(MyState {
                lindera: LinderaAnalyzer::new()?,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, segment])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
