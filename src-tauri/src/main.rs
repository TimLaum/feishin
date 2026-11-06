// Pas de console noire derrière la fenêtre sous Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    feishin_tauri_lib::run()
}
