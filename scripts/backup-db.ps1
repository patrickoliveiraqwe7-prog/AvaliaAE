param(
    [string]$DbPath = "./avaliacoes.db",
    [string]$OutDir = "./backups"
)
if (!(Test-Path $DbPath)) { Write-Error "DB not found: $DbPath"; exit 1 }
if (!(Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
$ts = (Get-Date).ToString('yyyyMMddTHHmmssZ')
$dest = Join-Path $OutDir ("avaliacoes.db.$ts")
Copy-Item -Path $DbPath -Destination $dest -Force
Write-Host "Backup created: $dest"
