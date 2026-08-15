# build-and-sync.ps1
# Automates build and copy from Windows to WSL

param(
    [string]$ProjectPath = "D:\boudicaai",
    [string]$WSLPath = "\\wsl$\Debian-Cuda\home\sibain\Boudica\collabora\nextcloud\boudicaai"
)

Write-Host "Building Boudica AI UI..." -ForegroundColor Green

# Navigate to project
cd $ProjectPath

# Clean old builds - PowerShell syntax
Write-Host "Cleaning old builds..." -ForegroundColor Yellow
Remove-Item -Path js, css -Recurse -Force -ErrorAction SilentlyContinue

# Build
Write-Host "Running: npm run build" -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

# Copy to WSL
Write-Host "Syncing to WSL..." -ForegroundColor Yellow
Copy-Item -Path js -Destination "$WSLPath\js" -Recurse -Force
Copy-Item -Path css -Destination "$WSLPath\css" -Recurse -Force

Write-Host "✓ Build complete and synced to WSL!" -ForegroundColor Green
Write-Host "Files ready at: $WSLPath/js/ and $WSLPath/css/" -ForegroundColor Green
