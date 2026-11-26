const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { carryProjectCommands } = require("./game_commands");

const LATEST_RELEASE_URL = "https://api.github.com/repos/AutomatonWorks/AutomatonTools/releases/latest";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const REQUEST_HEADERS = { "User-Agent": "automaton-vscode", Accept: "application/vnd.github+json" };

function versionParts(version) {
    return version.replace(/^v/, "").split(".").map((part) => parseInt(part, 10));
}

function isNewer(candidate, current) {
    const candidateParts = versionParts(candidate);
    const currentParts = versionParts(current);
    for (let index = 0; index < Math.max(candidateParts.length, currentParts.length); index++) {
        const difference = (candidateParts[index] || 0) - (currentParts[index] || 0);
        if (difference !== 0) {
            return difference > 0;
        }
    }
    return false;
}

async function latestRelease() {
    const response = await fetch(LATEST_RELEASE_URL, { headers: REQUEST_HEADERS });
    if (!response.ok) {
        throw new Error(`GitHub answered ${response.status}`);
    }
    const release = await response.json();
    const asset = release.assets.find((candidate) => candidate.name.endsWith(".vsix"));
    return { version: release.tag_name.replace(/^v/, ""), asset };
}

async function download(asset) {
    const response = await fetch(asset.browser_download_url, { headers: { "User-Agent": REQUEST_HEADERS["User-Agent"] } });
    if (!response.ok) {
        throw new Error(`download answered ${response.status}`);
    }
    const target = path.join(os.tmpdir(), asset.name);
    fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
    return target;
}

function installedManifest(context, version) {
    const extensionId = context.extension.id;
    return path.join(path.dirname(context.extensionPath), `${extensionId}-${version}`, "package.json");
}

async function offerReload(version) {
    const choice = await vscode.window.showInformationMessage(
        `Automaton tools ${version} is installed, reload the window to use it.`,
        "Reload"
    );
    if (choice === "Reload") {
        await vscode.commands.executeCommand("workbench.action.reloadWindow");
    }
}

async function checkForUpdate(context, log) {
    const current = context.extension.packageJSON.version;
    const release = await latestRelease();
    if (!isNewer(release.version, current) || (release.asset === undefined)) {
        return false;
    }
    log.appendLine(`Automaton tools ${release.version} found (installed ${current}), updating`);
    const vsix = await download(release.asset);
    await vscode.commands.executeCommand("workbench.extensions.installExtension", vscode.Uri.file(vsix));
    const manifestPath = installedManifest(context, release.version);
    if (fs.existsSync(manifestPath)) {
        carryProjectCommands(manifestPath);
    }
    offerReload(release.version);
    return true;
}

// Checks the project's latest GitHub release at start and every few hours, installs it when newer and offers a reload.
function registerSelfUpdate(context) {
    const log = vscode.window.createOutputChannel("Automaton Update");
    context.subscriptions.push(log);
    let timer = null;
    const check = async () => {
        try {
            if (await checkForUpdate(context, log)) {
                clearInterval(timer);
            }
        } catch (error) {
            log.appendLine(`Update check failed: ${error.message}`);
        }
    };
    timer = setInterval(check, CHECK_INTERVAL_MS);
    context.subscriptions.push({ dispose: () => clearInterval(timer) });
    check();
}

module.exports = { registerSelfUpdate };
