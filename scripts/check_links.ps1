[CmdletBinding()]
param(
    [string]$RepositoryRoot = (Split-Path $PSScriptRoot -Parent),
    [ValidateRange(1, 60)][int]$TimeoutSeconds = 15,
    [ValidateRange(1, 32)][int]$ThrottleLimit = 12
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$linksPath = Join-Path $RepositoryRoot 'data/links.json'
$urls = @(Get-Content -Raw -LiteralPath $linksPath |
    ConvertFrom-Json |
    ForEach-Object { $_.url } |
    Select-Object -Unique)

$checkedAt = [datetime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
$userAgent = 'awesome-maps-and-visualizations-link-checker/1.0 (+https://github.com/)'

$results = $urls | ForEach-Object -Parallel {
    $url = $_
    $response = $null
    $errorMessage = $null

    try {
        $response = Invoke-WebRequest -Uri $url -Method Head -MaximumRedirection 8 `
            -TimeoutSec $using:TimeoutSeconds -UserAgent $using:userAgent -SkipHttpErrorCheck
    }
    catch {
        $errorMessage = $_.Exception.GetType().Name
    }

    if (-not $response -or [int]$response.StatusCode -ge 400) {
        try {
            $response = Invoke-WebRequest -Uri $url -Method Get -MaximumRedirection 8 `
                -TimeoutSec $using:TimeoutSeconds -UserAgent $using:userAgent `
                -Headers @{ Range = 'bytes=0-2047' } -SkipHttpErrorCheck
            $errorMessage = $null
        }
        catch {
            $errorMessage = $_.Exception.GetType().Name
        }
    }

    $httpStatus = if ($response) { [int]$response.StatusCode } else { $null }
    $state = if ($httpStatus -ge 200 -and $httpStatus -lt 300 -and -not $errorMessage) {
        'ok'
    }
    elseif ($httpStatus -in 401, 403, 429) {
        'restricted'
    }
    else {
        'failed'
    }

    [pscustomobject]@{
        url = $url
        state = $state
        http_status = $httpStatus
        checked_at = $using:checkedAt
        error = $errorMessage
    }
} -ThrottleLimit $ThrottleLimit

$dataDirectory = Join-Path $RepositoryRoot 'data'
$statusPath = Join-Path $dataDirectory 'link-status.json'
New-Item -ItemType Directory -Force -Path $dataDirectory | Out-Null

$previousByUrl = @{}
if (Test-Path -LiteralPath $statusPath) {
    foreach ($status in (Get-Content -Raw -LiteralPath $statusPath | ConvertFrom-Json)) {
        $previousByUrl[$status.url] = $status
    }
}

$today = [datetime]::UtcNow.ToString('yyyy-MM-dd')
$merged = foreach ($result in $results) {
    $lastOk = if ($result.state -eq 'ok') {
        $today
    }
    elseif ($previousByUrl.ContainsKey($result.url)) {
        $previousByUrl[$result.url].last_ok
    }
    else {
        $null
    }

    [ordered]@{
        url = $result.url
        state = $result.state
        http_status = $result.http_status
        checked_at = $result.checked_at
        last_ok = $lastOk
    }
}

$merged | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $statusPath -Encoding utf8
& (Join-Path $PSScriptRoot 'import_bookmarks.ps1') -RepositoryRoot $RepositoryRoot

$okCount = @($merged | Where-Object state -eq 'ok').Count
$restrictedCount = @($merged | Where-Object state -eq 'restricted').Count
$failedCount = @($merged | Where-Object state -eq 'failed').Count
Write-Host "Checked $($merged.Count) unique URLs: $okCount ok, $restrictedCount restricted, $failedCount failed."
