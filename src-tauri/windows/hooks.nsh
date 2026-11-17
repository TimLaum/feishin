; Passage de Feishin Electron à Tauri sur les PC du fork. La mise à jour d'Electron
; (electron-updater) lance cet installeur avec « --updated /S --force-run ».

; GUID qu'electron-builder dérive de l'appId org.jeffvli.feishin (clés de registre de l'ancienne install)
!define ELECTRON_GUID "5e237764-c1a1-5856-bdf0-e4274e3b5310"

!macro NSIS_HOOK_PREINSTALL
  ; Désinstalle l'ancien Feishin Electron (installation « pour moi seulement »). Ses données
  ; (%APPDATA%\feishin) sont gardées : l'appli Tauri les reprend à son premier lancement.
  ; Fait AVANT la création des raccourcis Tauri : ils portent le même nom « Feishin ».
  ${If} ${FileExists} "$LOCALAPPDATA\Programs\feishin\*.*"
    ; Electron encore ouvert verrouille ses fichiers et fait échouer la désinstallation à
    ; moitié : on lui laisse 10 s pour finir de se fermer (et d'écrire ses données), puis on le tue.
    nsExec::Exec `powershell -NoProfile -Command "$$p = Get-Process Feishin -EA 0 | ? Path -like '$LOCALAPPDATA\Programs\feishin\*'; $$p | Wait-Process -Timeout 10 -EA 0; $$p | Stop-Process -Force -EA 0"`
    Pop $0
    ${If} ${FileExists} "$LOCALAPPDATA\Programs\feishin\Uninstall Feishin.exe"
      ExecWait '"$LOCALAPPDATA\Programs\feishin\Uninstall Feishin.exe" /S /currentuser _?=$LOCALAPPDATA\Programs\feishin'
    ${EndIf}
    RMDir /r "$LOCALAPPDATA\Programs\feishin"
  ${EndIf}
  ; Restes d'une désinstallation interrompue : entrée en double dans « Applications installées »
  ; et cache d'electron-updater.
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${ELECTRON_GUID}"
  DeleteRegKey HKCU "Software\${ELECTRON_GUID}"
  RMDir /r "$LOCALAPPDATA\feishin-updater"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; electron-updater demande de relancer l'appli après la mise à jour (--force-run) ;
  ; l'installeur Tauri ne connaît que /R, d'où ce relais.
  ClearErrors
  ${GetOptions} $CMDLINE "--force-run" $R0
  ${IfNot} ${Errors}
    Exec '"$INSTDIR\${MAINBINARYNAME}.exe"'
  ${EndIf}
!macroend
