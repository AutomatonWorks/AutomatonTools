const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { OWN_ACTIONS, findGames } = require("./projects");

function perGameCommand(actionDefs) {
    const ids = actionDefs.map((action) => action.id).join("|");
    return new RegExp(`^automaton\\.(${ids})\\.(?!all$|pick$)[^.]+$`);
}

function commandSpecs(actionDefs) {
    const titles = new Map(actionDefs.map((action) => [action.id, action.title]));
    const specs = [];
    for (const game of findGames(actionDefs)) {
        const name = game.shortName;
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        for (const action of game.actions) {
            specs.push({ command: `automaton.${action}.${slug}`, title: `${titles.get(action)} ${name}`, action, folder: game.label });
        }
    }
    return specs;
}

// Palette entries only exist in package.json, so the installed manifest is rewritten and the window needs a reload.
function writeProjectCommands(manifestPath, specs, actionDefs) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const pattern = perGameCommand(actionDefs);
    const fixedCommands = manifest.contributes.commands.filter((entry) => !pattern.test(entry.command));
    const gameCommands = specs.map((spec) => ({ command: spec.command, title: spec.title, category: "Automaton" }));
    const commands = [...fixedCommands, ...gameCommands];
    if (JSON.stringify(commands) === JSON.stringify(manifest.contributes.commands)) {
        return false;
    }
    manifest.contributes.commands = commands;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4) + "\n", "utf8");
    return true;
}

async function offerReload() {
    const choice = await vscode.window.showInformationMessage(
        "Automaton: the per-project commands changed, reload the window to see them in the palette.",
        "Reload"
    );
    if (choice === "Reload") {
        await vscode.commands.executeCommand("workbench.action.reloadWindow");
    }
}

function registerGameCommands(context, runActionOnFolder) {
    const registered = new Map();

    const refresh = () => {
        const specs = commandSpecs(OWN_ACTIONS);
        const wanted = new Set(specs.map((spec) => spec.command));
        for (const [command, disposable] of registered) {
            if (!wanted.has(command)) {
                disposable.dispose();
                registered.delete(command);
            }
        }
        for (const spec of specs) {
            if (!registered.has(spec.command)) {
                registered.set(spec.command, vscode.commands.registerCommand(spec.command, () => runActionOnFolder(spec.action, spec.folder)));
            }
        }
        if (writeProjectCommands(path.join(context.extensionPath, "package.json"), specs, OWN_ACTIONS)) {
            offerReload();
        }
    };

    context.subscriptions.push({ dispose: () => registered.forEach((disposable) => disposable.dispose()) });
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(refresh));
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("automaton.projects") || event.affectsConfiguration("automaton.notRunnable")) {
                refresh();
            }
        })
    );
    refresh();
}

// An update installs a manifest without the per-project commands; writing them with its actions saves a second reload.
function carryProjectCommands(manifestPath) {
    const newActions = JSON.parse(fs.readFileSync(manifestPath, "utf8")).automatonActions;
    writeProjectCommands(manifestPath, commandSpecs(newActions), newActions);
}

module.exports = { registerGameCommands, carryProjectCommands };
