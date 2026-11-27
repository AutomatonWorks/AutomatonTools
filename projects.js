const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

// The installed manifest's action rules; an update passes the new manifest's ones instead.
const OWN_ACTIONS = require("./package.json").automatonActions;

function readBuildAppName(root) {
    const match = /^APP_NAME\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(root, "build.py"), "utf8"));
    return match ? match[1] : path.basename(root);
}

function stripAutomaton(name) {
    return name.replace(/^Automaton\s*|-?\s*Automaton$/i, "") || name;
}

// A project (a game or the manager) carries run.py and build.py at the root.
function detectProject(root) {
    if (!fs.existsSync(path.join(root, "run.py")) || !fs.existsSync(path.join(root, "build.py"))) {
        return null;
    }
    const buildName = readBuildAppName(root);
    const displayName = buildName.replace(/([a-z])([A-Z])/g, "$1 $2");
    return { appName: buildName, displayName, shortName: stripAutomaton(displayName) };
}

function folderList(setting) {
    const folders = vscode.workspace.getConfiguration("automaton").get(setting) || [];
    return folders.map((folder) => folder.toLowerCase());
}

function availableActions(root, runnable, actionDefs) {
    return actionDefs
        .filter((action) => runnable || !action.runnableOnly)
        .filter((action) => (action.requires === null) || fs.existsSync(path.join(root, action.requires)))
        .map((action) => action.id);
}

function findGames(actionDefs = OWN_ACTIONS) {
    const projects = folderList("projects");
    const inAll = folderList("allProjects");
    const notRunnable = folderList("notRunnable");
    const games = [];
    for (const folder of vscode.workspace.workspaceFolders || []) {
        const root = folder.uri.fsPath;
        const label = path.basename(root);
        const key = label.toLowerCase();
        if (!projects.includes(key)) {
            continue;
        }
        const detected = detectProject(root);
        if (detected === null) {
            continue;
        }
        const runnable = !notRunnable.includes(key);
        const actions = availableActions(root, runnable, actionDefs);
        games.push({ folder, root, label, ...detected, inAll: inAll.includes(key), runnable, actions });
    }
    return games;
}

function settingsTarget(setting) {
    const inspected = vscode.workspace.getConfiguration("automaton").inspect(setting);
    if (inspected.workspaceValue !== undefined) {
        return vscode.ConfigurationTarget.Workspace;
    }
    return vscode.ConfigurationTarget.Global;
}

async function configureAll() {
    const config = vscode.workspace.getConfiguration("automaton");
    const projects = config.get("projects") || [];
    if (projects.length === 0) {
        vscode.window.showErrorMessage("Automaton: Projects is empty, add projects in the settings first.");
        return;
    }
    const inAll = folderList("allProjects");
    const items = projects.map((folder) => ({ label: folder, picked: inAll.includes(folder.toLowerCase()) }));
    const chosen = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: "Projects included in the All commands",
    });
    if (chosen === undefined) {
        return;
    }
    await config.update("allProjects", chosen.map((item) => item.label), settingsTarget("allProjects"));
}

function openSettings() {
    return vscode.commands.executeCommand("workbench.action.openSettings", "@ext:automatonworks.automaton-vscode");
}

module.exports = { OWN_ACTIONS, findGames, configureAll, openSettings, settingsTarget, detectProject };
