const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

function compilerScript(game) {
    return path.join(game.root, "app", "commons", "tools", "AppCompiler.ahk");
}

function entryScript(game) {
    return path.join(game.root, "app", `${game.appName}.ahk2`);
}

function venvPython(game) {
    return path.join(game.root, ".venv", "Scripts", "python.exe");
}

function missingPrerequisite(action, game) {
    if (game.kind === "python") {
        if (((action === "run") || (action === "deploy")) && !fs.existsSync(venvPython(game))) {
            return `${game.displayName}: ${venvPython(game)} not found, create the .venv first (README, Setup).`;
        }
        return null;
    }
    if (action === "run" && !fs.existsSync(entryScript(game))) {
        return `${game.displayName}: entry point ${entryScript(game)} not found.`;
    }
    if (action === "compile" && !fs.existsSync(compilerScript(game))) {
        return `${game.displayName}: app\\commons is not linked, run "Automaton: Setup Commons Link" first.`;
    }
    return null;
}

// build.py re-executes itself inside the project's .venv, so any Python can start it.
function pythonExecution(action, game) {
    const config = vscode.workspace.getConfiguration("automaton");
    if (action === "run") {
        return new vscode.ProcessExecution(venvPython(game), [path.join(game.root, "run.py")], { cwd: game.root });
    }
    if (action === "deploy") {
        return new vscode.ProcessExecution(venvPython(game), [path.join(game.root, "deploy.py")], { cwd: game.root });
    }
    return new vscode.ProcessExecution(config.get("pythonPath"), [path.join(game.root, "build.py")], { cwd: game.root });
}

function ahkExecution(action, game) {
    const config = vscode.workspace.getConfiguration("automaton");
    if (action === "run") {
        return new vscode.ProcessExecution(config.get("autohotkeyPath"), [entryScript(game)], { cwd: game.root });
    }
    if (action === "compile") {
        const autohotkey = config.get("autohotkeyPath").replace(/'/g, "''");
        const script = compilerScript(game).replace(/'/g, "''");
        const root = game.root.replace(/'/g, "''");
        const appName = game.appName.replace(/'/g, "''");
        return new vscode.ShellExecution(`& '${autohotkey}' '${script}' '${root}' '${appName}' | Out-Host`, {
            executable: "powershell.exe",
            shellArgs: ["-NoProfile", "-Command"],
            cwd: game.root,
        });
    }
    if (action === "images") {
        return new vscode.ProcessExecution(
            config.get("pythonPath"),
            [path.join(game.root, "app", "commons", "tools", "generate_images.py"), game.root],
            { cwd: game.root }
        );
    }
    return new vscode.ProcessExecution(
        "cmd.exe",
        ["/c", path.join(game.root, ".tools", "setup-commons.bat"), "nopause"],
        { cwd: game.root }
    );
}

function buildExecution(action, game) {
    return game.kind === "python" ? pythonExecution(action, game) : ahkExecution(action, game);
}

module.exports = { buildExecution, missingPrerequisite };
