$ErrorActionPreference = "Stop"

$certDir = Join-Path $PSScriptRoot "certs"
New-Item -ItemType Directory -Force $certDir | Out-Null

$openssl = (Get-Command openssl -ErrorAction SilentlyContinue).Source
if (-not $openssl) {
  $candidates = @(
    (Join-Path $env:ProgramFiles "Git\usr\bin\openssl.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Git\usr\bin\openssl.exe")
  )
  $openssl = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $openssl) {
  throw "OpenSSL was not found. Install Git for Windows or add openssl to PATH."
}

$addresses = @("DNS:localhost", "IP:127.0.0.1")
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -ne "127.0.0.1" -and $_.PrefixOrigin -ne "WellKnown" } |
  ForEach-Object { $addresses += "IP:$($_.IPAddress)" }

$san = "subjectAltName=" + ($addresses -join ",")
$key = Join-Path $certDir "localhost-key.pem"
$cert = Join-Path $certDir "localhost-cert.pem"

& $openssl req -x509 -newkey rsa:2048 -nodes -keyout $key -out $cert -days 365 `
  -subj "/CN=northstar-local" -addext $san

Write-Host "Created $cert"
Write-Host "Created $key"
