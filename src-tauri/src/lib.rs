mod engine;
mod terminal;

use terminal::TerminalState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .manage(TerminalState::new())
        .invoke_handler(tauri::generate_handler![
            // Terminal commands
            terminal::create_terminal,
            terminal::write_terminal,
            terminal::resize_terminal,
            terminal::kill_terminal,
            // Engine commands
            engine::engine_status,
            engine::engine_start,
            engine::engine_stop,
            engine::engine_restart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
