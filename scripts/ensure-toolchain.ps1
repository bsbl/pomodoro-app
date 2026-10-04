# Called by start.bat / build.bat. Makes sure the whole Tauri toolchain is
# present and recent enough, installing or upgrading what's needed:
#   - Visual Studio C++ Build Tools (MSVC linker)
#   - Rust >= rust-version from src-tauri/Cargo.toml (via rustup)
#   - Node.js >= $MinNodeMajor (via winget)
# npm install is run by the calling .bat, once PATH includes the new tools.
$ErrorActionPreference = 'Stop'

$MinNodeMajor = 18
$MinRust = [version]((Select-String -Path 'src-tauri\Cargo.toml' -Pattern '^rust-version\s*=\s*"(.*)"').Matches[0].Groups[1].Value)

function Log($msg) { Write-Host "==> $msg" }

function Refresh-Path {
  $env:Path = "$env:USERPROFILE\.cargo\bin;" +
    [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
    [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Require-Winget {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "winget introuvable : installe 'App Installer' depuis le Microsoft Store, puis relance ce script."
  }
}

function Ensure-MsvcBuildTools {
  $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
  if ((Test-Path $vswhere) -and
      (& $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath)) {
    return
  }
  Log "Visual Studio C++ Build Tools manquants : installation via winget (plusieurs minutes)..."
  Require-Winget
  winget install --id Microsoft.VisualStudio.2022.BuildTools -e --accept-source-agreements --accept-package-agreements `
    --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
}

function Get-RustVersion {
  $out = & rustc --version 2>$null
  if ($LASTEXITCODE -eq 0 -and $out -match '^rustc (\d+\.\d+\.\d+)') { return [version]$Matches[1] }
  return $null
}

function Ensure-Rust {
  Refresh-Path
  $version = Get-RustVersion
  if ($version -and $version -ge $MinRust) { return }

  if (Get-Command rustup -ErrorAction SilentlyContinue) {
    Log "Rust $version trop ancien (>= $MinRust requis) : mise à jour via rustup..."
    rustup update stable
    rustup default stable
  } else {
    Log "Rust introuvable ou trop ancien : installation via rustup..."
    $installer = Join-Path $env:TEMP 'rustup-init.exe'
    Invoke-WebRequest -Uri 'https://win.rustup.rs/x86_64' -OutFile $installer
    $env:RUSTUP_INIT_SKIP_PATH_CHECK = 'yes'
    & $installer -y --default-toolchain stable
    Remove-Item $installer
  }
  Refresh-Path

  $version = Get-RustVersion
  if (-not $version -or $version -lt $MinRust) {
    throw "Échec : Rust >= $MinRust requis, trouvé '$version'."
  }
  Log "Rust $version prêt."
}

function Get-NodeMajor {
  $out = & node --version 2>$null
  if ($LASTEXITCODE -eq 0 -and $out -match '^v(\d+)') { return [int]$Matches[1] }
  return $null
}

function Ensure-Node {
  $major = Get-NodeMajor
  if ($major -and $major -ge $MinNodeMajor) { return }

  Require-Winget
  if ($major) {
    Log "Node.js v$major trop ancien (>= $MinNodeMajor requis) : mise à jour via winget..."
    winget upgrade --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  } else {
    Log "Node.js introuvable : installation via winget..."
    winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  }
  Refresh-Path

  $major = Get-NodeMajor
  if (-not $major -or $major -lt $MinNodeMajor) {
    throw "Échec : Node.js >= $MinNodeMajor requis, trouvé '$major'."
  }
  Log "Node.js v$major prêt."
}

Ensure-MsvcBuildTools
Ensure-Rust
Ensure-Node
