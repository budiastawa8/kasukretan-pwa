# Shared helpers for vercel-deploy.ps1 and vercel-deploy-panel.ps1
$script:VercelScriptsDir = $PSScriptRoot
$script:VercelDeployRoot = Split-Path -Parent $PSScriptRoot

function Get-VercelDeployRoot {
  return $script:VercelDeployRoot
}

function Get-DotEnvValue([string]$Key) {
  $root = Get-VercelDeployRoot
  $candidates = @(
    (Join-Path $root ".env.local"),
    (Join-Path $root ".env")
  )
  foreach ($path in $candidates) {
    if (-not (Test-Path $path)) { continue }
    foreach ($line in Get-Content $path) {
      $trim = $line.Trim()
      if ($trim -eq "" -or $trim.StartsWith("#")) { continue }
      if ($trim -match "^(?:export\s+)?([^=]+)=(.*)$") {
        $k = $Matches[1].Trim()
        $v = $Matches[2].Trim().Trim("'").Trim('"')
        if ($k -eq $Key -and $v) { return $v }
      }
    }
  }
  return $null
}

function Get-VercelToken {
  if ($env:VERCEL_TOKEN) { return $env:VERCEL_TOKEN.Trim() }
  $fromFile = Get-DotEnvValue "VERCEL_TOKEN"
  if ($fromFile) { return $fromFile }
  return $null
}

function Get-VercelProjectsPaths {
  return @{
    Local   = (Join-Path $script:VercelScriptsDir "vercel-projects.local.json")
    Example = (Join-Path $script:VercelScriptsDir "vercel-projects.example.json")
  }
}

function Read-VercelProjectsConfig {
  $paths = Get-VercelProjectsPaths
  $target = $paths.Local
  if (-not (Test-Path $target)) {
    if (Test-Path $paths.Example) {
      Copy-Item $paths.Example $target
    }
    else {
      @{ scope = ""; projects = @("kasukretan-pwa") } | ConvertTo-Json | Set-Content -Path $target -Encoding UTF8
    }
  }
  $json = Get-Content $target -Raw -Encoding UTF8 | ConvertFrom-Json
  $list = @()
  foreach ($p in @($json.projects)) {
    if ($p) { $list += [string]$p }
  }
  return @{
    Scope    = $(if ($json.scope) { [string]$json.scope } else { "" })
    Projects = $list
    Path     = $target
  }
}

function Save-VercelProjectsConfig([string]$Scope, [string[]]$Projects) {
  $paths = Get-VercelProjectsPaths
  $obj = [ordered]@{
    scope    = $(if ($null -eq $Scope) { "" } else { $Scope })
    projects = @($Projects | Where-Object { $_ -and $_.Trim() } | ForEach-Object { $_.Trim() } | Select-Object -Unique)
  }
  ($obj | ConvertTo-Json -Depth 4) | Set-Content -Path $paths.Local -Encoding UTF8
  return $paths.Local
}

function Invoke-VercelCli {
  param(
    [string[]]$VercelArgs,
    [scriptblock]$OnLine = $null
  )
  $safe = @()
  for ($i = 0; $i -lt $VercelArgs.Count; $i++) {
    if ($i -gt 0 -and $VercelArgs[$i - 1] -eq "--token") { $safe += "***" }
    else { $safe += $VercelArgs[$i] }
  }
  $cmdLine = "npx vercel " + ($safe -join " ")
  if ($OnLine) { & $OnLine $cmdLine } else { Write-Host $cmdLine -ForegroundColor DarkGray }

  $argLine = (@("--yes", "vercel") + $VercelArgs | ForEach-Object {
      if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
    }) -join " "
  Invoke-LoggedProcess -FileName "cmd.exe" -Arguments "/c npx $argLine" -OnLine $OnLine -FailMessage "Perintah vercel gagal"
}

function Write-ProcessLogLine {
  param(
    [string]$Line,
    [scriptblock]$OnLine = $null
  )
  if ([string]::IsNullOrWhiteSpace($Line)) { return }
  if ($OnLine) { & $OnLine $Line } else { Write-Host $Line }
  try {
    if ("System.Windows.Forms.Application" -as [type]) {
      [System.Windows.Forms.Application]::DoEvents()
    }
  }
  catch { }
}

function Read-NewFileLines {
  param(
    [string]$Path,
    [ref]$Offset
  )
  $lines = @()
  if (-not (Test-Path -LiteralPath $Path)) { return $lines }
  try {
    $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
      if ($fs.Length -lt $Offset.Value) { $Offset.Value = 0 }
      [void]$fs.Seek($Offset.Value, [System.IO.SeekOrigin]::Begin)
      $reader = New-Object System.IO.StreamReader($fs, [System.Text.Encoding]::UTF8, $true, 1024, $true)
      $chunk = $reader.ReadToEnd()
      $Offset.Value = $fs.Position
      $reader.Dispose()
    }
    finally {
      $fs.Dispose()
    }
    if ($chunk) {
      $lines = $chunk -split "`r?`n"
      # Baris terakhir sering belum lengkap; sisipkan kembali ke offset sederhana:
      # untuk log build, tampilkan semua termasuk partial.
    }
  }
  catch { }
  return $lines
}

function Invoke-LoggedProcess {
  param(
    [string]$FileName,
    [string]$Arguments,
    [scriptblock]$OnLine = $null,
    [string]$FailMessage = "Perintah gagal"
  )

  $outFile = Join-Path $env:TEMP ("kasukretan-vercel-out-" + [guid]::NewGuid().ToString("n") + ".log")
  $errFile = Join-Path $env:TEMP ("kasukretan-vercel-err-" + [guid]::NewGuid().ToString("n") + ".log")
  "" | Set-Content -LiteralPath $outFile -Encoding UTF8
  "" | Set-Content -LiteralPath $errFile -Encoding UTF8

  try {
    $argList = $Arguments
    if ($FileName -eq "cmd.exe" -and $Arguments -match '^/c\s+(.+)$') {
      # Array 2 elemen: lebih andal daripada satu string panjang.
      $argList = @("/c", $Matches[1])
    }

    $proc = Start-Process -FilePath $FileName -ArgumentList $argList `
      -WorkingDirectory (Get-VercelDeployRoot) `
      -RedirectStandardOutput $outFile `
      -RedirectStandardError $errFile `
      -NoNewWindow `
      -PassThru

    $outOffset = 0
    $errOffset = 0
    $lastBeat = [DateTime]::UtcNow

    while (-not $proc.HasExited) {
      foreach ($line in (Read-NewFileLines -Path $outFile -Offset ([ref]$outOffset))) {
        Write-ProcessLogLine -Line $line -OnLine $OnLine
      }
      foreach ($line in (Read-NewFileLines -Path $errFile -Offset ([ref]$errOffset))) {
        Write-ProcessLogLine -Line $line -OnLine $OnLine
      }
      if (([DateTime]::UtcNow - $lastBeat).TotalSeconds -ge 10) {
        Write-ProcessLogLine -Line "(masih berjalan... build sering 1-3 menit, jangan tutup panel)" -OnLine $OnLine
        $lastBeat = [DateTime]::UtcNow
      }
      Start-Sleep -Milliseconds 400
      try {
        if ("System.Windows.Forms.Application" -as [type]) {
          [System.Windows.Forms.Application]::DoEvents()
        }
      }
      catch { }
    }

    Start-Sleep -Milliseconds 300
    foreach ($line in (Read-NewFileLines -Path $outFile -Offset ([ref]$outOffset))) {
      Write-ProcessLogLine -Line $line -OnLine $OnLine
    }
    foreach ($line in (Read-NewFileLines -Path $errFile -Offset ([ref]$errOffset))) {
      Write-ProcessLogLine -Line $line -OnLine $OnLine
    }

    # Pastikan ExitCode terisi (Start-Process kadang masih $null tepat setelah HasExited).
    [void]$proc.WaitForExit()
    $proc.Refresh()
    $code = $proc.ExitCode
    if ($null -eq $code) { $code = 0 }

    # Di PowerShell: ($null -ne 0) == $true, jadi wajib cek null dulu (di atas).
    if ($code -ne 0) {
      throw "$FailMessage (exit $code)."
    }
  }
  finally {
    Remove-Item -LiteralPath $outFile, $errFile -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-NpmBuild {
  param([scriptblock]$OnLine = $null)
  if ($OnLine) { & $OnLine "npm run build" } else { Write-Host "npm run build" -ForegroundColor DarkGray }
  if ($OnLine) { & $OnLine "(build lokal dimulai; tunggu sampai selesai)" }
  Invoke-LoggedProcess -FileName "cmd.exe" -Arguments "/c npm run build" -OnLine $OnLine -FailMessage "Build gagal"
}

function Deploy-VercelProjects {
  param(
    [string[]]$Projects,
    [string]$Scope = "",
    [switch]$Preview,
    [switch]$SkipBuild,
    [scriptblock]$OnLine = $null
  )

  $log = {
    param($msg)
    if ($OnLine) { & $OnLine $msg } else { Write-Host $msg }
  }

  $token = Get-VercelToken
  if (-not $token) {
    throw "VERCEL_TOKEN belum ada. Simpan di .env.local atau `$env:VERCEL_TOKEN."
  }
  if (-not $Projects -or $Projects.Count -eq 0) {
    throw "Tidak ada project yang dipilih."
  }

  & $log "==> Cek CLI Vercel"
  Invoke-VercelCli -VercelArgs @("--version") -OnLine $OnLine

  if (-not $SkipBuild) {
    & $log "==> Build lokal (npm run build)"
    Invoke-NpmBuild -OnLine $OnLine
  }
  else {
    & $log "Melewati build lokal."
  }

  $ok = @()
  $failed = @()
  foreach ($name in $Projects) {
    try {
      & $log "==> Link: $name"
      $linkArgs = @("link", "--yes", "--project", $name, "--token", $token)
      if ($Scope) { $linkArgs += @("--scope", $Scope) }
      Invoke-VercelCli -VercelArgs $linkArgs -OnLine $OnLine

      $mode = if ($Preview) { "preview" } else { "production" }
      & $log "==> Deploy $mode : $name"
      $deployArgs = @("deploy", "--yes", "--token", $token)
      if (-not $Preview) { $deployArgs += "--prod" }
      if ($Scope) { $deployArgs += @("--scope", $Scope) }
      Invoke-VercelCli -VercelArgs $deployArgs -OnLine $OnLine

      $ok += $name
      & $log "OK: $name"
    }
    catch {
      $failed += $name
      & $log "GAGAL: $name - $($_.Exception.Message)"
    }
  }

  & $log "======= Ringkasan ======="
  & $log ("Berhasil : " + ($(if ($ok.Count) { $ok -join ", " } else { "(tidak ada)" })))
  & $log ("Gagal    : " + ($(if ($failed.Count) { $failed -join ", " } else { "(tidak ada)" })))
  return @{ Ok = $ok; Failed = $failed }
}
