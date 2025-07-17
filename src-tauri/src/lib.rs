// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(serde::Serialize)]
struct SegmentResult {
    v: String,
    r: Vec<String>
}

#[tauri::command]
fn segment(text: String) -> Vec<SegmentResult> {
    vec![SegmentResult{ v: text, r: vec![] }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, segment])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
