// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      db::db_get_config,
      db::db_save_config,
      db::db_test_connection,
      db::db_push,
      db::db_pull,
      db::local_save,
      db::local_load,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
