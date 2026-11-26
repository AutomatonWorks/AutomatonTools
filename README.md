# AutomatonTools

VS Code extension for the AutomatonWorks game repos (GI-Automaton, HSR-Automaton, ZZZ-Automaton) and the Automaton Manager (folder AutomatonManager), next to GUI, commons and internal-tools.

Commands (Command Palette, prefix `Automaton:`), for Run, Compile, Generate Images and Setup Commons Link (Run has no `All`):

- `<Action> (current file's game)`: runs on the game that owns the active file, or asks if there is none.
- `<Action>...`: quick pick of the games found in the workspace.
- `<Action> All`: the projects in `automaton.allProjects`, one after another (builds share a temp file, so never in parallel).
- `Choose projects for All`: multi-select of the project list, saves `automaton.allProjects`.
- `<Action> <Project>`: one entry per project in `automaton.projects` (no Run/Compile for `automaton.notRunnable`). Palette entries can only come from package.json, so the extension rewrites its installed package.json when the lists change and offers a window reload.
- `Settings`: opens the extension settings.
- `Fetch and Pull All`: fetches every repo in `automaton.pullProjects` and pulls (`--ff-only`) the ones behind. Failures go to the `Automaton Git` output channel.
- `Choose repos for Fetch and Pull`: multi-select of the workspace folders that are git repos, saves `automaton.pullProjects`.

With `automaton.autoFetch` on, those repos are fetched every `automaton.autoFetchSeconds` seconds and a notification offers to pull when one has new commits. A dismissed update is not announced again until more commits land upstream.

Compile goes through `powershell -Command "& ahk script | Out-Host"` on purpose: AutoHotkey is a GUI exe and `FileAppend '*'` raises "invalid handle" unless stdout is a pipe.

`Run` starts the entry point `app\<App>.ahk2` of the game, not the open file. Running it again restarts it without asking. `Stop running games` terminates those runs.

When an `.ahk2` file of a game is active, two editor title buttons appear first on the left: "Run automaton" (play) and "Compile automaton" (gear). The extension sets the context key `automaton.inGame` for that. The AutoHotkey v2 LSP fork hides its own play button in the editor title when that key is set, so only one play remains.

A status bar item compiles the game of the active file.

A workspace folder counts as a project when its name is in `automaton.projects` and it is one of:

- AutoHotkey game: `app\Constants.ahk2` with `static name := "..."`. Compile runs `app\commons\tools\AppCompiler.ahk <repo root> <app name>` and asks for Setup Commons Link first when that file is missing.
- Python game or the Automaton Manager: `run.py` and `build.py` at the root. Its name comes from `APP_NAME` in build.py (`ZZZ-Automaton` in messages, `ZZZ` in the per-project commands: `Run ZZZ`, `Compile ZZZ`; the manager is "Automaton Manager" and `Run Manager`). Run is `.venv\Scripts\python.exe run.py` (the .venv must exist). Compile is `<automaton.pythonPath> build.py`, which re-executes inside the .venv and writes `.compiled\<APP_NAME>.exe`. Deploy and Compile and Deploy appear only when the repo has a `deploy.py`. The editor title buttons show on any file of the project.

## Settings

- `automaton.autohotkeyPath`: AutoHotkey v2 exe that runs the commons `AppCompiler.ahk`.
- `automaton.projects`: workspace folder names that are Automaton projects. Add or remove projects here, no rebuild needed.
- `automaton.allProjects`: projects included in the All commands.
- `automaton.notRunnable`: workspace folders that are never run or compiled (GUI, commons, internal-tools). Sets the `automaton.notRunnable` context key, which hides the AutoHotkey play button there.
- `automaton.pullProjects`: repos for Fetch and Pull All and the periodic fetch (default: the games and the manager, plus GUI, commons, internal-tools and AutomatonTools).
- `automaton.autoFetch`: periodic fetch on or off (default on).
- `automaton.autoFetchSeconds`: seconds between fetches (default 60, minimum 10).
- `automaton.pythonPath`: Python used for `generate_images.py`.

## Build and install

`package.json` is generated, edit `make_package_json.py` and run it.

```text
python make_package_json.py
python build_vsix.py --install
```

`--install` installs the vsix into the `Automatons` VS Code profile. Reload the window afterwards.
