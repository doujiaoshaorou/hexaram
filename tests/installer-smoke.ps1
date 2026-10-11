param([string]$MakensisPath)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$app = Join-Path $repo 'rank-analysis-app/src-tauri'
if (!$MakensisPath) { $MakensisPath = Join-Path $app 'target/.tauri/NSIS/makensis.exe' }
$templateDir = Join-Path $app 'target/release/nsis/x64'
$template = Get-Content -LiteralPath (Join-Path $templateDir 'installer.nsi') -Raw
$baseVersion = (Get-Content -LiteralPath (Join-Path $app 'tauri.conf.json') -Raw | ConvertFrom-Json).version
$parts = [Version]$baseVersion
$nextVersion = '{0}.{1}.{2}' -f $parts.Major,$parts.Minor,($parts.Build + 1)
$id = [Guid]::NewGuid().ToString('N')
$qa = Join-Path $repo ".tools/installer-qa-$id"
$source = Join-Path $qa '旧版 portable'
$localAppData = Join-Path $qa 'default-profile'
$installed = Join-Path $localAppData 'Hexaram'
$desktop = Join-Path $qa 'desktop'
$startMenu = Join-Path $qa 'start-menu'
$product = "Hexaram Installer QA $id"
New-Item -ItemType Directory -Path $qa,$source,$desktop,$startMenu -Force | Out-Null
foreach ($folder in @('hexaram-data/nested', 'user-data/archives')) {
  New-Item -ItemType Directory -Path (Join-Path $source $folder) -Force | Out-Null
}
$fixtures = @{
  'hexaram-config.yaml' = 'theme: dark'
  'device_id' = 'installer-qa-device'
  'hexaram-data/nested/history.json' = '{"games":[]}'
  'user-data/archives/legacy.json' = '{"legacy":true}'
}
foreach ($name in $fixtures.Keys) { [IO.File]::WriteAllText((Join-Path $source $name), $fixtures[$name]) }

# Use the real generated Tauri template and hooks, isolating only its Windows
# identity and shortcut folders. No installed app is launched during this test.
$template = $template.Replace('!define MANUFACTURER "doujiaoshaorou"', '!define MANUFACTURER "HexaramInstallerQA"')
$template = $template.Replace('!define PRODUCTNAME "海斗助手"', "!define PRODUCTNAME `"$product`"")
$template = $template.Replace('!define BUNDLEID "com.hexaram.ra.app"', "!define BUNDLEID `"com.hexaram.installerqa.$id`"")
$template = $template.Replace('$DESKTOP', $desktop).Replace('$SMPROGRAMS', $startMenu)
$template = $template.Replace('$LOCALAPPDATA', $localAppData)
$template = $template.Replace('!define INSTALLWEBVIEW2MODE "downloadBootstrapper"', '!define INSTALLWEBVIEW2MODE "skip"')
foreach ($file in @('utils.nsh','FileAssociation.nsh','SimpChinese.nsh')) {
  Copy-Item -LiteralPath (Join-Path $templateDir $file) -Destination $qa
}
$binary = Join-Path $qa 'hexaram.exe'
$bytes = [IO.File]::ReadAllBytes((Join-Path $app 'target/release/hexaram.exe'))
$token = [Text.Encoding]::ASCII.GetBytes('__TAURI_BUNDLE_TYPE_VAR_UNK')
$patched = [Text.Encoding]::ASCII.GetBytes('__TAURI_BUNDLE_TYPE_VAR_NSS')
$text = [Text.Encoding]::GetEncoding(28591).GetString($bytes)
$offset = $text.IndexOf('__TAURI_BUNDLE_TYPE_VAR_UNK', [StringComparison]::Ordinal)
if ($offset -ge 0) {
  [Array]::Copy($patched,0,$bytes,$offset,$token.Length)
} elseif (!$text.Contains('__TAURI_BUNDLE_TYPE_VAR_NSS')) {
  throw 'Expected the Windows application binary'
}
[IO.File]::WriteAllBytes($binary,$bytes)
$template = [regex]::Replace($template, '(?m)^!define MAINBINARYSRCPATH .*$', "!define MAINBINARYSRCPATH `"$binary`"")

function Build-QAInstaller([string]$version, [string]$output) {
  $script = $template.Replace("!define VERSION `"$baseVersion`"", "!define VERSION `"$version`"")
  $script = $script.Replace("!define VERSIONWITHBUILD `"$baseVersion.0`"", "!define VERSIONWITHBUILD `"$version.0`"")
  $script = $script.Replace('!define OUTFILE "nsis-output.exe"', "!define OUTFILE `"$output`"")
  $path = Join-Path $qa "installer-$version.nsi"
  [IO.File]::WriteAllText($path,$script,[Text.UTF8Encoding]::new($true))
  & $MakensisPath /V2 $path
  if ($LASTEXITCODE -ne 0) { throw 'QA installer compilation failed' }
}
function Run-QAInstaller([string]$exe, [string]$flags) {
  $process = Start-Process -FilePath $exe -ArgumentList $flags -WindowStyle Hidden -PassThru
  if (!$process.WaitForExit(45000)) { $process.Kill(); throw 'QA installer timed out' }
  $process.Refresh()
  if ($process.ExitCode -ne 0) { throw "QA installer failed: $($process.ExitCode)" }
}
function Assert-Data([hashtable]$expected) {
  foreach ($name in $expected.Keys) {
    $path = Join-Path $installed $name
    if (!(Test-Path -LiteralPath $path) -or [IO.File]::ReadAllText($path) -ne $expected[$name]) { throw "Data mismatch: $name" }
  }
}
function Assert-Shortcuts {
  $shell = New-Object -ComObject WScript.Shell
  foreach ($folder in @($desktop,$startMenu)) {
    $path = Join-Path $folder "$product.lnk"
    if (!(Test-Path -LiteralPath $path)) { throw 'Missing shortcut' }
    if ($shell.CreateShortcut($path).TargetPath -ne (Join-Path $installed 'hexaram.exe')) { throw 'Shortcut target changed' }
  }
}
$first = Join-Path $source 'first-setup.exe'
$next = Join-Path $source 'next-setup.exe'
Build-QAInstaller $baseVersion $first
Build-QAInstaller $nextVersion $next
Run-QAInstaller $first '/S'
Assert-Data $fixtures
Assert-Shortcuts
Write-Output 'PASS: English default install folder, portable data migration, desktop/start-menu shortcuts'
[IO.File]::WriteAllText((Join-Path $installed 'hexaram-config.yaml'), 'theme: installed-setting')
$fixtures['hexaram-config.yaml'] = 'theme: installed-setting'
Run-QAInstaller $next "/S /UPDATE /D=$installed"
Assert-Data $fixtures
Assert-Shortcuts
$key = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$product"
if ((Get-ItemProperty -LiteralPath $key).DisplayVersion -ne $nextVersion) { throw 'Upgrade did not update uninstall metadata' }
if (![Text.Encoding]::GetEncoding(28591).GetString([IO.File]::ReadAllBytes((Join-Path $installed 'hexaram.exe'))).Contains('__TAURI_BUNDLE_TYPE_VAR_NSS')) { throw 'Installed binary lost its installer marker' }
Write-Output 'PASS: cross-version overlay upgrade retains data, shortcuts and installer marker'
Run-QAInstaller $next "/S /D=$installed"
Assert-Data $fixtures
Assert-Shortcuts
Write-Output 'PASS: manual reinstall retains installed data'
Run-QAInstaller (Join-Path $installed 'uninstall.exe') "/S _?=$installed"
Assert-Data $fixtures
if (Test-Path -LiteralPath (Join-Path $installed 'hexaram.exe')) { throw 'Uninstall left the executable' }
if (Test-Path -LiteralPath $key) { throw 'Uninstall left its QA registry key' }
foreach ($folder in @($desktop,$startMenu)) {
  if (Test-Path -LiteralPath (Join-Path $folder "$product.lnk")) { throw 'Uninstall left a shortcut' }
}
foreach ($name in $fixtures.Keys) {
  if (!(Test-Path -LiteralPath (Join-Path $source $name))) { throw 'Original portable data removed' }
}
$qaRegistryKey = "HKCU:\Software\HexaramInstallerQA\$product"
if (Test-Path -LiteralPath $qaRegistryKey) { Remove-Item -LiteralPath $qaRegistryKey -Recurse }
Write-Output 'PASS: uninstall removes program/shortcuts and preserves both installed and original portable data'
$installed = Join-Path $qa '安装目录 with spaces'
Run-QAInstaller $first "/S /D=$installed"
$fixtures['hexaram-config.yaml'] = 'theme: dark'
Assert-Data $fixtures
Assert-Shortcuts
Run-QAInstaller (Join-Path $installed 'uninstall.exe') "/S _?=$installed"
if (Test-Path -LiteralPath $qaRegistryKey) { Remove-Item -LiteralPath $qaRegistryKey -Recurse }
Write-Output 'PASS: explicit Unicode/space install path is preserved'
Write-Output "Synthetic fixtures retained at $qa"
