; Passage de Feishin Electron à Tauri sur les PC du fork. La mise à jour d'Electron
; (electron-updater) lance cet installeur avec « --updated /S --force-run ».

!macro NSIS_HOOK_PREINSTALL
  ; Désinstalle l'ancien Feishin Electron (installation « pour moi seulement »). Ses données
  ; (%APPDATA%\feishin) sont gardées : l'appli Tauri les reprend à son premier lancement.
  ; Fait AVANT la création des raccourcis Tauri : ils portent le même nom « Feishin ».
  ${If} ${FileExists} "$LOCALAPPDATA\Programs\feishin\Uninstall Feishin.exe"
    Sleep 1500 ; laisse Electron finir de se fermer
    ExecWait '"$LOCALAPPDATA\Programs\feishin\Uninstall Feishin.exe" /S /currentuser _?=$LOCALAPPDATA\Programs\feishin'
    RMDir /r "$LOCALAPPDATA\Programs\feishin"
  ${EndIf}
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
