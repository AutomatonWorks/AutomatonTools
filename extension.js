const vscode = require("vscode");
const path = require("path");
const { findGames, isInNotRunnableFolder, configureAll, openSettings } = require("./projects");
const { buildExecution, missingPrerequisite } = require("./executions");
const { registerGameCommands } = require("./game_commands");
const { registerGitSync } = require("./git_sync");
const { killReplacedProcess } = require("./process_kill");

const ACTION_IDS = ["run", "compile", "images", "link", "deploy", "compiledeploy"];
const NO_ALL_ACTIONS = ["run", "deploy", "compiledeploy"];

function isInside(root, file) {
    const relative = path.relative(root, file);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function gameOfActiveFile(games) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== "file") {
        return null;
    }
    return games.find((game) => isInside(game.root, editor.document.uri.fsPath)) || null;
}

function allowsAction(game, action) {
    return game.actions.includes(action);
}

async function pickGame(games, placeHolder) {
    const items = games.map((game) => ({ label: game.displayName, description: game.appName, game }));
    const chosen = await vscode.window.showQuickPick(items, { placeHolder });
    return chosen ? chosen.game : null;
}

const ACTION_TITLES = {
    run: "Run",
    compile: "Compile",
    images: "Generate Images",
    link: "Setup Commons Link",
    deploy: "Deploy",
    compiledeploy: "Compile and Deploy",
};

function waitForExitCode(execution) {
    return new Promise((resolve) => {
        const subscription = vscode.tasks.onDidEndTaskProcess((event) => {
            if (event.execution === execution) {
                subscription.dispose();
                resolve(event.exitCode);
            }
        });
    });
}

function waitForEnd(execution) {
    return new Promise((resolve) => {
        const subscription = vscode.tasks.onDidEndTask((event) => {
            if (event.execution === execution) {
                subscription.dispose();
                resolve();
            }
        });
    });
}

// A second execution of a running task makes VS Code ask which instance to terminate; restart it ourselves instead.
async function stopPreviousRuns(action, game) {
    const previous = vscode.tasks.taskExecutions.filter((execution) => {
        const definition = execution.task.definition;
        return (definition.type === "automaton") && (definition.action === action) && (definition.game === game.label);
    });
    const ended = previous.map((execution) => waitForEnd(execution));
    for (const execution of previous) {
        execution.terminate();
    }
    await Promise.all(ended);
}

// Returns the task's exit code, or null when it did not start.
async function runAction(action, game) {
    if (!allowsAction(game, action)) {
        const reason = game.runnable ? "does not support it" : "is in Automaton: Not Runnable";
        vscode.window.showErrorMessage(`${game.displayName} ${reason}, ${ACTION_TITLES[action]} is disabled for it.`);
        return null;
    }
    if (action === "compiledeploy") {
        const compileExit = await runAction("compile", game);
        if (compileExit !== 0) {
            return compileExit;
        }
        return runAction("deploy", game);
    }
    const missing = missingPrerequisite(action, game);
    if (missing !== null) {
        vscode.window.showErrorMessage(missing);
        return null;
    }
    await killReplacedProcess(action, game);
    await stopPreviousRuns(action, game);
    const task = new vscode.Task(
        // A unique runId: a task VS Code still thinks is running (reconnected after a reload, or just killed) must not
        // make it ask which instance to terminate.
        { type: "automaton", action, game: game.label, runId: Date.now() },
        game.folder,
        `${ACTION_TITLES[action]} ${game.displayName}`,
        "automaton",
        buildExecution(action, game)
    );
    task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Shared, clear: true };
    const execution = await vscode.tasks.executeTask(task);
    return waitForExitCode(execution);
}

const NO_GAMES_MESSAGE = "No Automaton project in this workspace (see Automaton: Projects; each needs app\\Constants.ahk2 with static name, or run.py and build.py).";

async function runActionOnAll(action) {
    const games = findGames().filter((game) => game.inAll && allowsAction(game, action));
    if (games.length === 0) {
        vscode.window.showErrorMessage("No project is included in All, use \"Automaton: Choose projects for All\".");
        return;
    }
    for (const game of games) {
        await runAction(action, game);
    }
}

async function runActionOnFolder(action, folder) {
    const game = findGames().find((candidate) => candidate.label.toLowerCase() === folder.toLowerCase());
    if (game === undefined) {
        vscode.window.showErrorMessage(`${folder} is not open in this workspace or is not an Automaton project.`);
        return;
    }
    await runAction(action, game);
}

async function resolveGame(action, how) {
    const games = findGames().filter((game) => allowsAction(game, action));
    if (games.length === 0) {
        vscode.window.showErrorMessage(NO_GAMES_MESSAGE);
        return null;
    }
    if (how === "active") {
        return gameOfActiveFile(games) || pickGame(games, "The active file belongs to no project, pick one");
    }
    return pickGame(games, "Pick a project");
}

function registerActionCommands(context) {
    for (const action of ACTION_IDS) {
        if (!NO_ALL_ACTIONS.includes(action)) {
            context.subscriptions.push(
                vscode.commands.registerCommand(`automaton.${action}.all`, () => runActionOnAll(action))
            );
        }
        for (const target of ["active", "pick"]) {
            const commandId = target === "active" ? `automaton.${action}` : `automaton.${action}.${target}`;
            context.subscriptions.push(
                vscode.commands.registerCommand(commandId, async () => {
                    const game = await resolveGame(action, target);
                    if (game !== null) {
                        await runAction(action, game);
                    }
                })
            );
        }
    }
}

function registerStatusItem(context) {
    const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    statusItem.command = "automaton.compile";
    context.subscriptions.push(statusItem);

    const refreshStatus = () => {
        const game = gameOfActiveFile(findGames().filter((candidate) => candidate.runnable));
        vscode.commands.executeCommand("setContext", "automaton.inGame", (game !== null) && (game.kind === "ahk"));
        vscode.commands.executeCommand("setContext", "automaton.inPythonProject", (game !== null) && (game.kind === "python"));
        const editor = vscode.window.activeTextEditor;
        const notRunnable = (editor !== undefined) && isInNotRunnableFolder(editor.document.uri);
        vscode.commands.executeCommand("setContext", "automaton.notRunnable", notRunnable);
        if (game === null) {
            statusItem.hide();
            return;
        }
        statusItem.text = `$(tools) Compile ${game.displayName}`;
        statusItem.tooltip = `Compile ${game.displayName} (${game.appName})`;
        statusItem.show();
    };
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(refreshStatus));
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(refreshStatus));
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("automaton.projects") || event.affectsConfiguration("automaton.notRunnable")) {
                refreshStatus();
            }
        })
    );
    refreshStatus();
}

function activate(context) {
    registerActionCommands(context);
    registerGameCommands(context, runActionOnFolder);
    registerGitSync(context);
    context.subscriptions.push(vscode.commands.registerCommand("automaton.configureAll", configureAll));
    context.subscriptions.push(vscode.commands.registerCommand("automaton.openSettings", openSettings));
    context.subscriptions.push(
        vscode.commands.registerCommand("automaton.stop", () => {
            for (const execution of vscode.tasks.taskExecutions) {
                if (execution.task.definition.type === "automaton" && execution.task.definition.action === "run") {
                    execution.terminate();
                }
            }
        })
    );
    registerStatusItem(context);
}

function deactivate() {}

module.exports = { activate, deactivate };
