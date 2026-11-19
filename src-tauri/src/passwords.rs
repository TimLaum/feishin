//! Mots de passe serveur enregistrés (canaux password-get/set/remove du preload), comme
//! safeStorage d'Electron : sans eux le renderer ne peut pas se reconnecter seul quand la
//! session Navidrome (24 h) expire. passwords.json = { serverId: hex }, chiffré par DPAPI
//! sous Windows (lié au compte Windows) ; ailleurs (Android) en clair dans le dossier privé
//! de l'appli.

use std::path::PathBuf;

use serde_json::{Map, Value};
use tauri::{AppHandle, Manager};

fn file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("passwords.json"))
}

fn load(app: &AppHandle) -> Map<String, Value> {
    file(app)
        .ok()
        .and_then(|path| std::fs::read(path).ok())
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn save(app: &AppHandle, map: &Map<String, Value>) -> Result<(), String> {
    let path = file(app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec(map).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

pub fn get(app: &AppHandle, server: &str) -> Option<String> {
    let hex = load(app).get(server)?.as_str()?.to_string();
    let bytes = (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(hex.get(i..i + 2)?, 16).ok())
        .collect::<Option<Vec<u8>>>()?;
    String::from_utf8(unprotect(&bytes)?).ok()
}

pub fn set(app: &AppHandle, server: &str, password: &str) -> bool {
    let Some(bytes) = protect(password.as_bytes()) else { return false };
    let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    let mut map = load(app);
    map.insert(server.to_string(), Value::String(hex));
    save(app, &map).is_ok()
}

pub fn remove(app: &AppHandle, server: &str) {
    let mut map = load(app);
    if map.remove(server).is_some() {
        let _ = save(app, &map);
    }
}

#[cfg(windows)]
fn dpapi(data: &[u8], encrypt: bool) -> Option<Vec<u8>> {
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };
    let input = CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 };
    let mut out = CRYPT_INTEGER_BLOB::default();
    unsafe {
        if encrypt {
            CryptProtectData(&input, None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out)
        } else {
            CryptUnprotectData(&input, None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out)
        }
        .ok()?;
        let result = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
        LocalFree(Some(HLOCAL(out.pbData as _)));
        Some(result)
    }
}

#[cfg(windows)]
fn protect(data: &[u8]) -> Option<Vec<u8>> {
    dpapi(data, true)
}

#[cfg(windows)]
fn unprotect(data: &[u8]) -> Option<Vec<u8>> {
    dpapi(data, false)
}

#[cfg(not(windows))]
fn protect(data: &[u8]) -> Option<Vec<u8>> {
    Some(data.to_vec())
}

#[cfg(not(windows))]
fn unprotect(data: &[u8]) -> Option<Vec<u8>> {
    Some(data.to_vec())
}
