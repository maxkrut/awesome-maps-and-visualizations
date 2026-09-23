[CmdletBinding()]
param(
    [string]$RepositoryRoot = (Split-Path $PSScriptRoot -Parent)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Compatibility entry point; the catalog now lives in data/links.json.
& node (Join-Path $PSScriptRoot 'build-catalog.mjs') $RepositoryRoot
if ($LASTEXITCODE -ne 0) { throw 'Catalog generation failed.' }
