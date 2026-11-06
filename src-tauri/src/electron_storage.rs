//! Lecture du localStorage de Feishin Electron (base LevelDB de Chromium, `Local Storage/leveldb`),
//! utilisée quand l'export de migration n'existe pas (PC resté en version < 1.18.1).
//! Format Chromium : clé = "_" + origine + 0x00 + nom, le nom et la valeur commençant par un octet
//! d'encodage (0x01 = Latin-1, 0x00 = UTF-16LE).

use std::path::Path;

use rusty_leveldb::{LdbIterator, Options, DB};
use serde_json::{Map, Value};

// Electron charge l'interface depuis file:// (src/main/index.ts, loadFile)
const ORIGIN: &[u8] = b"_file://";

fn decode(bytes: &[u8]) -> Option<String> {
    let (&encoding, data) = bytes.split_first()?;
    match encoding {
        1 => Some(data.iter().map(|&b| b as char).collect()),
        0 if data.len() % 2 == 0 => {
            let units: Vec<u16> = data.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
            String::from_utf16(&units).ok()
        }
        _ => None,
    }
}

/// (nom, valeur) d'une entrée localStorage de l'origine file://, sinon None
pub fn parse_entry(key: &[u8], value: &[u8]) -> Option<(String, String)> {
    let rest = key.strip_prefix(ORIGIN)?.strip_prefix(&[0u8][..])?;
    Some((decode(rest)?, decode(value)?))
}

/// Copie la base (Chromium peut la garder verrouillée) puis en lit toutes les entrées file://.
pub fn read_local_storage(leveldb_dir: &Path, scratch: &Path) -> Option<Map<String, Value>> {
    if !leveldb_dir.is_dir() {
        return None;
    }
    let _ = std::fs::remove_dir_all(scratch);
    std::fs::create_dir_all(scratch).ok()?;
    for entry in std::fs::read_dir(leveldb_dir).ok()?.flatten() {
        let name = entry.file_name();
        if name != "LOCK" && entry.path().is_file() {
            std::fs::copy(entry.path(), scratch.join(&name)).ok()?;
        }
    }
    let result = (|| {
        let mut db = DB::open(scratch, Options { create_if_missing: false, ..Options::default() }).ok()?;
        let mut iter = db.new_iter().ok()?;
        let mut map = Map::new();
        while let Some((key, value)) = iter.next() {
            if let Some((name, value)) = parse_entry(&key, &value) {
                map.insert(name, Value::String(value));
            }
        }
        Some(map)
    })();
    let _ = std::fs::remove_dir_all(scratch);
    result.filter(|m| !m.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn utf16(s: &str) -> Vec<u8> {
        std::iter::once(0u8).chain(s.encode_utf16().flat_map(u16::to_le_bytes)).collect()
    }

    #[test]
    fn reads_chromium_local_storage() {
        let tmp = std::env::temp_dir().join(format!("feishin-ls-test-{}", std::process::id()));
        let db_dir = tmp.join("leveldb");
        {
            let mut db = DB::open(&db_dir, Options { create_if_missing: true, ..Options::default() }).unwrap();
            let mut key = b"_file://\x00\x01store_settings".to_vec();
            db.put(&key, &utf16(r#"{"replayGainMode":"track","path":"\\\\nas\\music","titre":"夜のピエロ"}"#)).unwrap();
            key = b"_file://\x00\x01umami.disabled".to_vec();
            db.put(&key, b"\x011").unwrap();
            db.put(b"_https://autre.site\x00\x01store_settings", b"\x01x").unwrap();
            db.put(b"META:file://", b"meta").unwrap();
            db.put(b"VERSION", b"1").unwrap();
            db.flush().unwrap();
        }
        let map = read_local_storage(&db_dir, &tmp.join("scratch")).unwrap();
        assert_eq!(map.len(), 2);
        assert_eq!(
            map["store_settings"],
            r#"{"replayGainMode":"track","path":"\\\\nas\\music","titre":"夜のピエロ"}"#
        );
        assert_eq!(map["umami.disabled"], "1");
        assert!(read_local_storage(&tmp.join("absent"), &tmp.join("s2")).is_none());
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
