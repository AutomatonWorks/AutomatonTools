# AutomatonTools

VS Code extension for the AutomatonWorks repos: run, compile, deploy and release the games (GI, HSR, ZZZ) and the Automaton Manager, and keep every repo pulled.

## Commands

All under `Automaton:` in the Command Palette. Each action (Run, Compile, Deploy, Compile and Deploy, Release) comes in three forms:

- `<Action> (current file's game)`: the project of the open file.
- `<Action>...`: pick a project from a list.
- `<Action> <Project>`: one command per project, e.g. `Run ZZZ`.

`Compile All` compiles every project in `automaton.allProjects`. To change that list edit `Choose projects for All`.

# Actions:

- **Run**: starts `run.py` from the project's `.venv`. Running it again restarts it.
- **Compile**: runs `build.py` and writes `.compiled\<APP_NAME>.exe`. If an auto is running it'll be closed first before compiling.
- **Deploy**: only for repos with a `deploy.py`.
- **Release**: only for repos with `.github/workflows/release.yml`. Asks for confirmation (shows the version, warns about unpushed commits), starts the workflow on `main`, and links the release or the failed run when it's done.

The editor title bar gets Run and Compile buttons (play and cog button) on any project file, and the status bar gets a Compile button.
In our auto projects, the Python extension's own run buttons are hidden so they don't get pressed by mistake and the debug buttons only show on `src\Main.py`.
The exception is `.tools`, you can run those like normal.

## Git

- `Fetch and Pull All`: fetches every repo in `automaton.pullProjects` and fast-forwards the ones that are behind.
- `Choose repos for Fetch and Pull`: sets that list.

With `automaton.autoFetch` on, the repos are fetched in the background and you get a notification when one has new commits.

## Updates

The extension checks GitHub for a new release at startup and every 6 hours, asks before installing it, and offers a window reload.

## Settings

| Setting | What it does |
|---|---|
| `Projects` | Workspace folders that are Automaton projects (need `run.py` and `build.py`). |
| `All Projects` | Projects included in `Compile All`. |
| `Not Runnable` | Projects that are paused: no Run or Compile for them. Empty by default. |
| `Pull Projects` | Repos for Fetch and Pull. |
| `Auto Fetch` | Background fetch on or off (default on). |
| `Auto Fetch Seconds` | Seconds between fetches (default 60, minimum 10). |
| `Python Path` | Python used to start `build.py`. |

Changing `automaton.projects` adds or removes the per-project commands after a window reload.

## Build

`package.json` is generated: edit `make_package_json.py` instead.

```text
python make_package_json.py
python build_vsix.py --install
```

The vsix goes to `builds\`. `--install` installs it into the `AutomatonWorks` profile; reload the window afterwards.
