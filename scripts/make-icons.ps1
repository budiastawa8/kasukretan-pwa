# Buat ikon PWA dari public/icon.png (sekali jalan; hasil di-commit).
#   powershell -ExecutionPolicy Bypass -File scripts/make-icons.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src = [System.Drawing.Image]::FromFile((Join-Path $root "public\icon.png"))
$bg = [System.Drawing.ColorTranslator]::FromHtml("#faf3eb")

function Save-Icon([int]$size, [string]$name, [double]$scale, [bool]$fill) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = "HighQuality"
  $g.InterpolationMode = "HighQualityBicubic"
  $g.PixelOffsetMode = "HighQuality"
  if ($fill) { $g.Clear($bg) } else { $g.Clear([System.Drawing.Color]::Transparent) }
  $inner = [int]($size * $scale)
  $off = [int](($size - $inner) / 2)
  $g.DrawImage($src, $off, $off, $inner, $inner)
  $g.Dispose()
  $bmp.Save((Join-Path $root "public\$name"), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "public\$name"
}

Save-Icon 192 "pwa-192x192.png" 1.0 $false
Save-Icon 512 "pwa-512x512.png" 1.0 $false
# Android memotong ikon "maskable" jadi lingkaran/kotak bulat — logo dikecilkan ke zona aman 80%.
Save-Icon 512 "pwa-maskable-512x512.png" 0.78 $true
Save-Icon 180 "apple-touch-icon.png" 0.86 $true

$src.Dispose()
