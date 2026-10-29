#Requires -Version 5.1
<#
.SYNOPSIS
  Panel GUI untuk deploy manual Vercel (centang project → Deploy).

.EXAMPLE
  npm run deploy:vercel:panel
#>

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

. (Join-Path $PSScriptRoot "vercel-deploy-lib.ps1")

[System.Windows.Forms.Application]::EnableVisualStyles()

$config = Read-VercelProjectsConfig
$tokenOk = [bool](Get-VercelToken)

$form = New-Object System.Windows.Forms.Form
$form.Text = "Deploy Vercel - kasukretan-pwa"
$form.Size = New-Object System.Drawing.Size(720, 620)
$form.StartPosition = "CenterScreen"
$form.MinimumSize = New-Object System.Drawing.Size(640, 520)
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)

$lblTitle = New-Object System.Windows.Forms.Label
$lblTitle.Text = "Pilih project, lalu klik Deploy production"
$lblTitle.Location = New-Object System.Drawing.Point(16, 14)
$lblTitle.AutoSize = $true
$lblTitle.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 11)

$lblToken = New-Object System.Windows.Forms.Label
$lblToken.Location = New-Object System.Drawing.Point(16, 42)
$lblToken.AutoSize = $true
if ($tokenOk) {
  $lblToken.Text = "Token: ditemukan (.env.local / VERCEL_TOKEN)"
  $lblToken.ForeColor = [System.Drawing.Color]::ForestGreen
}
else {
  $lblToken.Text = "Token: BELUM ADA - isi VERCEL_TOKEN di .env.local"
  $lblToken.ForeColor = [System.Drawing.Color]::Firebrick
}

$lblScope = New-Object System.Windows.Forms.Label
$lblScope.Text = "Scope tim (opsional):"
$lblScope.Location = New-Object System.Drawing.Point(16, 72)
$lblScope.AutoSize = $true

$txtScope = New-Object System.Windows.Forms.TextBox
$txtScope.Location = New-Object System.Drawing.Point(160, 68)
$txtScope.Width = 220
$txtScope.Text = $config.Scope

$chkPreview = New-Object System.Windows.Forms.CheckBox
$chkPreview.Text = "Preview saja (bukan production)"
$chkPreview.Location = New-Object System.Drawing.Point(400, 70)
$chkPreview.AutoSize = $true

$chkSkipBuild = New-Object System.Windows.Forms.CheckBox
$chkSkipBuild.Text = "Lewati build lokal"
$chkSkipBuild.Location = New-Object System.Drawing.Point(400, 94)
$chkSkipBuild.AutoSize = $true

$lblProjects = New-Object System.Windows.Forms.Label
$lblProjects.Text = "Project Vercel"
$lblProjects.Location = New-Object System.Drawing.Point(16, 108)
$lblProjects.AutoSize = $true

$list = New-Object System.Windows.Forms.CheckedListBox
$list.Location = New-Object System.Drawing.Point(16, 130)
$list.Size = New-Object System.Drawing.Size(360, 200)
$list.CheckOnClick = $true
foreach ($p in $config.Projects) {
  [void]$list.Items.Add($p, $true)
}

$txtNew = New-Object System.Windows.Forms.TextBox
$txtNew.Location = New-Object System.Drawing.Point(16, 340)
$txtNew.Width = 220
$txtNew.Text = ""

$btnAdd = New-Object System.Windows.Forms.Button
$btnAdd.Text = "Tambah"
$btnAdd.Location = New-Object System.Drawing.Point(246, 338)
$btnAdd.Width = 70

$btnSelectAll = New-Object System.Windows.Forms.Button
$btnSelectAll.Text = "Centang semua"
$btnSelectAll.Location = New-Object System.Drawing.Point(400, 130)
$btnSelectAll.Width = 140

$btnClear = New-Object System.Windows.Forms.Button
$btnClear.Text = "Hapus centang"
$btnClear.Location = New-Object System.Drawing.Point(400, 164)
$btnClear.Width = 140

$btnRemove = New-Object System.Windows.Forms.Button
$btnRemove.Text = "Hapus item terpilih"
$btnRemove.Location = New-Object System.Drawing.Point(400, 198)
$btnRemove.Width = 140

$btnSave = New-Object System.Windows.Forms.Button
$btnSave.Text = "Simpan daftar"
$btnSave.Location = New-Object System.Drawing.Point(400, 232)
$btnSave.Width = 140

$btnTokenPage = New-Object System.Windows.Forms.Button
$btnTokenPage.Text = "Buka halaman token"
$btnTokenPage.Location = New-Object System.Drawing.Point(400, 266)
$btnTokenPage.Width = 140

$btnDeploy = New-Object System.Windows.Forms.Button
$btnDeploy.Text = "Deploy"
$btnDeploy.Location = New-Object System.Drawing.Point(400, 330)
$btnDeploy.Size = New-Object System.Drawing.Size(140, 36)
$btnDeploy.BackColor = [System.Drawing.Color]::FromArgb(17, 17, 17)
$btnDeploy.ForeColor = [System.Drawing.Color]::White
$btnDeploy.FlatStyle = "Flat"
$btnDeploy.Enabled = $tokenOk

$lblLog = New-Object System.Windows.Forms.Label
$lblLog.Text = "Log"
$lblLog.Location = New-Object System.Drawing.Point(16, 376)
$lblLog.AutoSize = $true

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Location = New-Object System.Drawing.Point(16, 396)
$logBox.Size = New-Object System.Drawing.Size(670, 160)
$logBox.Multiline = $true
$logBox.ScrollBars = "Vertical"
$logBox.ReadOnly = $true
$logBox.Font = New-Object System.Drawing.Font("Consolas", 9)
$logBox.Anchor = "Top,Bottom,Left,Right"

function Append-Log([string]$Message) {
  if ($logBox.IsDisposed) { return }
  $logBox.AppendText("$(Get-Date -Format 'HH:mm:ss')  $Message`r`n")
  $logBox.SelectionStart = $logBox.Text.Length
  $logBox.ScrollToCaret()
  [System.Windows.Forms.Application]::DoEvents()
}

function Get-ListedProjects {
  $items = @()
  foreach ($item in $list.Items) { $items += [string]$item }
  return $items
}

function Get-CheckedProjects {
  $items = @()
  foreach ($item in $list.CheckedItems) { $items += [string]$item }
  return $items
}

$btnAdd.Add_Click({
    $name = $txtNew.Text.Trim()
    if (-not $name) { return }
    if ($list.Items -contains $name) {
      [System.Windows.Forms.MessageBox]::Show("Project sudah ada di daftar.", "Deploy Vercel") | Out-Null
      return
    }
    [void]$list.Items.Add($name, $true)
    $txtNew.Text = ""
  })

$btnSelectAll.Add_Click({
    for ($i = 0; $i -lt $list.Items.Count; $i++) { $list.SetItemChecked($i, $true) }
  })

$btnClear.Add_Click({
    for ($i = 0; $i -lt $list.Items.Count; $i++) { $list.SetItemChecked($i, $false) }
  })

$btnRemove.Add_Click({
    $toRemove = @($list.SelectedItems)
    foreach ($item in $toRemove) { $list.Items.Remove($item) }
  })

$btnSave.Add_Click({
    $path = Save-VercelProjectsConfig -Scope $txtScope.Text.Trim() -Projects (Get-ListedProjects)
    Append-Log "Daftar disimpan: $path"
    [System.Windows.Forms.MessageBox]::Show("Daftar project disimpan.", "Deploy Vercel") | Out-Null
  })

$btnTokenPage.Add_Click({
    Start-Process "https://vercel.com/account/tokens"
  })

$btnDeploy.Add_Click({
    $selected = @(Get-CheckedProjects)
    if ($selected.Count -eq 0) {
      [System.Windows.Forms.MessageBox]::Show("Centang minimal satu project.", "Deploy Vercel") | Out-Null
      return
    }
    if (-not (Get-VercelToken)) {
      [System.Windows.Forms.MessageBox]::Show(
        "VERCEL_TOKEN belum ada.`nBuat token di vercel.com/account/tokens lalu simpan di .env.local",
        "Deploy Vercel"
      ) | Out-Null
      return
    }

    Save-VercelProjectsConfig -Scope $txtScope.Text.Trim() -Projects (Get-ListedProjects) | Out-Null

    $btnDeploy.Enabled = $false
    $btnAdd.Enabled = $false
    $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
    Append-Log "Mulai deploy: $($selected -join ', ')"

    try {
      $result = Deploy-VercelProjects `
        -Projects $selected `
        -Scope $txtScope.Text.Trim() `
        -Preview:$($chkPreview.Checked) `
        -SkipBuild:$($chkSkipBuild.Checked) `
        -OnLine { param($m) Append-Log $m }

      if ($result.Failed.Count -eq 0) {
        [System.Windows.Forms.MessageBox]::Show("Deploy selesai. Semua berhasil.", "Deploy Vercel") | Out-Null
      }
      else {
        [System.Windows.Forms.MessageBox]::Show(
          ("Selesai dengan kegagalan:`n" + ($result.Failed -join ", ")),
          "Deploy Vercel"
        ) | Out-Null
      }
    }
    catch {
      Append-Log "ERROR: $($_.Exception.Message)"
      [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "Deploy Vercel - Error") | Out-Null
    }
    finally {
      $form.Cursor = [System.Windows.Forms.Cursors]::Default
      $btnDeploy.Enabled = [bool](Get-VercelToken)
      $btnAdd.Enabled = $true
    }
  })

$form.Controls.AddRange(@(
    $lblTitle, $lblToken, $lblScope, $txtScope, $chkPreview, $chkSkipBuild,
    $lblProjects, $list, $txtNew, $btnAdd,
    $btnSelectAll, $btnClear, $btnRemove, $btnSave, $btnTokenPage, $btnDeploy,
    $lblLog, $logBox
  ))

$form.Add_Shown({
    Append-Log "Panel siap. Root: $(Get-VercelDeployRoot)"
    if (-not $tokenOk) {
      Append-Log "Tambahkan VERCEL_TOKEN=... ke .env.local lalu buka ulang panel."
    }
  })

[void]$form.ShowDialog()
