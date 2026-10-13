# ==============================================================================
# OpenPisoWiFi - Download Official Ruijie RG-EW1200G Pro OpenWrt Firmware
# Target: ramips/mt7621 | Profile: ruijie_rg-ew1200g-pro-v1.1
# Version: OpenWrt 25.12.5 (Stable)
# ==============================================================================

param(
    [ValidateSet("all", "sysupgrade", "kernel", "initramfs", "recovery")]
    [string]$Mode = "all"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BinDir = Join-Path $ScriptDir "bin"
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir | Out-Null
}

$BaseUrl = "https://downloads.openwrt.org/releases/25.12.5/targets/ramips/mt7621"

$Files = @(
    @{
        Type = "sysupgrade"
        Name = "openwrt-25.12.5-ramips-mt7621-ruijie_rg-ew1200g-pro-v1.1-squashfs-sysupgrade.bin"
        Sha256 = "d9f17619041b99116253e8b45430d10108c8021e107cc639156f8040ac8fbb3c"
        Description = "SquashFS Sysupgrade (for flashing via LuCI or CLI sysupgrade)"
    },
    @{
        Type = "kernel"
        Name = "openwrt-25.12.5-ramips-mt7621-ruijie_rg-ew1200g-pro-v1.1-initramfs-kernel.bin"
        Sha256 = "199f42f37c765a14aba4523ba90a2672828a9342bd46c9aa4aeed12f0f57a770"
        Description = "Initramfs Kernel (for initial recovery, OEM factory TFTP or bootloader)"
    }
)

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "Ruijie RG-EW1200G Pro v1.1 - OpenWrt 25.12.5 Firmware Downloader" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "Target:        ramips/mt7621"
Write-Host "Profile:       ruijie_rg-ew1200g-pro-v1.1"
Write-Host "Version:       25.12.5 (Stable)"
Write-Host "Destination:   $BinDir"
Write-Host ""

function Download-And-Verify {
    param(
        [hashtable]$fileItem
    )

    $fileName = $fileItem["Name"]
    $expectedHash = $fileItem["Sha256"].ToLower()
    $desc = $fileItem["Description"]
    $targetPath = Join-Path $BinDir $fileName
    $url = "$BaseUrl/$fileName"

    if (Test-Path $targetPath) {
        Write-Host "File already exists: $fileName" -ForegroundColor Yellow
        Write-Host "Verifying existing checksum..."
    } else {
        Write-Host "Downloading $fileName ($desc)..." -ForegroundColor Cyan
        Invoke-WebRequest -Uri $url -OutFile $targetPath
    }

    $actualHash = (Get-FileHash -Path $targetPath -Algorithm SHA256).Hash.ToLower()

    if ($actualHash -eq $expectedHash) {
        Write-Host "[OK] Verified SHA256: $actualHash" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] SHA256 MISMATCH for $fileName!" -ForegroundColor Red
        Write-Host "  Expected: $expectedHash"
        Write-Host "  Actual:   $actualHash"
        Remove-Item $targetPath -Force -ErrorAction SilentlyContinue
        throw "Checksum verification failed for $fileName"
    }
    Write-Host ""
}

$ItemsToDownload = $Files
if ($Mode -eq "sysupgrade") {
    $ItemsToDownload = $Files | Where-Object { $_["Type"] -eq "sysupgrade" }
} elseif ($Mode -in @("kernel", "initramfs", "recovery")) {
    $ItemsToDownload = $Files | Where-Object { $_["Type"] -eq "kernel" }
}

foreach ($item in $ItemsToDownload) {
    Download-And-Verify -fileItem $item
}

Write-Host "[SUCCESS] Firmware download and verification completed successfully!" -ForegroundColor Green
Write-Host "Binaries saved to: $BinDir" -ForegroundColor Cyan
