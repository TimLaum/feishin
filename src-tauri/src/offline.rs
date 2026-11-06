//! Écoute hors ligne : portage de src/main/features/core/offline-downloads.
//! Fichiers dans <app_data>/offline-audio/<serverId>/<songId>.<ext>, servis au lecteur web
//! par le protocole feishin:// (http://feishin.localhost/offline/... sous Windows et Android).

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use tauri::http::{Request, Response, StatusCode};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

use crate::paths::{guess_ext, parse_range, resolve_safe, sanitize, MAX_CHUNK};

pub fn root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("offline-audio"))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DownloadArgs {
    container: Option<String>,
    cover_url: Option<String>,
    key: String,
    url: String,
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

async fn download_to_file(app: &AppHandle, key: &str, url: &str, path: &Path) -> Result<u64, String> {
    let response = reqwest::get(url).await.map_err(err)?;
    let status = response.status();
    if status.as_u16() >= 400 {
        return Err(format!("HTTP {status}"));
    }
    let total = response.content_length().unwrap_or(0);
    // fichier .part renommé à la fin : un téléchargement coupé ne passe jamais pour complet
    let part = path.with_extension("part");
    let result = async {
        let mut file = tokio::fs::File::create(&part).await.map_err(err)?;
        let mut stream = response.bytes_stream();
        let mut received = 0u64;
        let mut last_report = Instant::now() - Duration::from_secs(1);
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(err)?;
            file.write_all(&chunk).await.map_err(err)?;
            received += chunk.len() as u64;
            if last_report.elapsed() > Duration::from_millis(250) {
                last_report = Instant::now();
                let _ = app.emit(
                    "offline-download-progress",
                    json!({ "key": key, "received": received, "total": total }),
                );
            }
        }
        file.flush().await.map_err(err)?;
        drop(file);
        tokio::fs::rename(&part, path).await.map_err(err)?;
        Ok(received)
    }
    .await;
    if result.is_err() {
        let _ = tokio::fs::remove_file(&part).await;
    }
    result
}

async fn download_cover(url: &str, dir: &Path, song_id: &str) -> Option<String> {
    let response = reqwest::get(url).await.ok()?;
    if response.status().as_u16() >= 400 {
        return None;
    }
    let is_png = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.contains("png"));
    let ext = if is_png { "png" } else { "jpg" };
    let bytes = response.bytes().await.ok()?;
    tokio::fs::write(dir.join(format!("{song_id}.{ext}")), bytes).await.ok()?;
    Some(ext.to_string())
}

pub async fn download(app: &AppHandle, args: Value) -> Result<Value, String> {
    let args: DownloadArgs = serde_json::from_value(args).map_err(err)?;
    let mut segments = args.key.split('/');
    let server_dir = sanitize(segments.next().unwrap_or("default"));
    let song_id = sanitize(segments.next().unwrap_or(&args.key));

    let ext = guess_ext(&args.url, args.container.as_deref());
    let rel_path = format!("{server_dir}/{song_id}.{ext}");
    let path = resolve_safe(&root(app)?, &rel_path)
        .ok_or_else(|| format!("Invalid offline path: {rel_path}"))?;
    let dir = path.parent().ok_or("no parent dir")?.to_path_buf();
    tokio::fs::create_dir_all(&dir).await.map_err(err)?;

    let size = download_to_file(app, &args.key, &args.url, &path).await?;

    // Pochette : best-effort, un échec n'annule pas le téléchargement audio
    let cover_rel_path = match &args.cover_url {
        Some(url) => download_cover(url, &dir, &song_id)
            .await
            .map(|cover_ext| format!("{server_dir}/{song_id}.{cover_ext}")),
        None => None,
    };

    Ok(json!({
        "coverRelPath": cover_rel_path,
        "filePath": path.to_string_lossy(),
        "relPath": rel_path,
        "size": size,
    }))
}

pub async fn remove(app: &AppHandle, rel_paths: Vec<String>) -> Result<Value, String> {
    let root = root(app)?;
    for rel in rel_paths {
        if let Some(path) = resolve_safe(&root, &rel) {
            let _ = tokio::fs::remove_file(path).await;
        }
    }
    Ok(Value::Null)
}

pub async fn verify(app: &AppHandle, rel_paths: Vec<String>) -> Result<Value, String> {
    let root = root(app)?;
    let mut result = Map::new();
    for rel in rel_paths {
        let ok = match resolve_safe(&root, &rel) {
            Some(path) => tokio::fs::metadata(path)
                .await
                .is_ok_and(|m| m.is_file() && m.len() > 0),
            None => false,
        };
        result.insert(rel, Value::Bool(ok));
    }
    Ok(Value::Object(result))
}

fn mime(path: &Path) -> &'static str {
    match path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .as_deref()
    {
        Some("aac") => "audio/aac",
        Some("flac") => "audio/flac",
        Some("jpeg" | "jpg") => "image/jpeg",
        Some("m4a") => "audio/mp4",
        Some("mp3") => "audio/mpeg",
        Some("ogg" | "opus") => "audio/ogg",
        Some("png") => "image/png",
        Some("wav") => "audio/wav",
        Some("webm") => "audio/webm",
        Some("webp") => "image/webp",
        _ => "application/octet-stream",
    }
}

fn status(code: StatusCode) -> Response<Vec<u8>> {
    Response::builder().status(code).body(Vec::new()).unwrap()
}

/// Protocole feishin:// : sert un fichier hors ligne avec support Range (nécessaire au seek).
pub fn serve(app: &AppHandle, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    use std::io::{Read, Seek, SeekFrom};

    let Some(encoded) = request.uri().path().strip_prefix("/offline/") else {
        return status(StatusCode::NOT_FOUND);
    };
    let Ok(rel_path) = percent_encoding::percent_decode_str(encoded).decode_utf8() else {
        return status(StatusCode::BAD_REQUEST);
    };
    let Some(path) = root(app).ok().and_then(|r| resolve_safe(&r, &rel_path)) else {
        return status(StatusCode::FORBIDDEN);
    };
    let Ok(mut file) = std::fs::File::open(&path) else {
        return status(StatusCode::NOT_FOUND);
    };
    let size = file.metadata().map(|m| m.len()).unwrap_or(0);

    let range = request
        .headers()
        .get("range")
        .and_then(|v| v.to_str().ok())
        .map(|h| parse_range(h, size));
    let (start, end, code) = match range {
        Some(Some((start, end))) => (start, end, StatusCode::PARTIAL_CONTENT),
        Some(None) => {
            return Response::builder()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header("Content-Range", format!("bytes */{size}"))
                .body(Vec::new())
                .unwrap();
        }
        // sans Range, on renvoie aussi un morceau : le lecteur enchaîne en Range ensuite
        None if size > MAX_CHUNK => (0, MAX_CHUNK - 1, StatusCode::PARTIAL_CONTENT),
        None => (0, size.saturating_sub(1), StatusCode::OK),
    };

    let len = if size == 0 { 0 } else { end - start + 1 };
    let mut body = vec![0u8; len as usize];
    if file.seek(SeekFrom::Start(start)).is_err() || file.read_exact(&mut body).is_err() {
        return status(StatusCode::INTERNAL_SERVER_ERROR);
    }

    let mut response = Response::builder()
        .status(code)
        .header("Accept-Ranges", "bytes")
        .header("Content-Type", mime(&path))
        .header("Content-Length", len.to_string())
        // le lecteur web passe par Web Audio (crossOrigin) : sans ça le son est muet
        .header("Access-Control-Allow-Origin", "*");
    if code == StatusCode::PARTIAL_CONTENT {
        response = response.header("Content-Range", format!("bytes {start}-{end}/{size}"));
    }
    response.body(body).unwrap()
}
