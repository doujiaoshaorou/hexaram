param(
  [string]$OutputDirectory,
  [string]$NodePath = 'node',
  [string]$ConfigPath
)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$app = Join-Path $repo 'rank-analysis-app'
$version = (Get-Content (Join-Path $app 'package.json') -Raw | ConvertFrom-Json).version
if (!$OutputDirectory) { $OutputDirectory = Join-Path $repo ".tools/release-$version" }
$out = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $out -Force | Out-Null
$configArgs = @()
if ($ConfigPath) { $configArgs = @('--config', (Resolve-Path -LiteralPath $ConfigPath).Path) }
Push-Location $app
try {
  # Preserve the unbundled binary before NSIS patches its install-form marker.
  & $NodePath 'node_modules/@tauri-apps/cli/tauri.js' build --no-bundle @configArgs
  if ($LASTEXITCODE -ne 0) { throw 'Windows build failed' }
  Copy-Item -LiteralPath 'src-tauri/target/release/hexaram.exe' -Destination (Join-Path $out "Hexaram-$version-win-x64.exe")
  & $NodePath 'node_modules/@tauri-apps/cli/tauri.js' bundle --bundles nsis @configArgs
  if ($LASTEXITCODE -ne 0) {
    # A failed bundler can leave the executable patched as an installer binary.
    Copy-Item -LiteralPath (Join-Path $out "Hexaram-$version-win-x64.exe") -Destination 'src-tauri/target/release/hexaram.exe' -Force
    throw 'NSIS packaging failed'
  }
  $setup = @(Get-ChildItem 'src-tauri/target/release/bundle/nsis' -Filter "*_${version}_*-setup.exe")
  if ($setup.Count -ne 1) { throw 'Expected one Windows x64 installer' }
  Copy-Item -LiteralPath $setup[0].FullName -Destination (Join-Path $out "Hexaram-$version-win-x64-setup.exe")
} finally { Pop-Location }
Get-ChildItem -LiteralPath $out -Filter '*.exe' | Select-Object FullName, Length
