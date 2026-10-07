param(
  [Parameter(Mandatory)][string]$Version,
  [Parameter(Mandatory)][string]$ExePath,
  [Parameter(Mandatory)][string]$PrivateKeyPath,
  [Parameter(Mandatory)][string]$NotesPath,
  [Parameter(Mandatory)][string]$OutputDirectory,
  [string]$GhPath = 'gh'
)
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Use a stable three-part version' }
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ((git -C $repo status --porcelain).Length) { throw 'Commit source changes before packaging' }
if (((Get-Content (Join-Path $repo 'rank-analysis-app/package.json') -Raw | ConvertFrom-Json).version) -ne $Version) { throw 'Source version mismatch' }
$exe = Get-Item -LiteralPath $ExePath
if ($exe.VersionInfo.ProductVersion -ne $Version) { throw 'Executable version mismatch' }
$key = (Resolve-Path -LiteralPath $PrivateKeyPath).Path
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
$asset = Join-Path $out "Hexaram-$Version-win-x64.exe"
Copy-Item -LiteralPath $exe.FullName -Destination $asset
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = $key
if (!$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) { $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = '' }
try {
  & node (Join-Path $repo 'rank-analysis-app/node_modules/@tauri-apps/cli/tauri.js') signer sign $asset *> $null
  if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath ($asset+'.sig'))) { throw 'Signing failed; check the local key/password' }
} finally { Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PATH -ErrorAction SilentlyContinue }
$zip = Join-Path $out "Hexaram-$Version-source.zip"
& git -C $repo archive --format=zip --output=$zip HEAD
if ($LASTEXITCODE -ne 0) { throw 'Source archive failed' }
$sum = Join-Path $out "Hexaram-$Version-SHA256SUMS.txt"
@($asset, ($asset+'.sig'), $zip) | ForEach-Object { '{0}  {1}' -f (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLower(), [IO.Path]::GetFileName($_) } | Set-Content -LiteralPath $sum -Encoding utf8
$commit = git -C $repo rev-parse HEAD
& $GhPath release create "v$Version" $asset ($asset+'.sig') $zip $sum (Join-Path $repo 'LICENSE') (Join-Path $repo 'THIRD_PARTY_NOTICES.md') --repo doujiaoshaorou/hexaram --target $commit --title "海克斯战绩本 $Version" --notes-file $NotesPath --draft
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
Write-Output "Draft v$Version uploaded. Verify assets before publishing."
