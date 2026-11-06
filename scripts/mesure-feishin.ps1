<#
Compare le démarrage et la RAM de Feishin (Electron, installé) et du prototype Tauri.

Avant : quitter Feishin (aussi depuis l'icône de la barre des tâches), et s'être
connecté une fois au serveur dans la version Tauri (elle a ses propres réglages).

Usage (PowerShell, dans le dossier du script) :
    powershell -ExecutionPolicy Bypass -File .\mesure-feishin.ps1
Options : -Electron <chemin Feishin.exe> -Tauri <chemin feishin-tauri.exe> -Runs 3 -IdleSeconds 20
#>
param(
    [string]$Electron = "$env:LOCALAPPDATA\Programs\feishin\Feishin.exe",
    [string]$Tauri = (Join-Path $PSScriptRoot 'feishin-tauri.exe'),
    [int]$Runs = 3,
    [int]$IdleSeconds = 20
)
# Installation « pour tous les utilisateurs » au lieu de « pour moi seulement »
if (-not (Test-Path $Electron) -and (Test-Path "$env:ProgramFiles\Feishin\Feishin.exe")) { $Electron = "$env:ProgramFiles\Feishin\Feishin.exe" }

# L'app + tous ses sous-processus (Electron : renderer/GPU/utility ; Tauri : msedgewebview2)
function Get-Tree([int]$RootId) {
    $all = @(Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId)
    $ids = [Collections.Generic.List[int]]::new(); $ids.Add($RootId)
    for ($i = 0; $i -lt $ids.Count; $i++) {
        foreach ($p in $all) { if ($p.ParentProcessId -eq $ids[$i] -and -not $ids.Contains([int]$p.ProcessId)) { $ids.Add([int]$p.ProcessId) } }
    }
    , $ids
}

# Même chiffre que la colonne « Mémoire » du Gestionnaire des tâches (plage de travail privée)
function Get-PrivateMB($ids) {
    $sum = (Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Property IDProcess, WorkingSetPrivate |
        Where-Object { $ids.Contains([int]$_.IDProcess) } | Measure-Object WorkingSetPrivate -Sum).Sum
    [math]::Round($sum / 1MB)
}

function Stop-Tree($ids) {
    Get-Process -Id $ids -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

function Measure-App([string]$Label, [string]$Path) {
    if (-not (Test-Path $Path)) { Write-Warning "$Label introuvable : $Path (passer le chemin en option)"; return }
    $name = [IO.Path]::GetFileNameWithoutExtension($Path)
    for ($r = 1; $r -le $Runs; $r++) {
        Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Sleep -Seconds 3
        Write-Host "$Label, essai $r/$Runs..."
        $sw = [Diagnostics.Stopwatch]::StartNew()
        $proc = Start-Process -FilePath $Path -PassThru
        $window = $null; $ready = $null; $lastCpu = 0.0; $calm = 0; $calmStart = 0.0
        $ids = Get-Tree $proc.Id
        # Prêt = l'appli arrête de mouliner : CPU de tout l'arbre < 6 % d'un cœur pendant 2 s
        while ($sw.Elapsed.TotalSeconds -lt 60 -and -not $ready) {
            Start-Sleep -Milliseconds 500
            $ids = Get-Tree $proc.Id
            if (-not $window) { $proc.Refresh(); if ($proc.MainWindowHandle -ne 0) { $window = $sw.Elapsed.TotalSeconds } }
            $cpu = (Get-Process -Id $ids -ErrorAction SilentlyContinue | Measure-Object CPU -Sum).Sum
            if ($cpu - $lastCpu -lt 0.03) {
                if ($calm -eq 0) { $calmStart = $sw.Elapsed.TotalSeconds }
                $calm++
                if ($calm -ge 4 -and $sw.Elapsed.TotalSeconds -gt 2) { $ready = $calmStart }
            } else { $calm = 0 }
            $lastCpu = $cpu
        }
        $wait = $IdleSeconds - $sw.Elapsed.TotalSeconds
        if ($wait -gt 0) { Start-Sleep -Seconds $wait }
        $ids = Get-Tree $proc.Id
        [pscustomobject]@{
            App         = $Label
            Essai       = $r
            Fenetre_s   = if ($window) { [math]::Round($window, 1) } else { $null }
            Pret_s      = if ($ready) { [math]::Round($ready, 1) } else { '>60' }
            RAM_Mo      = Get-PrivateMB $ids
            Processus   = $ids.Count
        }
        $proc.CloseMainWindow() | Out-Null
        Start-Sleep -Seconds 2
        Stop-Tree $ids
    }
}

$rows = @(Measure-App 'Electron' $Electron) + @(Measure-App 'Tauri' $Tauri) | Where-Object { $_ }
$rows | Format-Table -AutoSize

Write-Host 'Médianes :'
$rows | Group-Object App | ForEach-Object {
    $med = { param($v) $s = @($v | Where-Object { $_ -is [double] -or $_ -is [int] } | Sort-Object); if ($s.Count) { $s[[int][math]::Floor(($s.Count - 1) / 2)] } }
    [pscustomobject]@{
        App       = $_.Name
        Fenetre_s = & $med $_.Group.Fenetre_s
        Pret_s    = & $med $_.Group.Pret_s
        RAM_Mo    = & $med $_.Group.RAM_Mo
    }
} | Format-Table -AutoSize

$dir = Split-Path $Electron
if (Test-Path $dir) { Write-Host ("Taille installée Electron : {0} Mo" -f [math]::Round((Get-ChildItem $dir -Recurse -File | Measure-Object Length -Sum).Sum / 1MB)) }
if (Test-Path $Tauri) { Write-Host ("Taille exe Tauri : {0} Mo" -f [math]::Round((Get-Item $Tauri).Length / 1MB)) }

$out = Join-Path $PSScriptRoot 'resultats-mesure.csv'
$rows | Export-Csv -NoTypeInformation -Encoding UTF8 $out
Write-Host "Résultats enregistrés dans $out"
