# start.ps1 - convenience script to start the server with fallback
param(
    [int]$Port = 3000
)
Write-Host "Tentando iniciar servidor a partir da porta $Port..."
$env:PORT = $Port
node .\server.js
