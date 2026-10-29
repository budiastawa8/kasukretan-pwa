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
    }
  }
  catch { }
  return $lines
}

function Test-VercelCliFatalError {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) { return $false }
  $patterns = @(
    'fetch failed',
    'TypeError:\s*fetch failed',
    'ECONNRESET',
    'ENOTFOUND',
    'ETIMEDOUT',
    'socket hang up',
    'network error',
    'Unauthorized',
    'not_authorized',
    'Invalid token',
    'Deployment failed',
    'Error:\s*An unexpected error occurred'
  )
  foreach ($p in $patterns) {
    if ($Text -imatch $p) { return $true }
  }
  return $false
}

function Find-VercelDeployUrl {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
  # Ambil URL vercel.app terakhir (production/preview inspection).
  $matches = [regex]::Matches($Text, 'https://[a-zA-Z0-9._\-]+\.vercel\.app[^\s]*')
  if ($matches.Count -eq 0) { return $null }
  return $matches[$matches.Count - 1].Value.TrimEnd('.', ',', ')', ']')
}

function Invoke-LoggedProcess {
  param(
    [string]$FileName,
    [string]$Arguments,
    [scriptblock]$OnLine = $null,
    [string]$FailMessage = "Perintah gagal",
    [switch]$RequireDeployUrl,
    [switch]$AllowNullExitAsZero
  )

  $outFile = Join-Path $env:TEMP ("kasukretan-vercel-out-" + [guid]::NewGuid().ToString("n") + ".log")
  $errFile = Join-Path $env:TEMP ("kasukretan-vercel-err-" + [guid]::NewGuid().ToString("n") + ".log")
  "" | Set-Content -LiteralPath $outFile -Encoding UTF8
  "" | Set-Content -LiteralPath $errFile -Encoding UTF8

  $combined = New-Object System.Text.StringBuilder

  try {
    $argList = $Arguments
    if ($FileName -eq "cmd.exe" -and $Arguments -match '^/c\s+(.+)$') {
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
        [void]$combined.AppendLine($line)
        Write-ProcessLogLine -Line $line -OnLine $OnLine
      }
      foreach ($line in (Read-NewFileLines -Path $errFile -Offset ([ref]$errOffset))) {
        [void]$combined.AppendLine($line)
        Write-ProcessLogLine -Line $line -OnLine $OnLine
      }
      if (([DateTime]::UtcNow - $lastBeat).TotalSeconds -ge 10) {
        Write-ProcessLogLine -Line "(masih berjalan... jangan tutup panel)" -OnLine $OnLine
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

    Start-Sleep -Milliseconds 400
    foreach ($line in (Read-NewFileLines -Path $outFile -Offset ([ref]$outOffset))) {
      [void]$combined.AppendLine($line)
      Write-ProcessLogLine -Line $line -OnLine $OnLine
    }
    foreach ($line in (Read-NewFileLines -Path $errFile -Offset ([ref]$errOffset))) {
      [void]$combined.AppendLine($line)
      Write-ProcessLogLine -Line $line -OnLine $OnLine
    }

    [void]$proc.WaitForExit()
    $proc.Refresh()
    $code = $proc.ExitCode
    $text = $combined.ToString()
    $deployUrl = Find-VercelDeployUrl -Text $text
    $fatal = Test-VercelCliFatalError -Text $text

    if ($null -eq $code) {
      if ($AllowNullExitAsZero -and -not $fatal -and (-not $RequireDeployUrl -or $deployUrl)) {
        $code = 0
      }
      else {
        $code = 1
      }
    }

    if ($fatal) {
      throw "$FailMessage - terdeteksi error jaringan/API di log (mis. fetch failed). Cek internet/hotspot, lalu coba lagi."
    }
    if ($RequireDeployUrl -and -not $deployUrl) {
      throw "$FailMessage - tidak ada URL *.vercel.app di output. Deployment kemungkinan tidak terbuat. Cek Scope tim / token / koneksi."
    }
    if ($code -ne 0) {
      throw "$FailMessage (exit $code)."
    }

    return @{
      ExitCode  = $code
      Output    = $text
      DeployUrl = $deployUrl
    }
  }
  finally {
    Remove-Item -LiteralPath $outFile, $errFile -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-VercelCli {
  param(
    [string[]]$VercelArgs,
    [scriptblock]$OnLine = $null,
    [string]$FailMessage = "Perintah vercel gagal",
    [switch]$RequireDeployUrl,
    [switch]$AllowNullExitAsZero
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

  return Invoke-LoggedProcess `
    -FileName "cmd.exe" `
    -Arguments "/c npx $argLine" `
    -OnLine $OnLine `
    -FailMessage $FailMessage `
    -RequireDeployUrl:$RequireDeployUrl `
    -AllowNullExitAsZero:$AllowNullExitAsZero
}

function Invoke-NpmBuild {
  param([scriptblock]$OnLine = $null)
  if ($OnLine) { & $OnLine "npm run build" } else { Write-Host "npm run build" -ForegroundColor DarkGray }
  if ($OnLine) { & $OnLine "(build lokal dimulai; tunggu sampai selesai)" }
  [void](Invoke-LoggedProcess -FileName "cmd.exe" -Arguments "/c npm run build" -OnLine $OnLine -FailMessage "Build gagal" -AllowNullExitAsZero)
}

function Invoke-VercelDeployWithRetry {
  param(
    [string[]]$DeployArgs,
    [scriptblock]$OnLine = $null,
    [int]$MaxAttempts = 3
  )
  $lastError = $null
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      if ($attempt -gt 1) {
        if ($OnLine) { & $OnLine "Mencoba ulang deploy ($attempt/$MaxAttempts)..." }
        Start-Sleep -Seconds (3 * ($attempt - 1))
      }
      return Invoke-VercelCli `
        -VercelArgs $DeployArgs `
        -OnLine $OnLine `
        -FailMessage "Deploy gagal" `
        -RequireDeployUrl
    }
    catch {
      $lastError = $_
      $msg = $_.Exception.Message
      $retryable = ($msg -imatch 'fetch failed|jaringan|network|ECONNRESET|ETIMEDOUT|tidak ada URL')
      if (-not $retryable -or $attempt -ge $MaxAttempts) { throw }
      if ($OnLine) { & $OnLine "Gagal sementara: $msg" }
    }
  }
  throw $lastError
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
  [void](Invoke-VercelCli -VercelArgs @("--version") -OnLine $OnLine -FailMessage "Gagal cek versi vercel" -AllowNullExitAsZero)

  if (-not $SkipBuild) {
    & $log "==> Build lokal (npm run build)"
    Invoke-NpmBuild -OnLine $OnLine
  }
  else {
    & $log "Melewati build lokal (build dilakukan di Vercel)."
  }

  $ok = @()
  $failed = @()
  $urls = @{}

  foreach ($name in $Projects) {
    try {
      & $log "==> Link: $name"
      $linkArgs = @("link", "--yes", "--project", $name, "--token", $token)
      if ($Scope) { $linkArgs += @("--scope", $Scope) }
      [void](Invoke-VercelCli -VercelArgs $linkArgs -OnLine $OnLine -FailMessage "Link project gagal ($name)")

      $mode = if ($Preview) { "preview" } else { "production" }
      & $log "==> Deploy $mode : $name"
      $deployArgs = @("deploy", "--yes", "--token", $token)
      if (-not $Preview) { $deployArgs += "--prod" }
      if ($Scope) { $deployArgs += @("--scope", $Scope) }

      $result = Invoke-VercelDeployWithRetry -DeployArgs $deployArgs -OnLine $OnLine -MaxAttempts 3
      $urls[$name] = $result.DeployUrl
      $ok += $name
      & $log "OK: $name"
      & $log ("URL: " + $result.DeployUrl)
    }
    catch {
      $failed += $name
      & $log "GAGAL: $name - $($_.Exception.Message)"
    }
  }

  & $log "======= Ringkasan ======="
  & $log ("Berhasil : " + ($(if ($ok.Count) { $ok -join ", " } else { "(tidak ada)" })))
  & $log ("Gagal    : " + ($(if ($failed.Count) { $failed -join ", " } else { "(tidak ada)" })))
  if ($ok.Count -gt 0) {
    & $log "URL deploy (wajib ada di Vercel Deployments):"
    foreach ($name in $ok) {
      & $log ("  - ${name}: " + $urls[$name])
    }
  }
  if ($failed.Count -gt 0) {
    & $log "Catatan: jika sering fetch failed, ganti jaringan/hotspot dan isi Scope tim bila project di bawah team."
  }

  return @{ Ok = $ok; Failed = $failed; Urls = $urls }
}
