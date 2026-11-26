const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

function venvPython(game) {
    return path.join(game.root, ".venv", "Scripts", "python.exe");
}

function missingPrerequisite(action, game) {
    if (((action === "run") || (action === "deploy")) && !fs.existsSync(venvPython(game))) {
        return `${game.displayName}: ${venvPython(game)} not found, create the .venv first (python -m uv sync).`;
    }
    return null;
}

// build.py re-executes itself inside the project's .venv, so any Python can start it.
function buildExecution(action, game) {
    if (action === "run") {
        return new vscode.ProcessExecution(venvPython(game), [path.join(game.root, "run.py")], { cwd: game.root });
    }
    if (action === "deploy") {
        return new vscode.ProcessExecution(venvPython(game), [path.join(game.root, "deploy.py")], { cwd: game.root });
    }
    const pythonPath = vscode.workspace.getConfiguration("automaton").get("pythonPath");
    return new vscode.ProcessExecution(pythonPath, [path.join(game.root, "build.py")], { cwd: game.root });
}

module.exports = { buildExecution, missingPrerequisite };
