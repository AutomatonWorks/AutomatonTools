const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { findGames } = require("./projects");

const ACTION_TITLES = {
    run: "Run",
    compile: "Compile",
    deploy: "Deploy",
    compiledeploy: "Compile and Deploy",
};
const PER_GAME_COMMAND = /^automaton\.(run|compile|deploy|compiledeploy)\.(?!all$|pick$)[^.]+$/;

function commandSpecs() {
    const specs = [];
    for (const game of findGames()) {
        const name = game.shortName;
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        for (const action of game.actions) {
            specs.push({ command: `automaton.${action}.${slug}`, title: `${ACTION_TITLES[action]} ${name}`, action, folder: game.label });
        }
    }
    return specs;
}

// Palette entries only exist in package.json, so the installed manifest is rewritten and the window needs a reload.
function syncManifest(context, specs) {
    const manifestPath = path.join(context.extensionPath, "package.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const fixedCommands = manifest.contributes.commands.filter((entry) => !PER_GAME_COMMAND.test(entry.command));
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
        const specs = commandSpecs();
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
        if (syncManifest(context, specs)) {
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

module.exports = { registerGameCommands };
