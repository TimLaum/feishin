//! Fonctions pures du hors-ligne (chemins, extensions, plages d'octets), testables sans Tauri :
//! `rustc --edition 2021 --test src/paths.rs && ./paths`

use std::path::{Component, Path, PathBuf};

// Morceau maxi renvoyé par requête Range : le lecteur redemande la suite tout seul
pub const MAX_CHUNK: u64 = 8 * 1024 * 1024;

pub fn sanitize(segment: &str) -> String {
    segment
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || "._-".contains(c) { c } else { '_' })
        .collect()
}

/// Refuse tout chemin qui sortirait du dossier hors ligne (`..`, chemin absolu, lecteur Windows).
pub fn resolve_safe(root: &Path, rel: &str) -> Option<PathBuf> {
    let rel_path = Path::new(rel);
    let mut components = rel_path.components().peekable();
    components.peek()?;
    components
        .all(|c| matches!(c, Component::Normal(_)))
        .then(|| root.join(rel_path))
}

pub fn guess_ext(url: &str, container: Option<&str>) -> String {
    if let Some(c) = container {
        if (2..=5).contains(&c.len()) && c.chars().all(|ch| ch.is_ascii_alphanumeric()) {
            return c.to_lowercase();
        }
    }
    // chemin de l'URL sans schéma, hôte, requête ni ancre
    let after_scheme = url.split_once("://").map_or(url, |(_, rest)| rest);
    let path = after_scheme.find('/').map_or("", |i| &after_scheme[i..]);
    let path = path.split(['?', '#']).next().unwrap_or("");
    Path::new(path)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .filter(|e| !e.is_empty() && e.len() <= 5)
        .unwrap_or_else(|| "mp3".into())
}

/// "bytes=a-b" -> (début, fin incluse), bornée à la taille du fichier et à MAX_CHUNK.
/// None = plage invalide (416).
pub fn parse_range(header: &str, size: u64) -> Option<(u64, u64)> {
    let spec = header.trim().strip_prefix("bytes=")?;
    let (start, end) = spec.split_once('-')?;
    let start: u64 = if start.is_empty() { 0 } else { start.parse().ok()? };
    let end: u64 = if end.is_empty() { size.checked_sub(1)? } else { end.parse().ok()? };
    if start >= size || end >= size || start > end {
        return None;
    }
    Some((start, end.min(start + MAX_CHUNK - 1)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_safe_rejects_escapes() {
        let root = Path::new("/data/offline-audio");
        assert!(resolve_safe(root, "srv/song.flac").is_some());
        assert!(resolve_safe(root, "../x").is_none());
        assert!(resolve_safe(root, "srv/../../x").is_none());
        assert!(resolve_safe(root, "/etc/passwd").is_none());
        assert!(resolve_safe(root, "").is_none());
        assert!(resolve_safe(root, "..").is_none());
    }

    #[test]
    fn sanitize_and_ext() {
        assert_eq!(sanitize("a b/é"), "a_b__");
        assert_eq!(guess_ext("http://x/a.FLAC?y=1", None), "flac");
        assert_eq!(guess_ext("http://x/rest/stream.view?id=1", Some("Opus")), "opus");
        assert_eq!(guess_ext("http://x/rest/stream", None), "mp3");
        assert_eq!(guess_ext("http://host.fr", None), "mp3");
        assert_eq!(guess_ext("http://x/a.mp3#t", None), "mp3");
        assert_eq!(guess_ext("http://x/a.toolongext", None), "mp3");
    }

    #[test]
    fn ranges() {
        assert_eq!(parse_range("bytes=0-", 100), Some((0, 99)));
        assert_eq!(parse_range("bytes=10-19", 100), Some((10, 19)));
        assert_eq!(parse_range("bytes=100-", 100), None);
        assert_eq!(parse_range("bytes=5-1", 100), None);
        assert_eq!(parse_range("bytes=0-", 0), None);
        let big = 100 * 1024 * 1024;
        assert_eq!(parse_range("bytes=0-", big), Some((0, MAX_CHUNK - 1)));
    }
}
