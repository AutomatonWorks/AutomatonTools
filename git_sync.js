const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { settingsTarget, detectProject } = require("./projects");

const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0" };

let output = null;

function log(line) {
    if (output === null) {
        output = vscode.window.createOutputChannel("Automaton Git");
    }
    output.appendLine(`[${new Date().toLocaleTimeString("en-GB")}] ${line}`);
}

function git(root, args) {
    return new Promise((resolve, reject) => {
        execFile("git", args, { cwd: root, env: GIT_ENV, windowsHide: true }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error((stderr || error.message).trim()));
                return;
            }
            resolve(stdout.trim());
        });
    });
}

function repoOf(folder) {
    const root = folder.uri.fsPath;
    const project = detectProject(root);
    const label = path.basename(root);
    return { root, label, name: (project === null) ? label : project.displayName };
}

function gitFolders() {
    return (vscode.workspace.workspaceFolders || [])
        .map(repoOf)
        .filter((repo) => fs.existsSync(path.join(repo.root, ".git")));
}

function pullRepos() {
    const wanted = (vscode.workspace.getConfiguration("automaton").get("pullProjects") || []).map((folder) => folder.toLowerCase());
    return gitFolders().filter((repo) => wanted.includes(repo.label.toLowerCase()));
}

async function fetchState(repo) {
    try {
        await git(repo.root, ["fetch", "--quiet"]);
        const behind = Number(await git(repo.root, ["rev-list", "--count", "HEAD..@{u}"]));
        const upstream = await git(repo.root, ["rev-parse", "@{u}"]);
        return { repo, behind, upstream, error: null };
    } catch (error) {
        log(`${repo.name}: fetch failed: ${error.message}`);
        return { repo, behind: 0, upstream: null, error };
    }
}

async function pullRepo(repo) {
    try {
        log(`${repo.name}: ${await git(repo.root, ["pull", "--ff-only"])}`);
        return null;
    } catch (error) {
        log(`${repo.name}: pull failed: ${error.message}`);
        return error;
    }
}

function describeBehind(states) {
    return states.map((state) => `${state.repo.name} (${state.behind})`).join(", ");
}

async function pullBehind(states) {
    const results = await Promise.all(states.map(async (state) => ({ state, error: await pullRepo(state.repo) })));
    const pulled = results.filter((result) => result.error === null).map((result) => result.state);
    const failed = results.filter((result) => result.error !== null).map((result) => result.state.repo.name);
    if (pulled.length > 0) {
        vscode.window.showInformationMessage(`Automaton: pulled ${describeBehind(pulled)}.`);
    }
    if (failed.length > 0) {
        reportFailures("pull", failed);
    }
}

async function reportFailures(verb, labels) {
    const choice = await vscode.window.showErrorMessage(`Automaton: ${verb} failed for ${labels.join(", ")}.`, "Show log");
    if (choice === "Show log") {
        output.show(true);
    }
}

async function fetchAndPullAll() {
    const repos = pullRepos();
    if (repos.length === 0) {
        vscode.window.showErrorMessage("No repo is included in Fetch and Pull, use \"Automaton: Choose repos for Fetch and Pull\".");
        return;
    }
    const states = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Automaton: fetching..." },
        () => Promise.all(repos.map(fetchState))
    );
    const failed = states.filter((state) => state.error !== null).map((state) => state.repo.name);
    if (failed.length > 0) {
        reportFailures("fetch", failed);
    }
    const behind = states.filter((state) => state.behind > 0);
    if (behind.length === 0) {
        if (failed.length === 0) {
            vscode.window.showInformationMessage("Automaton: every repo is up to date.");
        }
        return;
    }
    await pullBehind(behind);
}

async function configurePull() {
    const repos = gitFolders();
    if (repos.length === 0) {
        vscode.window.showErrorMessage("No git repo among the workspace folders.");
        return;
    }
    const config = vscode.workspace.getConfiguration("automaton");
    const current = (config.get("pullProjects") || []).map((folder) => folder.toLowerCase());
    const items = repos.map((repo) => ({ label: repo.label, description: (repo.name === repo.label) ? "" : repo.name, picked: current.includes(repo.label.toLowerCase()) }));
    const chosen = await vscode.window.showQuickPick(items, { canPickMany: true, placeHolder: "Repos included in Fetch and Pull" });
    if (chosen === undefined) {
        return;
    }
    await config.update("pullProjects", chosen.map((item) => item.label), settingsTarget("pullProjects"));
}

// Warns once per upstream commit, so a dismissed update stays quiet until something new lands.
function createAutoFetcher() {
    const notified = new Map();
    let busy = false;

    return async () => {
        if (busy) {
            return;
        }
        busy = true;
        try {
            const states = await Promise.all(pullRepos().map(fetchState));
            const behind = states.filter((state) => state.behind > 0);
            const fresh = behind.filter((state) => notified.get(state.repo.root) !== state.upstream);
            if (fresh.length === 0) {
                return;
            }
            for (const state of behind) {
                notified.set(state.repo.root, state.upstream);
            }
            const choice = await vscode.window.showInformationMessage(`Automaton: updates for ${describeBehind(behind)}.`, "Pull");
            if (choice === "Pull") {
                await pullBehind(behind);
            }
        } finally {
            busy = false;
        }
    };
}

function registerGitSync(context) {
    context.subscriptions.push(vscode.commands.registerCommand("automaton.pull.all", fetchAndPullAll));
    context.subscriptions.push(vscode.commands.registerCommand("automaton.configurePull", configurePull));

    const autoFetch = createAutoFetcher();
    let timer = null;
    const restartTimer = () => {
        clearInterval(timer);
        timer = null;
        const config = vscode.workspace.getConfiguration("automaton");
        if (config.get("autoFetch")) {
            timer = setInterval(autoFetch, config.get("autoFetchSeconds") * 1000);
        }
    };
    context.subscriptions.push({ dispose: () => clearInterval(timer) });
    context.subscriptions.push({ dispose: () => output && output.dispose() });
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("automaton.autoFetch") || event.affectsConfiguration("automaton.autoFetchSeconds")) {
                restartTimer();
            }
        })
    );
    restartTimer();
}

module.exports = { registerGitSync };
