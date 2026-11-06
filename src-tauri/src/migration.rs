//! Reprise des données de Feishin Electron au premier lancement de la version Tauri :
//! localStorage + IndexedDB (réglages, connexion, abonnements hors ligne, file d'attente) pour la
//! webview (src/tauri/bridge.ts), fichiers hors ligne déplacés, thèmes et CSS perso copiés.
//! Une seule fois : marqueur `.electron-migrated` posé quand la webview a tout réimporté.

use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::electron_storage::read_local_storage;

const MARKER: &str = ".electron-migrated";

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// %APPDATA%\feishin sous Windows (userData d'Electron, nom « feishin » du package.json)
fn electron_dir(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().config_dir().ok()?.join("feishin");
    dir.is_dir().then_some(dir)
}

/// Déplace les fichiers absents de la destination (même disque : instantané).
fn move_missing(src: &Path, dst: &Path) {
    let Ok(entries) = std::fs::read_dir(src) else { return };
    for entry in entries.flatten() {
        let (from, to) = (entry.path(), dst.join(entry.file_name()));
        if from.is_dir() {
            move_missing(&from, &to);
        } else if !to.exists() && std::fs::create_dir_all(dst).is_ok() {
            // rename échoue entre deux disques : copie puis suppression
            if std::fs::rename(&from, &to).is_err() && std::fs::copy(&from, &to).is_ok() {
                let _ = std::fs::remove_file(&from);
            }
        }
    }
}

fn copy_missing(src: &Path, dst: &Path) {
    let Ok(entries) = std::fs::read_dir(src) else { return };
    for entry in entries.flatten() {
        let (from, to) = (entry.path(), dst.join(entry.file_name()));
        if from.is_dir() {
            copy_missing(&from, &to);
        } else if !to.exists() && std::fs::create_dir_all(dst).is_ok() {
            let _ = std::fs::copy(&from, &to);
        }
    }
}

/// Données à réimporter dans la webview, ou null si rien à faire (déjà migré, pas d'Electron).
pub fn pending(app: &AppHandle) -> Result<Value, String> {
    let ours = app.path().app_config_dir().map_err(err)?;
    if ours.join(MARKER).exists() {
        return Ok(Value::Null);
    }
    let Some(electron) = electron_dir(app) else { return Ok(Value::Null) };

    // export complet écrit par Electron ≥ 1.18.1, sinon localStorage seul relu sur le disque
    let data = std::fs::read(electron.join("tauri-migration.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .or_else(|| {
            let scratch = std::env::temp_dir().join(format!("feishin-migration-{}", std::process::id()));
            read_local_storage(&electron.join("Local Storage").join("leveldb"), &scratch)
                .map(|ls| json!({ "localStorage": ls }))
        })
        .unwrap_or_else(|| json!({}));

    // mêmes chemins relatifs qu'Electron : les entrées hors ligne restent valides
    move_missing(
        &electron.join("offline-audio"),
        &app.path().app_data_dir().map_err(err)?.join("offline-audio"),
    );
    copy_missing(&electron.join("Themes"), &ours.join("Themes"));
    if !ours.join("custom.css").exists() {
        let _ = std::fs::copy(electron.join("custom.css"), ours.join("custom.css"));
    }
    Ok(data)
}

pub fn done(app: &AppHandle) -> Result<Value, String> {
    let ours = app.path().app_config_dir().map_err(err)?;
    std::fs::create_dir_all(&ours).map_err(err)?;
    std::fs::write(ours.join(MARKER), b"").map_err(err)?;
    Ok(Value::Null)
}
