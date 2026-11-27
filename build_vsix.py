import json
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).parent
PROFILE = "AutomatonWorks"
BUILDS = ROOT / "builds"
EXTENSIONS_DIR = Path.home() / ".vscode" / "extensions"

CONTENT_TYPES = """<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/Content_Types">
<Default Extension="json" ContentType="application/json"/>
<Default Extension="js" ContentType="application/javascript"/>
<Default Extension="md" ContentType="text/markdown"/>
<Default Extension="png" ContentType="image/png"/>
<Default Extension="vsixmanifest" ContentType="text/xml"/>
</Types>
"""

MANIFEST = """<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
<Metadata>
<Identity Language="en-US" Id="{name}" Version="{version}" Publisher="{publisher}"/>
<DisplayName>{display}</DisplayName>
<Description xml:space="preserve">{description}</Description>
</Metadata>
<Installation>
<InstallationTarget Id="Microsoft.VisualStudio.Code" Version="{engine}"/>
</Installation>
<Assets>
<Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
<Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/icon.png" Addressable="true"/>
</Assets>
</PackageManifest>
"""


def installed_manifests_newest_first(package):
    prefix = f"{package['publisher']}.{package['name']}-"
    installs = [folder for folder in EXTENSIONS_DIR.glob(f"{prefix}*") if (folder / "package.json").is_file()]
    installs.sort(key=lambda folder: tuple(int(part) for part in folder.name[len(prefix):].split(".")), reverse=True)
    return [json.loads((folder / "package.json").read_text(encoding="utf-8")) for folder in installs]


def is_project_command(command_id, actions):
    parts = command_id.split(".")
    return (len(parts) == 3) and (parts[0] == "automaton") and (parts[1] in actions) and (parts[2] not in ("all", "pick"))


# The extension writes the per-project commands into its installed package.json; carry them over so a reinstall
# does not need a second reload to bring them back. A version installed but never loaded has none yet, so look further back.
def with_project_commands(package):
    commands = package["contributes"]["commands"]
    actions = {entry["command"].split(".")[1] for entry in commands if entry["command"].endswith(".pick")}
    known = {entry["command"] for entry in commands}
    carried = []
    for installed in installed_manifests_newest_first(package):
        carried = [
            entry for entry in installed["contributes"]["commands"]
            if is_project_command(entry["command"], actions) and (entry["command"] not in known)
        ]
        if carried:
            break
    seeded = json.loads(json.dumps(package))
    seeded["contributes"]["commands"] = commands + carried
    return seeded


def build(seed_installed):
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    if seed_installed:
        package = with_project_commands(package)
    BUILDS.mkdir(exist_ok=True)
    vsix = BUILDS / f"{package['name']}-{package['version']}.vsix"
    manifest = MANIFEST.format(
        name=package["name"],
        version=package["version"],
        publisher=package["publisher"],
        display=package["displayName"],
        description=package["description"],
        engine=package["engines"]["vscode"],
    )
    with zipfile.ZipFile(vsix, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", CONTENT_TYPES)
        archive.writestr("extension.vsixmanifest", manifest)
        archive.writestr("extension/package.json", json.dumps(package, indent=4) + "\n")
        archive.write(ROOT / "extension.js", "extension/extension.js")
        archive.write(ROOT / "projects.js", "extension/projects.js")
        archive.write(ROOT / "game_commands.js", "extension/game_commands.js")
        archive.write(ROOT / "git_sync.js", "extension/git_sync.js")
        archive.write(ROOT / "executions.js", "extension/executions.js")
        archive.write(ROOT / "process_kill.js", "extension/process_kill.js")
        archive.write(ROOT / "python_buttons.js", "extension/python_buttons.js")
        archive.write(ROOT / "self_update.js", "extension/self_update.js")
        archive.write(ROOT / "release.js", "extension/release.js")
        archive.write(ROOT / "icon.png", "extension/icon.png")
    return vsix


def install(vsix):
    subprocess.run(
        ["code", "--profile", PROFILE, "--install-extension", str(vsix), "--force"],
        check=True,
        shell=True,
    )


if __name__ == "__main__":
    wants_install = "--install" in sys.argv
    built = build(wants_install)
    print(built)
    if wants_install:
        install(built)
