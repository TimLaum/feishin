//! Contrôles média de Windows (SMTC) : Feishin apparaît dans le panneau média du système comme un
//! navigateur, et les touches multimédia / commandes lecture-pause du système lui parviennent quand
//! c'est la session active. WebView2 ne le fait pas pour nous ; Electron passait par Chromium.
//! Le renderer envoie titre/état via le canal `media-update` (src/tauri/media-controls.ts).

use std::sync::OnceLock;

use serde_json::Value;
use tauri::{AppHandle, Emitter, WebviewWindow};
use windows::core::{factory, HSTRING};
use windows::Foundation::{TypedEventHandler, Uri};
use windows::Media::{
    MediaPlaybackStatus, MediaPlaybackType, SystemMediaTransportControls,
    SystemMediaTransportControlsButtonPressedEventArgs,
    SystemMediaTransportControlsButton as Button,
};
use windows::Storage::Streams::RandomAccessStreamReference;
use windows::Win32::Foundation::HWND;
use windows::Win32::System::WinRT::ISystemMediaTransportControlsInterop;

static SMTC: OnceLock<SystemMediaTransportControls> = OnceLock::new();

pub fn install(app: &AppHandle, window: &WebviewWindow) {
    let Ok(hwnd) = window.hwnd() else { return };
    let app = app.clone();
    let result = (|| -> windows::core::Result<()> {
        let interop =
            factory::<SystemMediaTransportControls, ISystemMediaTransportControlsInterop>()?;
        let smtc: SystemMediaTransportControls = unsafe { interop.GetForWindow(HWND(hwnd.0 as _))? };
        smtc.SetIsPlayEnabled(true)?;
        smtc.SetIsPauseEnabled(true)?;
        smtc.SetIsStopEnabled(true)?;
        smtc.SetIsNextEnabled(true)?;
        smtc.SetIsPreviousEnabled(true)?;
        type Pressed = SystemMediaTransportControlsButtonPressedEventArgs;
        smtc.ButtonPressed(&TypedEventHandler::<_, Pressed>::new(move |_, args| {
            let event = match args.ok()?.Button()? {
                Button::Play => "renderer-player-play",
                Button::Pause => "renderer-player-pause",
                Button::Stop => "renderer-player-stop",
                Button::Next => "renderer-player-next",
                Button::Previous => "renderer-player-previous",
                _ => return Ok(()),
            };
            let _ = app.emit(event, ());
            Ok(())
        }))?;
        let _ = SMTC.set(smtc);
        Ok(())
    })();
    if let Err(error) = result {
        eprintln!("[media] SMTC indisponible : {error}");
    }
}

/// `info` = { playing, title, artist, album, image } ; sans titre = rien en cours.
pub fn update(info: &Value) -> Result<Value, String> {
    let Some(smtc) = SMTC.get() else { return Ok(Value::Null) };
    let text = |key: &str| HSTRING::from(info[key].as_str().unwrap_or(""));
    let result = (|| -> windows::core::Result<()> {
        if info["title"].as_str().unwrap_or("").is_empty() {
            smtc.SetIsEnabled(false)?;
            return Ok(());
        }
        smtc.SetIsEnabled(true)?;
        smtc.SetPlaybackStatus(if info["playing"].as_bool() == Some(true) {
            MediaPlaybackStatus::Playing
        } else {
            MediaPlaybackStatus::Paused
        })?;
        let display = smtc.DisplayUpdater()?;
        display.SetType(MediaPlaybackType::Music)?;
        let music = display.MusicProperties()?;
        music.SetTitle(&text("title"))?;
        music.SetArtist(&text("artist"))?;
        music.SetAlbumTitle(&text("album"))?;
        // pochette facultative : une URL invalide ne doit pas empêcher le reste
        let thumbnail = Uri::CreateUri(&text("image"))
            .and_then(|uri| RandomAccessStreamReference::CreateFromUri(&uri));
        display.SetThumbnail(thumbnail.as_ref().ok())?;
        display.Update()
    })();
    result.map(|_| Value::Null).map_err(|error| error.to_string())
}
