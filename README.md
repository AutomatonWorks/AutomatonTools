# AutomatonTools

VS Code extension for the AutomatonWorks Python repos: the games (GI-Automaton, HSR-Automaton, ZZZ-Automaton) and the Automaton Manager (folder AutomatonManager), next to GUI, commons and internal-tools.

Commands (Command Palette, prefix `Automaton:`), for Run, Compile, Deploy and Compile and Deploy (only Compile has `All`):

- `<Action> (current file's game)`: runs on the project that owns the active file, or asks if there is none.
- `<Action>...`: quick pick of the projects found in the workspace.
- `<Action> All`: the projects in `automaton.allProjects`, one after another, never in parallel.
- `Choose projects for All`: multi-select of the project list, saves `automaton.allProjects`.
- `<Action> <Project>`: one entry per project in `automaton.projects` (no Run/Compile for `automaton.notRunnable`). Palette entries can only come from package.json, so the extension rewrites its installed package.json when the lists change and offers a window reload.
- `Settings`: opens the extension settings.
- `Fetch and Pull All`: fetches every repo in `automaton.pullProjects` and pulls (`--ff-only`) the ones behind. Failures go to the `Automaton Git` output channel.
- `Choose repos for Fetch and Pull`: multi-select of the workspace folders that are git repos, saves `automaton.pullProjects`.

With `automaton.autoFetch` on, those repos are fetched every `automaton.autoFetchSeconds` seconds and a notification offers to pull when one has new commits. A dismissed update is not announced again until more commits land upstream.

A workspace folder counts as a project when its name is in `automaton.projects` and it has `run.py` and `build.py` at the root. Its name comes from `APP_NAME` in build.py: `ZZZ-Automaton` in messages and `ZZZ` in the per-project commands (`Run ZZZ`, `Compile ZZZ`); the manager is "Automaton Manager" and `Run Manager`.

- Run: `.venv\Scripts\python.exe run.py` (the .venv must exist). Running it again kills the previous instance and restarts it without asking. `Stop running games` terminates those runs.
- Compile: `<automaton.pythonPath> build.py`, which re-executes inside the .venv and writes `.compiled\<APP_NAME>.exe`. A running copy of that exe is killed first, since Windows refuses to overwrite it.
- Deploy and Compile and Deploy: only when the repo has a `deploy.py`. Compile and Deploy deploys only if the compile exits with 0.

The automatons elevate themselves, so the kill before Run and Compile goes through an elevated PowerShell (no UAC prompt with ConsentPromptBehaviorAdmin=0).

On any file of a project, two editor title buttons appear first on the left: "Run automaton" (play) and "Compile automaton" (gear). A status bar item compiles the project of the active file. Files under the project's `.tools` folder get none of them.

In a project the Python extensions' own run buttons ("Run Python File", "Run as task") are hidden, and their debug buttons only show on `src\Main.py`; files under `.tools` keep all of them. Those extensions have no setting for it, so on activation the extension adds the context keys `automatonWorks.blockPythonRun` and `automatonWorks.projectMain` to their `editor/title/run` conditions, again after each of their updates, and offers a window reload.

## Settings

- `automaton.projects`: workspace folder names that are Automaton projects. Add or remove projects here, no rebuild needed.
- `automaton.allProjects`: projects included in the All commands.
- `automaton.notRunnable`: workspace folders that are never run or compiled (GUI, commons, internal-tools).
- `automaton.pullProjects`: repos for Fetch and Pull All and the periodic fetch (default: the games and the manager, plus GUI, commons, internal-tools and AutomatonTools).
- `automaton.autoFetch`: periodic fetch on or off (default on).
- `automaton.autoFetchSeconds`: seconds between fetches (default 60, minimum 10).
- `automaton.pythonPath`: Python that starts `build.py`.

## Build and install

`package.json` is generated, edit `make_package_json.py` and run it.

```text
python make_package_json.py
python build_vsix.py --install
```

The vsix goes to `builds\`. `--install` installs it into the `AutomatonWorks` VS Code profile. Reload the window afterwards.
