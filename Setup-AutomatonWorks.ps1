# Clones the AutomatonWorks repos, builds the shared ZZZ venv and a ready VS Code workspace.
# Run: powershell -ExecutionPolicy Bypass -File Setup-AutomatonWorks.ps1

$ErrorActionPreference = "Stop"

$ORG_URL = "https://github.com/AutomatonWorks"
# Workspace order
$REPOS = @("commons", "GUI", "Yorha", "GI-Automaton", "HSR-Automaton", "ZZZ-Automaton")
# Repos installed editable into the ZZZ venv, which every folder in the workspace uses
$EDITABLE_REPOS = @("commons", "GUI", "Yorha", "ZZZ-Automaton")
$VENV_REPO = "ZZZ-Automaton"
$PYTHON_VERSION = "3.14"
$VSCODE_PROFILE = "AutomatonWorks"
$EXTENSIONS = @(
    "ms-python.python",
    "ms-python.vscode-pylance",
    "ms-python.debugpy",
    "ms-python.vscode-python-envs",
    "charliermarsh.ruff"
)
$TOOLS_RELEASE_URL = "https://api.github.com/repos/AutomatonWorks/AutomatonTools/releases/latest"
$WORKS_NAME = "AutomatonWorks"

function Assert-Command([string]$name, [string]$wingetId) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "$name was not found. Install it with: winget install --id $wingetId -e, then open a new terminal."
    }
}

function Invoke-Native([string]$exe, [string[]]$arguments) {
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$exe $($arguments -join ' ') failed with exit code $LASTEXITCODE"
    }
}

function Select-WorksFolder {
    Add-Type -AssemblyName System.Windows.Forms
    $owner = New-Object System.Windows.Forms.Form
    $owner.TopMost = $true
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = "Choose where to create the $WORKS_NAME folder"
    $dialog.ShowNewFolderButton = $true
    $result = $dialog.ShowDialog($owner)
    $owner.Dispose()
    if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
        throw "No folder chosen."
    }
    $picked = $dialog.SelectedPath
    if ((Split-Path $picked -Leaf) -eq $WORKS_NAME) {
        return $picked
    }
    return (Join-Path $picked $WORKS_NAME)
}

function Install-Uv {
    if (Get-Command uv -ErrorAction SilentlyContinue) {
        return
    }
    Assert-Command "winget" "Microsoft.AppInstaller"
    Write-Host "Installing uv"
    Invoke-Native "winget" @("install", "--id", "astral-sh.uv", "-e", "--accept-source-agreements", "--accept-package-agreements")
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
    Assert-Command "uv" "astral-sh.uv"
}

function Copy-Repos([string]$worksDir) {
    foreach ($repo in $REPOS) {
        $target = Join-Path $worksDir $repo
        if (Test-Path (Join-Path $target ".git")) {
            Write-Host "ok      $repo (already cloned)"
            continue
        }
        Write-Host "cloning $repo"
        Invoke-Native "git" @("clone", "$ORG_URL/$repo.git", $target)
    }
}

function New-Venv([string]$worksDir) {
    $venvRepoDir = Join-Path $worksDir $VENV_REPO
    $venvPython = Join-Path $venvRepoDir ".venv\Scripts\python.exe"
    Push-Location $venvRepoDir
    try {
        if (-not (Test-Path $venvPython)) {
            Invoke-Native "uv" @("venv", "--python", $PYTHON_VERSION, ".venv")
        }
        $installArgs = @("pip", "install", "--python", $venvPython, "--group", "dev")
        foreach ($repo in $EDITABLE_REPOS) {
            $installArgs += @("-e", (Join-Path $worksDir $repo))
        }
        Invoke-Native "uv" $installArgs
    }
    finally {
        Pop-Location
    }
}

# Pylance cannot follow the editable import hook (package -> flat src/), so it reads these junctions instead
function New-PylancePaths([string]$worksDir) {
    $linksDir = Join-Path $worksDir ".pylance-paths"
    New-Item -ItemType Directory -Force -Path $linksDir | Out-Null
    foreach ($repo in $REPOS) {
        $setupFile = Join-Path $worksDir "$repo\setup.py"
        if (-not (Test-Path $setupFile)) {
            continue
        }
        $match = Select-String -Path $setupFile -Pattern '^PACKAGE = "(\w+)"$'
        if ($null -eq $match) {
            continue
        }
        $package = $match.Matches[0].Groups[1].Value
        $link = Join-Path $linksDir $package
        if (Test-Path $link) {
            continue
        }
        New-Item -ItemType Junction -Path $link -Target (Join-Path $worksDir "$repo\src") | Out-Null
    }
    return $linksDir
}

function Write-Workspace([string]$worksDir, [string]$linksDir) {
    $folders = @()
    foreach ($repo in $REPOS) {
        $folders += [ordered]@{ name = $repo; path = $repo }
    }
    $settings = [ordered]@{
        "python.defaultInterpreterPath" = "`${workspaceFolder:$VENV_REPO}/.venv/Scripts/python.exe"
        "python.testing.pytestEnabled" = $true
        "python.analysis.extraPaths" = @($linksDir.Replace("\", "/"))
        "editor.foldingImportsByDefault" = $true
        "[python]" = [ordered]@{
            "editor.codeActionsOnSave" = [ordered]@{
                "source.fixAll.ruff" = "explicit"
                "source.organizeImports.ruff" = "explicit"
            }
        }
        "files.exclude" = [ordered]@{
            "**/__pycache__" = $true
            "**/.pytest_cache" = $true
            "**/.ruff_cache" = $true
            "**/.complexipy_cache" = $true
            "**/*.egg-info" = $true
        }
        "files.watcherExclude" = [ordered]@{
            "**/.venv*/**" = $true
            "**/build/**" = $true
        }
        "search.exclude" = [ordered]@{
            "**/.venv*" = $true
            "**/build" = $true
        }
    }
    $workspace = [ordered]@{ folders = $folders; settings = $settings }
    $workspaceFile = Join-Path $worksDir "$WORKS_NAME.code-workspace"
    if (Test-Path $workspaceFile) {
        Copy-Item $workspaceFile "$workspaceFile.bak" -Force
    }
    $json = $workspace | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($workspaceFile, $json, (New-Object System.Text.UTF8Encoding $false))
    return $workspaceFile
}

function Get-ToolsVsix([string]$downloadDir) {
    $release = Invoke-RestMethod -Uri $TOOLS_RELEASE_URL -Headers @{ "User-Agent" = "AutomatonWorks-setup" }
    $asset = $release.assets | Where-Object { $_.name -like "*.vsix" } | Select-Object -First 1
    if ($null -eq $asset) {
        throw "The latest AutomatonTools release ($($release.tag_name)) has no vsix."
    }
    $vsixPath = Join-Path $downloadDir $asset.name
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $vsixPath -Headers @{ "User-Agent" = "AutomatonWorks-setup" }
    return $vsixPath
}

function Install-Extensions {
    foreach ($extension in $EXTENSIONS) {
        Invoke-Native "code" @("--profile", $VSCODE_PROFILE, "--install-extension", $extension, "--force")
    }
    $downloadDir = Join-Path ([System.IO.Path]::GetTempPath()) "automatonworks-setup"
    New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null
    $vsixPath = Get-ToolsVsix $downloadDir
    Invoke-Native "code" @("--profile", $VSCODE_PROFILE, "--install-extension", $vsixPath, "--force")
}

Assert-Command "git" "Git.Git"
Assert-Command "code" "Microsoft.VisualStudioCode"
Install-Uv

$worksDir = Select-WorksFolder
New-Item -ItemType Directory -Force -Path $worksDir | Out-Null
Write-Host "Setting up $worksDir"

Copy-Repos $worksDir
New-Venv $worksDir
$linksDir = New-PylancePaths $worksDir
$workspaceFile = Write-Workspace $worksDir $linksDir
Install-Extensions

Write-Host "Done. Opening $workspaceFile"
Invoke-Native "code" @("--profile", $VSCODE_PROFILE, $workspaceFile)
