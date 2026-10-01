<#
.SYNOPSIS
  Inspect a server's TLS connection and certificate chain without OpenSSL.

.DESCRIPTION
  Week 4 Block A. Uses only .NET classes that ship with Windows:
    System.Net.Security.SslStream                 the TLS handshake
    System.Security.Cryptography.X509Certificates  the certificate and chain
  Runs in Windows PowerShell 5.1 and PowerShell 7 (Windows, macOS, Linux).
  Read-only: one TCP connection, one TLS handshake, no HTTP request, and no
  file written unless -SaveCertificate is given.

.EXAMPLE
  .\tls-inspect.ps1 www.depaul.edu
.EXAMPLE
  .\tls-inspect.ps1 expired.badssl.com
.EXAMPLE
  .\tls-inspect.ps1 www.depaul.edu -SaveCertificate depaul.cer   # then: certutil -dump depaul.cer
#>
param(
  [Parameter(Position = 0)] [string] $HostName = "www.depaul.edu",
  [int] $Port = 443,
  [string] $SaveCertificate
)

$ErrorActionPreference = "Stop"
$script:policyErrors = $null
$script:chainRows = @()
$script:chainStatus = @()

# Accept every certificate so we can REPORT what is wrong instead of throwing.
# Never copy this callback into an application: it switches validation off.
$callback = {
  param($sender, $certificate, $chain, $sslPolicyErrors)
  $script:policyErrors = $sslPolicyErrors
  $depth = 0
  foreach ($element in $chain.ChainElements) {
    $script:chainRows += [pscustomobject]@{
      Depth    = $depth
      Subject  = $element.Certificate.Subject
      NotAfter = $element.Certificate.NotAfter.ToString("yyyy-MM-dd")
    }
    $depth++
  }
  $script:chainStatus = @($chain.ChainStatus | ForEach-Object { $_.Status.ToString() })
  return $true
}

$tcp = New-Object System.Net.Sockets.TcpClient($HostName, $Port)
try {
  $ssl = New-Object System.Net.Security.SslStream($tcp.GetStream(), $false, $callback)
  $ssl.AuthenticateAsClient($HostName)   # sends SNI = $HostName

  $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($ssl.RemoteCertificate)
  $san = $cert.Extensions | Where-Object { $_.Oid.Value -eq "2.5.29.17" } |
    ForEach-Object { $_.Format($false) }
  $cipher = if ($ssl.PSObject.Properties["NegotiatedCipherSuite"]) {
    $ssl.NegotiatedCipherSuite              # PowerShell 7 / .NET 5+
  } else {
    "$($ssl.CipherAlgorithm) $($ssl.CipherStrength)-bit"   # Windows PowerShell 5.1
  }
  $daysLeft = [int][math]::Floor(($cert.NotAfter - (Get-Date)).TotalDays)

  "== Connection =="
  [pscustomobject]@{
    Host     = "${HostName}:$Port"
    Protocol = $ssl.SslProtocol
    Cipher   = $cipher
  } | Format-List

  "== Leaf certificate =="
  [pscustomobject]@{
    Subject    = $cert.Subject
    Issuer     = $cert.Issuer
    NotBefore  = $cert.NotBefore.ToString("yyyy-MM-dd HH:mm")
    NotAfter   = $cert.NotAfter.ToString("yyyy-MM-dd HH:mm")
    DaysLeft   = $daysLeft
    SAN        = $san
    Thumbprint = $cert.Thumbprint
  } | Format-List

  "== Chain built by this device (0 = leaf) =="
  $script:chainRows | Format-Table -AutoSize

  "== Verdict =="
  [pscustomobject]@{
    PolicyErrors = $script:policyErrors
    ChainStatus  = if ($script:chainStatus.Count) { $script:chainStatus -join ", " } else { "OK" }
  } | Format-List

  if ($SaveCertificate) {
    $bytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
    [System.IO.File]::WriteAllBytes((Join-Path (Get-Location) $SaveCertificate), $bytes)
    "Saved the leaf certificate to $SaveCertificate (public data, safe to share)."
  }
} finally {
  if ($ssl) { $ssl.Dispose() }
  $tcp.Dispose()
}
