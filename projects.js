const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

const KIND_ACTIONS = {
    ahk: ["run", "compile", "images", "link"],
    python: ["run", "compile", "deploy", "compiledeploy"],
};
const RUNNABLE_ONLY_ACTIONS = ["run", "compile", "compiledeploy"];
const DEPLOY_ACTIONS = ["deploy", "compiledeploy"];

function readAppName(root) {
    const constantsFile = path.join(root, "app", "Constants.ahk2");
    if (!fs.existsSync(constantsFile)) {
        return null;
    }
    const match = /static\s+name\s*:=\s*"([^"]+)"/.exec(fs.readFileSync(constantsFile, "utf8"));
    return match ? match[1] : null;
}

function readBuildAppName(root) {
    const match = /^APP_NAME\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(root, "build.py"), "utf8"));
    return match ? match[1] : path.basename(root);
}

function stripAutomaton(name) {
    return name.replace(/^Automaton\s*|-?\s*Automaton$/i, "") || name;
}

// AHK games carry app\Constants.ahk2; Python apps (the manager) carry run.py and build.py at the root.
function detectProject(root) {
    const label = path.basename(root);
    const appName = readAppName(root);
    if (appName !== null) {
        return { kind: "ahk", appName, displayName: label, shortName: stripAutomaton(label) };
    }
    if (fs.existsSync(path.join(root, "run.py")) && fs.existsSync(path.join(root, "build.py"))) {
        const buildName = readBuildAppName(root);
        const displayName = buildName.replace(/([a-z])([A-Z])/g, "$1 $2");
        return { kind: "python", appName: buildName, displayName, shortName: stripAutomaton(displayName) };
    }
    return null;
}

function folderList(setting) {
    const folders = vscode.workspace.getConfiguration("automaton").get(setting) || [];
    return folders.map((folder) => folder.toLowerCase());
}

function findGames() {
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
        const deployable = fs.existsSync(path.join(root, "deploy.py"));
        const actions = KIND_ACTIONS[detected.kind]
            .filter((action) => runnable || !RUNNABLE_ONLY_ACTIONS.includes(action))
            .filter((action) => deployable || !DEPLOY_ACTIONS.includes(action));
        games.push({ folder, root, label, ...detected, inAll: inAll.includes(key), runnable, actions });
    }
    return games;
}

function isInNotRunnableFolder(uri) {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) {
        return false;
    }
    return folderList("notRunnable").includes(path.basename(folder.uri.fsPath).toLowerCase());
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

module.exports = { findGames, isInNotRunnableFolder, configureAll, openSettings, settingsTarget, detectProject };
