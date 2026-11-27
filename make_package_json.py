import json
from pathlib import Path

DEFAULT_PROJECTS = ["GI-Automaton", "HSR-Automaton", "ZZZ-Automaton", "AutomatonManager"]
DEFAULT_ALL = ["GI-Automaton", "ZZZ-Automaton"]
DEFAULT_NOT_RUNNABLE = ["GUI", "commons", "internal-tools"]
DEFAULT_PULL = DEFAULT_PROJECTS + ["GUI", "commons", "internal-tools", "AutomatonTools"]

ACTIONS = [
    ("run", "Run", False, "$(play)"),
    ("compile", "Compile", True, "$(gear)"),
    ("deploy", "Deploy", False, None),
    ("compiledeploy", "Compile and Deploy", False, None),
    ("release", "Release", False, None),
]

CATEGORY = "Automaton"

BUTTON_TITLES = {
    "run": "Run automaton",
    "compile": "Compile automaton",
}

commands = []
for action_id, action_title, has_all, icon in ACTIONS:
    active_command = {
        "command": f"automaton.{action_id}",
        "title": f"{action_title} (current file's game)",
        "category": CATEGORY,
    }
    if action_id in BUTTON_TITLES:
        active_command["title"] = BUTTON_TITLES[action_id]
        del active_command["category"]
    if icon:
        active_command["icon"] = icon
    commands.append(active_command)
    commands.append({
        "command": f"automaton.{action_id}.pick",
        "title": f"{action_title}...",
        "category": CATEGORY,
    })
    if has_all:
        commands.append({
            "command": f"automaton.{action_id}.all",
            "title": f"{action_title} All",
            "category": CATEGORY,
        })

commands.append({
    "command": "automaton.configureAll",
    "title": "Choose projects for All",
    "category": CATEGORY,
})
commands.append({
    "command": "automaton.openSettings",
    "title": "Settings",
    "category": CATEGORY,
})
commands.append({
    "command": "automaton.pull.all",
    "title": "Fetch and Pull All",
    "category": CATEGORY,
})
commands.append({
    "command": "automaton.configurePull",
    "title": "Choose repos for Fetch and Pull",
    "category": CATEGORY,
})
commands.append({
    "command": "automaton.stop",
    "title": "Stop running games",
    "category": CATEGORY,
})

BUTTON_WHEN = "automaton.inPythonProject"
EDITOR_BUTTONS = [
    {"command": "automaton.run", "when": BUTTON_WHEN, "group": "navigation@-20"},
    {"command": "automaton.compile", "when": BUTTON_WHEN, "group": "navigation@-19"},
]

package = {
    "name": "automaton-vscode",
    "displayName": "Automaton tools",
    "description": "Run, compile, deploy, release and pull for the AutomatonWorks Python repos and the manager",
    "version": "0.12.0",
    "publisher": "automatonworks",
    "engines": {"vscode": "^1.85.0"},
    "icon": "icon.png",
    "main": "./extension.js",
    "activationEvents": ["workspaceContains:**/run.py"],
    "contributes": {
        "commands": commands,
        "menus": {"editor/title": EDITOR_BUTTONS},
        "configuration": {
            "title": "Automaton tools",
            "properties": {
                "automaton.projects": {
                    "type": "array",
                    "items": {"type": "string"},
                    "default": DEFAULT_PROJECTS,
                    "order": 0,
                    "description": "Workspace folders that are Automaton projects (folder name)."
                },
                "automaton.allProjects": {
                    "type": "array",
                    "items": {"type": "string"},
                    "default": DEFAULT_ALL,
                    "order": 1,
                    "description": "Projects included in the All commands (folder name)."
                },
                "automaton.notRunnable": {
                    "type": "array",
                    "items": {"type": "string"},
                    "default": DEFAULT_NOT_RUNNABLE,
                    "order": 2,
                    "description": "Workspace folders whose scripts are never run or compiled (folder name)."
                },
                "automaton.pullProjects": {
                    "type": "array",
                    "items": {"type": "string"},
                    "default": DEFAULT_PULL,
                    "order": 3,
                    "description": "Git repos included in Fetch and Pull All and in the periodic fetch (workspace folder name)."
                },
                "automaton.autoFetch": {
                    "type": "boolean",
                    "default": True,
                    "order": 4,
                    "description": "Fetch the Fetch and Pull repos periodically and offer to pull when one has new commits."
                },
                "automaton.autoFetchSeconds": {
                    "type": "number",
                    "default": 60,
                    "minimum": 10,
                    "order": 5,
                    "description": "Seconds between periodic fetches."
                },
                "automaton.pythonPath": {
                    "type": "string",
                    "default": "python",
                    "description": "Python executable that starts build.py (it re-runs itself inside the project .venv)"
                }
            }
        }
    }
}

target = Path(__file__).with_name("package.json")
target.write_text(json.dumps(package, indent=4) + "\n", encoding="utf-8")
