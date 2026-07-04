<#
  拡張機能本体（extension/ フォルダ）だけを ZIP にする。
  Faster-Whisper ローカルサーバー（uv/）は含めない（scripts/build-uv-release.ps1 で別途作成する）。
#>
param(
  [string]$OutputDirectory = "dist"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$extensionRoot = Join-Path $root "extension"
$manifestPath = Join-Path $extensionRoot "manifest.json"
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
$version = $manifest.version
$zipName = "stream-speech-layer-v$version.zip"

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
  $files = Get-ChildItem -Path $extensionRoot -Recurse -File
  foreach ($file in $files) {
    $relativePath = $file.FullName.Substring($root.Path.Length + 1).Replace("\", "/")
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $relativePath) | Out-Null
  }
}
finally {
  $zip.Dispose()
}

Write-Host "Created $zipPath"
