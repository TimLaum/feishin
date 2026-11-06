//! Boutons de la miniature dans la barre des tâches Windows (précédent / lecture-pause / suivant),
//! comme `setThumbarButtons` dans src/main/index.ts. Un clic envoie au renderer le même événement
//! qu'Electron ; l'interface l'écoute déjà (src/preload/mpv-player.ts).

use std::sync::OnceLock;

use tauri::{AppHandle, Emitter, WebviewWindow};
use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
use windows::Win32::UI::Shell::{
    DefSubclassProc, ITaskbarList3, SetWindowSubclass, TaskbarList, THBF_ENABLED, THBN_CLICKED,
    THB_FLAGS, THB_ICON, THB_TOOLTIP, THUMBBUTTON,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateIconFromResourceEx, RegisterWindowMessageW, LR_DEFAULTCOLOR, WM_COMMAND,
};

const BUTTONS: [(&[u8], &str, &str); 3] = [
    (include_bytes!("../../assets/skip-previous.png"), "Previous Track", "renderer-player-previous"),
    (include_bytes!("../../assets/play-circle.png"), "Play/Pause", "renderer-player-play-pause"),
    (include_bytes!("../../assets/skip-next.png"), "Next Track", "renderer-player-next"),
];

// Explorer envoie ce message quand le bouton de l'appli apparaît dans la barre des tâches
// (y compris après un redémarrage d'Explorer) : les boutons ne peuvent être ajoutés qu'après.
static TASKBAR_CREATED: OnceLock<u32> = OnceLock::new();

unsafe fn add_buttons(hwnd: HWND) {
    let Ok(taskbar) = CoCreateInstance::<_, ITaskbarList3>(&TaskbarList, None, CLSCTX_INPROC_SERVER)
    else {
        return;
    };
    if taskbar.HrInit().is_err() {
        return;
    }
    let buttons = BUTTONS.iter().enumerate().filter_map(|(id, (png, tip, _))| {
        // CreateIconFromResourceEx accepte directement un PNG (Vista et +)
        let icon = CreateIconFromResourceEx(png, true, 0x0003_0000, 0, 0, LR_DEFAULTCOLOR).ok()?;
        let mut button = THUMBBUTTON {
            dwFlags: THBF_ENABLED,
            dwMask: THB_ICON | THB_TOOLTIP | THB_FLAGS,
            hIcon: icon,
            iId: id as u32,
            ..Default::default()
        };
        for (dst, src) in button.szTip.iter_mut().zip(tip.encode_utf16()) {
            *dst = src;
        }
        Some(button)
    });
    let buttons: Vec<THUMBBUTTON> = buttons.collect();
    // échoue sans conséquence si les boutons existent déjà ou si le bouton de tâche n'est pas prêt
    let _ = taskbar.ThumbBarAddButtons(hwnd, &buttons);
}

unsafe extern "system" fn subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    app: usize,
) -> LRESULT {
    if msg == WM_COMMAND && ((wparam.0 >> 16) & 0xffff) as u32 == THBN_CLICKED {
        if let Some((_, _, event)) = BUTTONS.get(wparam.0 & 0xffff) {
            let _ = (*(app as *const AppHandle)).emit(event, ());
            return LRESULT(0);
        }
    }
    if Some(&msg) == TASKBAR_CREATED.get() {
        add_buttons(hwnd);
    }
    DefSubclassProc(hwnd, msg, wparam, lparam)
}

pub fn install(app: &AppHandle, window: &WebviewWindow) {
    let Ok(hwnd) = window.hwnd() else { return };
    // HWND de tauri et du crate windows : même pointeur, types de versions différentes possibles
    let hwnd = HWND(hwnd.0 as _);
    unsafe {
        TASKBAR_CREATED.get_or_init(|| RegisterWindowMessageW(w!("TaskbarButtonCreated")));
        // AppHandle laissé en mémoire pour toute la vie de la fenêtre (référencé par subclass_proc)
        let app = Box::into_raw(Box::new(app.clone())) as usize;
        let _ = SetWindowSubclass(hwnd, Some(subclass_proc), 1, app);
        add_buttons(hwnd);
    }
}
