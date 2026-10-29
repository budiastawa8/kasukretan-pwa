#Requires -Version 5.1
<#
.SYNOPSIS
  Deploy manual ke Vercel (Hobby-friendly) tanpa mengandalkan git push.

.EXAMPLE
  npm run deploy:vercel:panel

.EXAMPLE
  npm run deploy:vercel -- -Project kasukretan-pwa

.EXAMPLE
  npm run deploy:vercel -- -All
#>
param(
  [string]$Project = "",
  [switch]$All,
  [string]$Scope = "",
  [switch]$Preview,
  [switch]$SkipBuild,
  [switch]$Gui
)

$ErrorActionPreference = "Stop"

if ($Gui) {
  $panel = Join-Path $PSScriptRoot "vercel-deploy-panel.ps1"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File $panel
  exit $LASTEXITCODE
}

. (Join-Path $PSScriptRoot "vercel-deploy-lib.ps1")
Set-Location (Get-VercelDeployRoot)

$token = Get-VercelToken
if (-not $token) {
  Write-Host @"

VERCEL_TOKEN belum ada.

1) Buat token di: https://vercel.com/account/tokens
2) Tambahkan ke .env.local:
     VERCEL_TOKEN=vercel_xxxx
3) Atau buka panel: npm run deploy:vercel:panel

"@ -ForegroundColor Yellow
  exit 1
}

$config = Read-VercelProjectsConfig
$projects = @()

if ($Project) {
  $projects = @($Project.Trim())
}
elseif ($All) {
  $projects = @($config.Projects)
  if ($projects.Count -eq 0) {
    Write-Host "Daftar project kosong. Edit scripts\vercel-projects.local.json atau buka panel." -ForegroundColor Yellow
    exit 1
  }
}
else {
  Write-Host @"

Pakai salah satu:
  npm run deploy:vercel:panel
  npm run deploy:vercel -- -Project kasukretan-pwa
  npm run deploy:vercel -- -All

Opsional: -Scope trista4  -Preview  -SkipBuild  -Gui

"@ -ForegroundColor Yellow
  exit 1
}

$effectiveScope = if ($Scope) { $Scope } else { $config.Scope }

$result = Deploy-VercelProjects `
  -Projects $projects `
  -Scope $effectiveScope `
  -Preview:$Preview `
  -SkipBuild:$SkipBuild

if ($result.Failed.Count -gt 0) { exit 1 }
exit 0
