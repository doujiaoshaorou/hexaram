param(
  [Parameter(Mandatory)][string]$Version,
  [Parameter(Mandatory)][string]$InstallerPath,
  [string]$PrivateKeyPath,
  [Parameter(Mandatory)][string]$NotesPath,
  [Parameter(Mandatory)][string]$OutputDirectory,
  [string]$GhPath = 'gh',
  [string]$TauriCliPath,
  [switch]$Publish
)
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Use a stable three-part version' }
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$status = @(git -C $repo status --porcelain)
if ($LASTEXITCODE -ne 0) { throw 'Run this script from a Git checkout' }
if ($status.Count) { throw 'Commit source changes before packaging' }
if (((Get-Content (Join-Path $repo 'rank-analysis-app/package.json') -Raw | ConvertFrom-Json).version) -ne $Version) { throw 'Source version mismatch' }
$installer = Get-Item -LiteralPath $InstallerPath
if ($installer.VersionInfo.ProductVersion -ne $Version) { throw 'Installer version mismatch' }
$key = if ($PrivateKeyPath) { (Resolve-Path -LiteralPath $PrivateKeyPath).Path } else { $null }
if (!$key -and !$env:TAURI_SIGNING_PRIVATE_KEY) { throw 'Provide the existing Hexaram signing key locally or in TAURI_SIGNING_PRIVATE_KEY' }
if (!$TauriCliPath) { $TauriCliPath = Join-Path $repo 'rank-analysis-app/node_modules/@tauri-apps/cli/tauri.js' }
if (!(Test-Path -LiteralPath $TauriCliPath)) { throw 'Install app dependencies before signing, or specify TauriCliPath' }
$files = @(git -C $repo ls-files)
foreach ($file in $files) {
  if ($file -match '(^|/)(\.tools|node_modules|target|hexaram-data|user-data|updates|\.git)(/|$)|(^|/)\.env|hexaram-config\.yaml|\.(key|pem|pfx)$') { throw "Private file is tracked: $file" }
  $path = [IO.Path]::GetFullPath((Join-Path $repo $file))
  if ($path -eq $key) { throw 'Signing key must not be tracked' }
  $text = [IO.File]::ReadAllText($path)
  if ($text -match 'sk-[A-Za-z0-9]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----') { throw "Possible secret in $file" }
}
$out = [IO.Path]::GetFullPath($OutputDirectory)
if ($out.StartsWith($repo + [IO.Path]::DirectorySeparatorChar) -and !$out.StartsWith((Join-Path $repo '.tools') + [IO.Path]::DirectorySeparatorChar)) { throw 'Use an output folder outside tracked source, or under .tools' }
New-Item -ItemType Directory -Path $out -Force | Out-Null
$setupAsset = Join-Path $out "Hexaram-$Version-win-x64-setup.exe"
Copy-Item -LiteralPath $installer.FullName -Destination $setupAsset
$previousKeyPath = $env:TAURI_SIGNING_PRIVATE_KEY_PATH
if ($key) { $env:TAURI_SIGNING_PRIVATE_KEY_PATH = $key }
if (!$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) { $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = '' }
try {
  foreach ($package in @($setupAsset)) {
    & node $TauriCliPath signer sign $package *> $null
    if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath ($package+'.sig'))) { throw 'Signing failed; check the local key/password' }
  }
} finally {
  if ($previousKeyPath) { $env:TAURI_SIGNING_PRIVATE_KEY_PATH = $previousKeyPath }
  else { Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PATH -ErrorAction SilentlyContinue }
}
$zip = Join-Path $out "Hexaram-$Version-source.zip"
& git -C $repo archive --format=zip --output=$zip HEAD
if ($LASTEXITCODE -ne 0) { throw 'Source archive failed' }
$latestPath = Join-Path $out 'latest.json'
$baseUrl = "https://github.com/doujiaoshaorou/hexaram/releases/download/v$Version"
$latest = [ordered]@{
  version = $Version
  notes = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $NotesPath).Path)
  pub_date = [DateTime]::UtcNow.ToString('o')
  platforms = @{ 'windows-x86_64' = @{
    signature = [IO.File]::ReadAllText($setupAsset+'.sig').Trim()
    url = "$baseUrl/$([IO.Path]::GetFileName($setupAsset))"
  } }
}
[IO.File]::WriteAllText($latestPath, (ConvertTo-Json -InputObject $latest -Depth 6))
$sum = Join-Path $out "Hexaram-$Version-SHA256SUMS.txt"
$packages = @($setupAsset, ($setupAsset+'.sig'), $zip, $latestPath)
$packages | ForEach-Object { '{0}  {1}' -f (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLower(), [IO.Path]::GetFileName($_) } | Set-Content -LiteralPath $sum -Encoding utf8
$commit = git -C $repo rev-parse HEAD
$uploads = @($packages) + @($sum, (Join-Path $repo 'LICENSE'), (Join-Path $repo 'THIRD_PARTY_NOTICES.md'))
& $GhPath release create "v$Version" @uploads --repo doujiaoshaorou/hexaram --target $commit --title "海斗助手 $Version" --notes-file $NotesPath --draft
if ($LASTEXITCODE -ne 0) { throw 'Upload failed; inspect the draft before retrying' }
$raw = & $GhPath api 'repos/doujiaoshaorou/hexaram/releases?per_page=20'
if ($LASTEXITCODE -ne 0) { throw 'Cannot build fallback release index' }
$index = @($raw | ConvertFrom-Json | Where-Object { (!$_.draft -and !$_.prerelease) -or $_.tag_name -eq "v$Version" } | ForEach-Object {
  $releaseTag = $_.tag_name
  [PSCustomObject]@{
    tag_name=$_.tag_name; name=$_.name; body=$_.body
    html_url="https://github.com/doujiaoshaorou/hexaram/releases/tag/$($_.tag_name)"
    published_at=$(if ($_.published_at) { $_.published_at } else { [DateTime]::UtcNow.ToString('o') })
    draft=$false; prerelease=$false
    # Draft URLs use a temporary untagged-* path; publish the final tag URL in the index.
    assets=@($_.assets | ForEach-Object { [PSCustomObject]@{name=$_.name;browser_download_url="https://github.com/doujiaoshaorou/hexaram/releases/download/$releaseTag/$([Uri]::EscapeDataString($_.name))"} })
  }
})
$indexPath = Join-Path $out 'hexaram-releases.json'
[IO.File]::WriteAllText($indexPath,(ConvertTo-Json -InputObject $index -Depth 10))
& $GhPath release upload "v$Version" $indexPath --repo doujiaoshaorou/hexaram
if ($LASTEXITCODE -ne 0) { throw 'Fallback index upload failed' }
# Check the uploaded bytes, not merely a successful upload command or asset names.
$verifyDir = Join-Path $out ('verify-upload-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $verifyDir | Out-Null
& $GhPath release download "v$Version" --repo doujiaoshaorou/hexaram --dir $verifyDir
if ($LASTEXITCODE -ne 0) { throw 'Download verification failed; the release remains a draft' }
foreach ($file in (@($uploads) + @($indexPath))) {
  $downloaded = Join-Path $verifyDir ([IO.Path]::GetFileName($file))
  if (!(Test-Path -LiteralPath $downloaded) -or (Get-FileHash -LiteralPath $file).Hash -ne (Get-FileHash -LiteralPath $downloaded).Hash) {
    throw "Uploaded asset verification failed: $([IO.Path]::GetFileName($file)); the release remains a draft"
  }
}
if ($Publish) {
  & $GhPath release edit "v$Version" --repo doujiaoshaorou/hexaram --draft=false --latest
  if ($LASTEXITCODE -ne 0) { throw 'Publishing failed; inspect the verified draft' }
  Write-Output "Published and verified: https://github.com/doujiaoshaorou/hexaram/releases/tag/v$Version"
} else {
  Write-Output "Draft v$Version uploaded and verified. Use -Publish to publish after verification."
}
