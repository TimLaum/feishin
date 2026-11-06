//! Équivalent d'electron-store : un settings.json dans le dossier de config de l'appli.
//! Le renderer garde une copie en mémoire (src/tauri/settings-cache.ts) et renvoie tout l'objet à chaque modif.

use std::path::PathBuf;

use serde_json::{Map, Value};
use tauri::{AppHandle, Manager};

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

pub fn load(app: &AppHandle) -> Value {
    config_dir(app)
        .ok()
        .and_then(|dir| std::fs::read(dir.join("settings.json")).ok())
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .filter(Value::is_object)
        .unwrap_or_else(|| Value::Object(Map::new()))
}

pub fn save(app: &AppHandle, value: &Value) -> Result<(), String> {
    let dir = config_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    // écriture puis renommage : un plantage en plein milieu ne vide pas les réglages
    let tmp = dir.join("settings.json.tmp");
    std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join("settings.json")).map_err(|e| e.to_string())
}

pub fn custom_css_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join("custom.css"))
}
