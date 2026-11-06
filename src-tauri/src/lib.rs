mod discord;
mod electron_storage;
mod migration;
mod offline;
mod paths;
mod settings;
#[cfg(windows)]
mod thumbar;

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_opener::OpenerExt;

fn arg(args: &[Value], i: usize) -> Value {
    args.get(i).cloned().unwrap_or(Value::Null)
}

fn arg_vec(args: &[Value], i: usize) -> Vec<String> {
    serde_json::from_value(arg(args, i)).unwrap_or_default()
}

fn open_dir(app: &AppHandle, dir: std::path::PathBuf) -> Result<Value, String> {
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(Value::Null)
}

/// Point d'entrée unique des canaux ipcRenderer.invoke/send du preload Electron
/// (src/tauri/electron-shim.ts). Un canal non porté répond null, comme un handler absent.
#[tauri::command]
async fn ipc(
    app: AppHandle,
    window: WebviewWindow,
    channel: String,
    args: Vec<Value>,
) -> Result<Value, String> {
    match channel.as_str() {
        "settings-load" => Ok(settings::load(&app)),
        "settings-save" => settings::save(&app, &arg(&args, 0)).map(|_| Value::Null),

        "offline-download" => offline::download(&app, arg(&args, 0)).await,
        "offline-remove" => offline::remove(&app, arg_vec(&args, 0)).await,
        "offline-verify" => offline::verify(&app, arg_vec(&args, 0)).await,
        "offline-open-folder" => open_dir(&app, offline::root(&app)?),

        "custom-css-get" => {
            let path = settings::custom_css_path(&app)?;
            let content = std::fs::read_to_string(&path).ok();
            Ok(json!({
                "content": content.clone().unwrap_or_default(),
                "exists": content.is_some(),
                "path": path.to_string_lossy(),
            }))
        }
        "custom-css-save" => {
            let content = arg(&args, 0)["content"].as_str().unwrap_or_default().to_string();
            let path = settings::custom_css_path(&app)?;
            if let Some(dir) = path.parent() {
                std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
            }
            std::fs::write(&path, content).map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "custom-css-open-folder" | "open-application-directory" => {
            open_dir(&app, app.path().app_config_dir().map_err(|e| e.to_string())?)
        }
        "logger-open-folder" => open_dir(&app, app.path().app_log_dir().map_err(|e| e.to_string())?),

        // Discord : appels bloquants sur le tube local, hors du fil de l'IPC
        "discord-rpc-initialize" => {
            let id = arg(&args, 0).as_str().map(String::from);
            tauri::async_runtime::spawn_blocking(move || discord::initialize(id.as_deref()))
                .await
                .map_err(|e| e.to_string())??;
            Ok(Value::Null)
        }
        "discord-rpc-is-connected" => Ok(json!(discord::is_connected())),
        // la réponse de Discord remonte jusqu'à la console de la webview (src/tauri/electron-shim.ts)
        "discord-rpc-set-activity" => {
            let activity = arg(&args, 0);
            tauri::async_runtime::spawn_blocking(move || discord::set_activity(&activity))
                .await
                .map_err(|e| e.to_string())?
        }
        "discord-rpc-clear-activity" => tauri::async_runtime::spawn_blocking(discord::clear_activity)
            .await
            .map_err(|e| e.to_string())?,
        "discord-rpc-quit" => {
            tauri::async_runtime::spawn_blocking(discord::quit);
            Ok(Value::Null)
        }

        // reprise des données de Feishin Electron au premier lancement (src/tauri/bridge.ts)
        "electron-migration-pending" => {
            let app = app.clone();
            tauri::async_runtime::spawn_blocking(move || migration::pending(&app))
                .await
                .map_err(|e| e.to_string())?
        }
        "electron-migration-done" => migration::done(&app),

        "fs-mkdir" | "fs-readdir" | "fs-stat" | "fs-dir-signature" => {
            Ok(fs_op(&channel, arg(&args, 0).as_str().unwrap_or_default()))
        }
        // app.getPath() d'Electron pour les modules main exécutés dans la webview
        "app-paths" => Ok(json!({
            "userData": app.path().app_config_dir().map_err(|e| e.to_string())?.to_string_lossy(),
        })),

        "fs-access" => Ok(fs_access(
            arg(&args, 0).as_str().unwrap_or_default(),
            arg(&args, 1).as_u64().unwrap_or(0),
        )),

        "window-dev-tools" => {
            window.open_devtools();
            Ok(Value::Null)
        }

        _ => {
            eprintln!("[ipc] canal non porté : {channel}");
            Ok(Value::Null)
        }
    }
}

/// Lecture d'un fichier audio/image pour l'éditeur de tags (src/tauri/main-shims/fs.ts),
/// renvoyée en binaire brut plutôt qu'en JSON.
#[tauri::command]
async fn fs_read(path: String) -> Result<tauri::ipc::Response, String> {
    tokio::fs::read(&path)
        .await
        .map(tauri::ipc::Response::new)
        .map_err(|e| format!("{path} : {e}"))
}

/// Réécriture d'un fichier après édition des tags. Corps binaire brut, chemin dans l'en-tête
/// `path` (encodé). Écrit à côté puis remplace : une coupure en plein milieu laisse l'original intact.
#[tauri::command]
async fn fs_write(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
        return Err("corps binaire attendu".into());
    };
    let encoded = request
        .headers()
        .get("path")
        .and_then(|v| v.to_str().ok())
        .ok_or("en-tête path manquant")?;
    let path = percent_encoding::percent_decode_str(encoded)
        .decode_utf8()
        .map_err(|e| e.to_string())?
        .into_owned();
    let tmp = format!("{path}.feishin-tmp");
    let result = async {
        tokio::fs::write(&tmp, data).await?;
        tokio::fs::rename(&tmp, &path).await
    }
    .await;
    if let Err(e) = result {
        let _ = tokio::fs::remove_file(&tmp).await;
        return Err(format!("{path} : {e}"));
    }
    Ok(())
}

/// Erreur façon Node pour les shims fs : { code, error }
fn fs_error(path: &str, e: &std::io::Error) -> Value {
    json!({
        "code": if e.kind() == std::io::ErrorKind::NotFound { "ENOENT" } else { "EIO" },
        "error": format!("{path} : {e}"),
    })
}

/// Opérations de dossier des modules main exécutés dans la webview (src/tauri/main-shims/fs.ts)
fn fs_op(channel: &str, path: &str) -> Value {
    let result = match channel {
        "fs-mkdir" => std::fs::create_dir_all(path).map(|_| Value::Null),
        "fs-readdir" => std::fs::read_dir(path).map(|entries| {
            json!(entries
                .filter_map(|e| e.ok().map(|e| e.file_name().to_string_lossy().into_owned()))
                .collect::<Vec<_>>())
        }),
        // suit les liens symboliques, comme fs.stat
        "fs-stat" => std::fs::metadata(path)
            .map(|m| json!({ "isDirectory": m.is_dir(), "isFile": m.is_file() })),
        // empreinte nom/taille/date de chaque entrée : sert à détecter un changement (fs.watch)
        "fs-dir-signature" => std::fs::read_dir(path).map(|entries| {
            let mut items: Vec<String> = entries
                .filter_map(Result::ok)
                .map(|e| {
                    let meta = e.metadata().ok();
                    let modified = meta
                        .as_ref()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map_or(0, |d| d.as_millis());
                    let size = meta.map_or(0, |m| m.len());
                    format!("{}:{size}:{modified}", e.file_name().to_string_lossy())
                })
                .collect();
            items.sort();
            json!(items.join("|"))
        }),
        _ => return Value::Null,
    };
    result.unwrap_or_else(|e| fs_error(path, &e))
}

/// Équivalent de fs.access(path, mode) : null si OK, sinon { code, message } façon Node.
fn fs_access(path: &str, mode: u64) -> Value {
    const W_OK: u64 = 2;
    match std::fs::metadata(path) {
        Err(e) => json!({
            "code": if e.kind() == std::io::ErrorKind::NotFound { "ENOENT" } else { "EACCES" },
            "message": format!("{path} : {e}"),
        }),
        Ok(meta) if mode & W_OK != 0 && meta.permissions().readonly() => {
            json!({ "code": "EACCES", "message": format!("{path} : fichier en lecture seule") })
        }
        Ok(_) => Value::Null,
    }
}

/// Electron laisse la page lister les périphériques sans rien demander ; WebView2 non, et sans
/// permission micro `enumerateDevices()` ne renvoie aucune sortie audio (liste « Périphérique
/// audio » vide). On accorde donc la permission micro à l'appli elle-même (sa propre origine).
#[cfg(windows)]
fn allow_audio_device_listing(window: &tauri::WebviewWindow) {
    let _ = window.with_webview(|webview| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            ICoreWebView2Profile4, ICoreWebView2_13, COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
            COREWEBVIEW2_PERMISSION_STATE_ALLOW,
        };
        use webview2_com::SetPermissionStateCompletedHandler;
        use windows_core::{Interface, HSTRING};

        let Ok(core) = webview.controller().CoreWebView2() else { return };
        let Ok(profile) = core.cast::<ICoreWebView2_13>().and_then(|c| c.Profile()) else {
            return;
        };
        let Ok(profile) = profile.cast::<ICoreWebView2Profile4>() else { return };
        let handler = SetPermissionStateCompletedHandler::create(Box::new(|_| Ok(())));
        let _ = profile.SetPermissionState(
            COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
            &HSTRING::from("http://tauri.localhost"),
            COREWEBVIEW2_PERMISSION_STATE_ALLOW,
            &handler,
        );
    });
}

/// Fenêtre sans cadre seulement quand Feishin dessine sa propre barre (styles Windows/macOS).
/// Sinon (style Linux, ou « web » hérité du premier prototype) : barre native, pour ne jamais
/// se retrouver avec une fenêtre impossible à déplacer ou fermer.
#[cfg(desktop)]
fn native_frame(app: &AppHandle) -> bool {
    !matches!(
        settings::load(app).get("window_window_bar_style").and_then(Value::as_str),
        Some("windows" | "macos")
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        // en premier : une 2e instance ne fait que réveiller la fenêtre existante
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }))
            .plugin(tauri_plugin_updater::Builder::new().build())
            // taille/position retenues, mais pas le cadre : il dépend du style de barre choisi
            // dans Feishin, et le plugin rétablissait celui du tout premier lancement
            .plugin(
                tauri_plugin_window_state::Builder::default()
                    .with_state_flags(
                        tauri_plugin_window_state::StateFlags::all()
                            - tauri_plugin_window_state::StateFlags::DECORATIONS,
                    )
                    .build(),
            );
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .register_asynchronous_uri_scheme_protocol("feishin", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            std::thread::spawn(move || responder.respond(offline::serve(&app, &request)));
        })
        .invoke_handler(tauri::generate_handler![fs_read, fs_write, ipc])
        .setup(|app| {
            let config = app.config().app.windows[0].clone();
            let window = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?;
            #[cfg(desktop)]
            let window = window.decorations(native_frame(app.handle()));
            let window = window.build()?;
            #[cfg(windows)]
            {
                allow_audio_device_listing(&window);
                thumbar::install(app.handle(), &window);
            }
            #[cfg(not(windows))]
            let _ = window;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("échec du lancement de Feishin (Tauri)");
}
