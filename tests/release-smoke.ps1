param(
  [Parameter(Mandatory)][string]$ExePath,
  [Parameter(Mandatory)][string]$InstallerPath,
  [Parameter(Mandatory)][string]$PrivateKeyPath,
  [Parameter(Mandatory)][string]$TauriCliPath
)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$qa = Join-Path $repo ('.tools/release-qa-' + [Guid]::NewGuid().ToString('N'))
$fixture = Join-Path $qa 'source'
New-Item -ItemType Directory -Path "$fixture/scripts", "$fixture/rank-analysis-app" -Force | Out-Null
Copy-Item (Join-Path $repo 'scripts/publish-release.ps1') "$fixture/scripts/publish-release.ps1"
$version = (Get-Item -LiteralPath $ExePath).VersionInfo.ProductVersion
@{version=$version} | ConvertTo-Json | Set-Content "$fixture/rank-analysis-app/package.json"
Set-Content "$fixture/LICENSE" 'Synthetic QA license'
Set-Content "$fixture/THIRD_PARTY_NOTICES.md" 'Synthetic QA notice'
Set-Content "$qa/notes.md" 'Synthetic QA release'
git -C $fixture init --quiet
git -C $fixture add .
git -C $fixture -c user.name=ReleaseQA -c user.email=qa@example.invalid commit --quiet -m 'Synthetic release fixture'
if ($LASTEXITCODE -ne 0) { throw 'Cannot create QA Git checkout' }
$mock = Join-Path $qa 'gh-mock.ps1'
@'
$ErrorActionPreference = 'Stop'
$global:LASTEXITCODE = 0
$state = $env:HEXARAM_RELEASE_QA_DIR
$filesPath = Join-Path $state 'uploads.json'
if ($args[0] -eq 'release' -and $args[1] -eq 'create') {
  $uploads = @()
  for ($i=3; $i -lt $args.Count -and $args[$i] -ne '--repo'; $i++) { $uploads += $args[$i] }
  ConvertTo-Json -InputObject $uploads | Set-Content $filesPath
  Set-Content (Join-Path $state 'tag.txt') $args[2]
} elseif ($args[0] -eq 'api') {
  $tag = (Get-Content (Join-Path $state 'tag.txt')).Trim()
  $files = @(Get-Content $filesPath -Raw | ConvertFrom-Json)
  $release = @{tag_name=$tag; name='QA'; body='QA'; draft=$true; prerelease=$false; published_at=$null; assets=@($files | ForEach-Object {@{name=[IO.Path]::GetFileName($_); browser_download_url='https://github.com/doujiaoshaorou/hexaram/releases/download/untagged-qa/temporary'}})}
  ConvertTo-Json -InputObject @($release) -Depth 8
} elseif ($args[0] -eq 'release' -and $args[1] -eq 'upload') {
  $files = @(Get-Content $filesPath -Raw | ConvertFrom-Json) + @($args[3])
  ConvertTo-Json -InputObject $files | Set-Content $filesPath
} elseif ($args[0] -eq 'release' -and $args[1] -eq 'download') {
  $dir = $args[[Array]::IndexOf($args, '--dir')+1]
  $files = @(Get-Content $filesPath -Raw | ConvertFrom-Json)
  foreach ($file in $files) { Copy-Item -LiteralPath $file -Destination $dir }
  if ($env:HEXARAM_RELEASE_QA_CORRUPT -eq 'true') {
    $path = Join-Path $dir ([IO.Path]::GetFileName($files[0]))
    $bytes = [IO.File]::ReadAllBytes($path)
    $bytes[0] = $bytes[0] -bxor 1
    [IO.File]::WriteAllBytes($path, $bytes)
  }
} elseif ($args[0] -eq 'release' -and $args[1] -eq 'edit') {
  Set-Content (Join-Path $state 'published.txt') 'published'
} else { throw 'Unexpected mock GitHub operation' }
'@ | Set-Content $mock -Encoding utf8
$previousDir = $env:HEXARAM_RELEASE_QA_DIR
$previousCorrupt = $env:HEXARAM_RELEASE_QA_CORRUPT
try {
  foreach ($corrupt in @($false, $true)) {
    $case = Join-Path $qa $(if ($corrupt) {'corrupted'} else {'success'})
    New-Item -ItemType Directory -Path $case | Out-Null
    $env:HEXARAM_RELEASE_QA_DIR = $case
    $env:HEXARAM_RELEASE_QA_CORRUPT = $corrupt.ToString().ToLower()
    $failed = $false
    try {
      & "$fixture/scripts/publish-release.ps1" -Version $version -ExePath $ExePath -InstallerPath $InstallerPath -PrivateKeyPath $PrivateKeyPath -TauriCliPath $TauriCliPath -NotesPath "$qa/notes.md" -OutputDirectory "$case/assets" -GhPath $mock -Publish
    } catch {
      if (!$corrupt -or $_.Exception.Message -notlike 'Uploaded asset verification failed:*') { throw }
      $failed = $true
    }
    $published = Test-Path "$case/published.txt"
    if ($corrupt -and (!$failed -or $published)) { throw 'Corrupted remote bytes were published' }
    if (!$corrupt -and !$published) { throw 'Verified release was not published' }
    $latest = Get-Content "$case/assets/latest.json" -Raw | ConvertFrom-Json
    if ($latest.version -ne $version -or $latest.platforms.'windows-x86_64'.url -notlike '*-setup.exe' -or $latest.portable.'windows-x86_64'.url -like '*-setup.exe') { throw 'RA-compatible manifest selects incorrect packages' }
    if ($latest.platforms.'windows-x86_64'.signature -ne (Get-Content "$case/assets/Hexaram-$version-win-x64-setup.exe.sig" -Raw).Trim()) { throw 'Installer manifest signature differs' }
    $index = @(Get-Content "$case/assets/hexaram-releases.json" -Raw | ConvertFrom-Json)
    if ($index.Count -ne 1 -or $index[0].draft -or ($index[0].assets.browser_download_url -match 'untagged-qa')) { throw 'Fallback index contains draft URLs' }
  }
} finally {
  $env:HEXARAM_RELEASE_QA_DIR = $previousDir
  $env:HEXARAM_RELEASE_QA_CORRUPT = $previousCorrupt
}
Write-Output "PASS: signed manifests, complete uploads, final tag URLs, verified publication and corrupted-upload rejection ($qa)"
