# hey installer for Windows (PowerShell 5.1 or newer, Windows 10+).
#
#   irm https://raw.githubusercontent.com/dpatel7-dev/hey/main/install.ps1 | iex
#
# What it does - no admin rights, nothing outside your user folder:
#   1. downloads hey into  %USERPROFILE%\.hey\app
#   2. uses your Node.js if it is v18 or newer; otherwise downloads a private
#      copy into %USERPROFILE%\.hey\node (your system is left alone)
#   3. creates the `hey` command in %USERPROFILE%\.hey\bin and adds that
#      folder to your user PATH
#
# Uninstall: delete the %USERPROFILE%\.hey folder (this deletes your saved data too).

& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'   # makes downloads much faster on PowerShell 5.1

  $repo     = if ($env:HEY_REPO)        { $env:HEY_REPO }        else { 'dpatel7-dev/hey' }
  $branch   = if ($env:HEY_BRANCH)      { $env:HEY_BRANCH }      else { 'main' }
  $root     = if ($env:HEY_INSTALL_DIR) { $env:HEY_INSTALL_DIR } else { Join-Path $env:USERPROFILE '.hey' }
  $nodeDist = if ($env:HEY_NODE_DIST)   { $env:HEY_NODE_DIST }   else { 'https://nodejs.org/dist/latest-v24.x' }
  $binDir   = Join-Path $root 'bin'
  $appDir   = Join-Path $root 'app'
  $nodeDir  = Join-Path $root 'node'

  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  } catch { }

  function Say([string]$Text) { Write-Host "  > $Text" }

  function Test-Node([string]$Exe) {
    try {
      $v = & $Exe -p "process.versions.node.split('.')[0]" 2>$null
      return ([int]$v -ge 18)
    } catch {
      return $false
    }
  }

  Write-Host ''
  Write-Host "  Installing hey from github.com/$repo"
  Write-Host ''

  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('hey-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp -Force | Out-Null

  try {
    # 1. hey itself ---------------------------------------------------------
    Say 'Downloading hey'
    $zip = Join-Path $tmp 'app.zip'
    try {
      Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/$repo/archive/refs/heads/$branch.zip" -OutFile $zip
    } catch {
      throw "Couldn't download hey from github.com/$repo. Is the repository public, and is your internet working?"
    }
    $unpacked = Join-Path $tmp 'unpacked'
    Expand-Archive -Path $zip -DestinationPath $unpacked -Force
    $src = Get-ChildItem -Path $unpacked -Directory | Select-Object -First 1
    if (-not $src -or -not (Test-Path (Join-Path $src.FullName 'bin\hey.js'))) {
      throw "The download doesn't look like hey."
    }

    # 2. Node.js ---------------------------------------------------------------
    $privateNode = Join-Path $nodeDir 'node.exe'
    if ((Test-Path $privateNode) -and (Test-Node $privateNode)) {
      Say "Using hey's private Node.js"
    } elseif ((Get-Command node -ErrorAction SilentlyContinue) -and (Test-Node 'node')) {
      Say "Using your Node.js ($(& node -v))"
    } else {
      if (-not [Environment]::Is64BitOperatingSystem) {
        throw 'hey needs 64-bit Windows (or install Node.js 18+ yourself and run this again).'
      }
      Say 'Node.js 18+ not found - downloading a private copy (stays inside the hey folder)'
      $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
      $sums = [string](Invoke-RestMethod -UseBasicParsing -Uri "$nodeDist/SHASUMS256.txt")
      $m = [regex]::Match($sums, "(?m)^([0-9a-f]{64})\s+(node-v[0-9.]+-win-$arch\.zip)\s*$")
      if (-not $m.Success) { throw "nodejs.org has no download for Windows $arch. Install Node.js 18+ yourself, then run this again." }
      $want = $m.Groups[1].Value
      $file = $m.Groups[2].Value
      $nodeZip = Join-Path $tmp 'node.zip'
      Invoke-WebRequest -UseBasicParsing -Uri "$nodeDist/$file" -OutFile $nodeZip
      $got = (Get-FileHash -Path $nodeZip -Algorithm SHA256).Hash.ToLower()
      if ($got -ne $want) { throw 'The Node.js download was damaged (checksum mismatch). Please try again.' }
      $nodeUnpacked = Join-Path $tmp 'node'
      Expand-Archive -Path $nodeZip -DestinationPath $nodeUnpacked -Force
      $nodeSrc = Get-ChildItem -Path $nodeUnpacked -Directory | Select-Object -First 1
      if (-not $nodeSrc -or -not (Test-Node (Join-Path $nodeSrc.FullName 'node.exe'))) {
        throw "The downloaded Node.js doesn't run on this machine."
      }
      New-Item -ItemType Directory -Path $root -Force | Out-Null
      if (Test-Path $nodeDir) { Remove-Item -Recurse -Force $nodeDir }
      Move-Item -Path $nodeSrc.FullName -Destination $nodeDir
    }

    # 3. Put everything in place ------------------------------------------------
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null
    if (Test-Path $appDir) { Remove-Item -Recurse -Force $appDir }
    Move-Item -Path $src.FullName -Destination $appDir

    # Installed from the website? Remember it, so nobody has to type an address.
    if ($env:HEY_HUB -match '^(https?|wss?)://\S+$') {
      Set-Content -Path (Join-Path $root 'hub') -Value $env:HEY_HUB -Encoding ASCII
    }

    $launcher = @'
@echo off
rem hey launcher - written by install.ps1. Re-run the installer to recreate it.
setlocal
set "HEY_ROOT=%~dp0.."
if exist "%HEY_ROOT%\node\node.exe" (
  "%HEY_ROOT%\node\node.exe" "%HEY_ROOT%\app\bin\hey.js" %*
) else (
  node "%HEY_ROOT%\app\bin\hey.js" %*
)
exit /b %ERRORLEVEL%
'@
    Set-Content -Path (Join-Path $binDir 'hey.cmd') -Value $launcher -Encoding ASCII

    # 4. PATH (for this user only) ------------------------------------------------
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (-not $userPath) { $userPath = '' }
    $parts = @($userPath.Split(';') | Where-Object { $_ })
    if ($parts -notcontains $binDir) {
      [Environment]::SetEnvironmentVariable('Path', (($parts + $binDir) -join ';'), 'User')
    }
    if (@($env:Path.Split(';')) -notcontains $binDir) { $env:Path = "$env:Path;$binDir" }

    $version = & (Join-Path $binDir 'hey.cmd') --version
    if ($LASTEXITCODE -ne 0) { throw "hey was installed but won't start. Try: $binDir\hey.cmd --version" }

    Write-Host ''
    Write-Host "  Done. $version is installed." -ForegroundColor Green
    Write-Host ''
    Write-Host '  Ask for a command:  hey'
    Write-Host '  (Best in Windows Terminal. If "hey" is not found, open a new terminal window first.)'
    Write-Host ''
  } finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }
}
