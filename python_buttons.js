const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

// The old AHK-era extension sets automaton.inPythonProject in the same shared extension folders, so these keys are our own.
const OUR_KEY = "automatonWorks.blockPythonRun";
const HIDE_IN_PROJECT = `!${OUR_KEY}`;
const DEBUG_ONLY_MAIN = `(!${OUR_KEY} || automatonWorks.projectMain)`;
// Their editor title buttons have no setting to hide them per file, so their manifests get our context keys.
const PATCHES = [
    { extension: "ms-python.python", command: "python.execInTerminal-icon", condition: HIDE_IN_PROJECT },
    { extension: "ms-python.python", command: "python.execInDedicatedTerminal", condition: HIDE_IN_PROJECT },
    { extension: "ms-python.vscode-python-envs", command: "python-envs.runAsTask", condition: HIDE_IN_PROJECT },
    { extension: "ms-python.debugpy", command: "debugpy.debugInTerminal", condition: DEBUG_ONLY_MAIN },
    { extension: "ms-python.debugpy", command: "debugpy.debugUsingLaunchConfig", condition: DEBUG_ONLY_MAIN },
];

function patchEntry(entry, condition) {
    if ((entry.when !== undefined) && entry.when.includes(OUR_KEY)) {
        return false;
    }
    entry.when = (entry.when === undefined) ? condition : `(${entry.when}) && ${condition}`;
    return true;
}

function patchExtension(extensionId, patches) {
    const extension = vscode.extensions.getExtension(extensionId);
    if (extension === undefined) {
        return false;
    }
    const manifestPath = path.join(extension.extensionPath, "package.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const entries = (manifest.contributes.menus || {})["editor/title/run"] || [];
    let changed = false;
    for (const patch of patches) {
        for (const entry of entries.filter((candidate) => candidate.command === patch.command)) {
            changed = patchEntry(entry, patch.condition) || changed;
        }
    }
    if (changed) {
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4) + "\n", "utf8");
    }
    return changed;
}

function patchPythonButtons() {
    const extensionIds = [...new Set(PATCHES.map((patch) => patch.extension))];
    let changed = false;
    for (const extensionId of extensionIds) {
        changed = patchExtension(extensionId, PATCHES.filter((patch) => patch.extension === extensionId)) || changed;
    }
    return changed;
}

async function offerReload() {
    const choice = await vscode.window.showInformationMessage(
        "Automaton: the Python run and debug buttons were limited in the projects, reload the window to apply it.",
        "Reload"
    );
    if (choice === "Reload") {
        await vscode.commands.executeCommand("workbench.action.reloadWindow");
    }
}

// An update of a Python extension brings its manifest back unpatched.
function registerPythonButtons(context) {
    const refresh = () => {
        if (patchPythonButtons()) {
            offerReload();
        }
    };
    context.subscriptions.push(vscode.extensions.onDidChange(refresh));
    refresh();
}

module.exports = { registerPythonButtons };
