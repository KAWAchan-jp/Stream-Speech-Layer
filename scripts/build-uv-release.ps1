<#
  Faster-Whisper ローカルサーバー（uv/ フォルダ）だけを ZIP にする。
  拡張機能本体（extension/）は含めない（scripts/build-release.ps1 で別途作成する）。
  ユーザーが .venv 等を作っていても、ここではソース一式（server.py / requirements.txt / README.md）のみ含める。
#>
param(
  [string]$OutputDirectory = "dist"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$uvRoot = Join-Path $root "uv"

$manifestPath = Join-Path $root "extension\manifest.json"
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
$version = $manifest.version
$zipName = "stream-speech-layer-uv-faster-whisper-v$version.zip"

$files = @(
  "server.py",
  "requirements.txt",
  "README.md"
)

if (-not (Test-Path -LiteralPath $OutputDirectory)) {
  New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
}
$outputRoot = Resolve-Path $OutputDirectory
$zipPath = Join-Path $outputRoot $zipName

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($relativePath in $files) {
    $sourcePath = Join-Path $uvRoot $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
      throw "Release file is missing: $relativePath"
    }

    # 展開すると uv フォルダが出るようにする
    $entryName = "uv/$relativePath"
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $sourcePath, $entryName) | Out-Null
  }
}
finally {
  $zip.Dispose()
}

Write-Host "Created $zipPath"
