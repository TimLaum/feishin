//! Statut Discord (Rich Presence) : portage de src/main/features/core/discord-rpc.
//! L'activité reçue du renderer a la forme de `SetActivity` (@xhayper/discord-rpc) ; elle est
//! convertie ici au format de l'IPC Discord exactement comme le fait cette bibliothèque.

use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use discord_rich_presence::{DiscordIpc, DiscordIpcClient};
use serde_json::{json, Map, Value};

const FEISHIN_DISCORD_APPLICATION_ID: &str = "1165957668758900787";

static CLIENT: Mutex<Option<DiscordIpcClient>> = Mutex::new(None);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

fn nonce() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    format!("{}-{}", now_ms(), COUNTER.fetch_add(1, Ordering::Relaxed))
}

pub fn initialize(client_id: Option<&str>) -> Result<(), String> {
    let id = client_id
        .filter(|id| !id.is_empty())
        .unwrap_or(FEISHIN_DISCORD_APPLICATION_ID);
    let mut client = DiscordIpcClient::new(id);
    client
        .connect()
        .map_err(|e| format!("Discord injoignable (lancé ?) : {e}"))?;
    let mut slot = CLIENT.lock().map_err(|e| e.to_string())?;
    if let Some(mut old) = slot.replace(client) {
        let _ = old.close();
    }
    Ok(())
}

pub fn is_connected() -> bool {
    CLIENT.lock().is_ok_and(|c| c.is_some())
}

/// Envoie une commande SET_ACTIVITY et lit la réponse de Discord (sans quoi le tube se remplit).
/// Erreur de tube = Discord fermé : on lâche le client, le renderer se reconnectera.
fn send_activity(activity: Option<Value>) -> Result<Value, String> {
    let mut slot = CLIENT.lock().map_err(|e| e.to_string())?;
    let client = slot.as_mut().ok_or("Discord non connecté")?;
    let mut args = json!({ "pid": std::process::id() });
    if let Some(activity) = activity {
        args["activity"] = activity;
    }
    let payload = json!({ "cmd": "SET_ACTIVITY", "args": args, "nonce": nonce() });
    match client.send(payload, 1).and_then(|_| client.recv()) {
        // Discord répond { evt: "ERROR", data: { code, message } } s'il refuse l'activité
        Ok((_, response)) if response["evt"] == "ERROR" => {
            Err(format!("Discord refuse l'activité : {}", response["data"]))
        }
        Ok((_, response)) => Ok(response),
        Err(e) => {
            if let Some(mut dead) = slot.take() {
                let _ = dead.close();
            }
            Err(format!("Discord déconnecté : {e}"))
        }
    }
}

pub fn set_activity(activity: &Value) -> Result<Value, String> {
    send_activity(Some(format_activity(activity, now_ms())))
}

pub fn clear_activity() -> Result<Value, String> {
    send_activity(None)
}

pub fn quit() {
    if let Ok(mut slot) = CLIENT.lock() {
        if let Some(mut client) = slot.take() {
            let _ = client.close();
        }
    }
}

fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::String(s) => !s.is_empty(),
        Value::Number(n) => n.as_f64() != Some(0.0),
        _ => true,
    }
}

/// Même conversion que `ClientUser.setActivity` de @xhayper/discord-rpc 1.3.
pub fn format_activity(a: &Value, created_at: u64) -> Value {
    const STREAMING: u64 = 1;
    let activity_type = a["type"].as_u64().unwrap_or(0);
    let mut f = Map::new();
    // xhayper envoie `name: undefined`, qui disparaît en JSON ; Discord refuse `null`
    if a["name"].is_string() {
        f.insert("name".into(), a["name"].clone());
    }
    f.insert("type".into(), json!(activity_type));
    f.insert("created_at".into(), json!(created_at));
    f.insert("instance".into(), json!(truthy(&a["instance"])));

    if activity_type == STREAMING && truthy(&a["url"]) {
        f.insert("url".into(), a["url"].clone());
    }
    for (from, to) in [
        ("details", "details"),
        ("state", "state"),
        ("detailsUrl", "details_url"),
        ("stateUrl", "state_url"),
    ] {
        if truthy(&a[from]) {
            f.insert(to.into(), a[from].clone());
        }
    }

    let mut timestamps = Map::new();
    for (from, to) in [("startTimestamp", "start"), ("endTimestamp", "end")] {
        if let Some(ms) = a[from].as_f64() {
            timestamps.insert(to.into(), json!(ms as u64));
        }
    }
    if !timestamps.is_empty() {
        f.insert("timestamps".into(), Value::Object(timestamps));
    }

    let mut assets = Map::new();
    for (from, to) in [
        ("largeImageKey", "large_image"),
        ("smallImageKey", "small_image"),
        ("largeImageText", "large_text"),
        ("smallImageText", "small_text"),
        ("largeImageUrl", "large_url"),
        ("smallImageUrl", "small_url"),
    ] {
        if truthy(&a[from]) {
            assets.insert(to.into(), a[from].clone());
        }
    }
    if !assets.is_empty() {
        f.insert("assets".into(), Value::Object(assets));
    }

    if !a["statusDisplayType"].is_null() {
        f.insert("status_display_type".into(), a["statusDisplayType"].clone());
    }
    if a["buttons"].as_array().is_some_and(|b| !b.is_empty()) {
        f.insert("buttons".into(), a["buttons"].clone());
    }
    Value::Object(f)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_like_xhayper() {
        let a = json!({
            "name": "Feishin", "type": 2, "details": "Red Swan", "state": "",
            "startTimestamp": 1000.0, "endTimestamp": 2000,
            "largeImageKey": "https://x/cover.jpg", "largeImageText": "Red Swan",
            "smallImageKey": null, "statusDisplayType": 1, "url": "http://ignored",
        });
        let f = format_activity(&a, 42);
        assert_eq!(
            f,
            json!({
                "name": "Feishin", "type": 2, "created_at": 42, "instance": false,
                "details": "Red Swan",
                "timestamps": { "start": 1000, "end": 2000 },
                "assets": { "large_image": "https://x/cover.jpg", "large_text": "Red Swan" },
                "status_display_type": 1,
            })
        );
        let empty = format_activity(&json!({ "name": "F" }), 1);
        assert!(empty.get("timestamps").is_none() && empty.get("assets").is_none());
        // sans nom (cas réel de Feishin) : pas de clé "name" du tout, sinon Discord renvoie 4000
        assert!(format_activity(&json!({ "type": 2 }), 1).get("name").is_none());
    }
}
