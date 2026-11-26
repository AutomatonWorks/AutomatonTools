const { execFile } = require("child_process");
const path = require("path");

const PYTHON_HOST = /^pythonw?(\d+)?\.exe$/i;

function compiledExe(game) {
    return path.join(game.root, ".compiled", `${game.appName}.exe`);
}

// Run replaces the script's previous instance; Compile overwrites the exe, which Windows refuses while it runs.
function killTargets(action, game) {
    if (action === "run") {
        const runScript = path.join(game.root, "run.py");
        return { hostPattern: PYTHON_HOST, exeName: null, commandLinePart: runScript, exePath: null };
    }
    if (action === "compile") {
        const exePath = compiledExe(game);
        return { hostPattern: null, exeName: path.basename(exePath), commandLinePart: null, exePath };
    }
    return null;
}

function runningImageNames() {
    return new Promise((resolve) => {
        execFile("tasklist.exe", ["/FO", "CSV", "/NH"], { windowsHide: true }, (error, stdout) => {
            if (error) {
                resolve(null);
                return;
            }
            resolve(stdout.split(/\r?\n/).map((line) => line.split('","')[0].replace(/^"/, "")).filter(Boolean));
        });
    });
}

function psQuote(text) {
    return `'${text.replace(/'/g, "''")}'`;
}

function elevatedKillScript(targets) {
    const conditions = [];
    if (targets.commandLinePart !== null) {
        conditions.push(`(($_.CommandLine -ne $null) -and ($_.CommandLine.ToLower().Contains(${psQuote(targets.commandLinePart.toLowerCase())})))`);
    }
    if (targets.exePath !== null) {
        conditions.push(`($_.ExecutablePath -eq ${psQuote(targets.exePath)})`);
    }
    return `Get-CimInstance Win32_Process | Where-Object { ${conditions.join(" -or ")} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
}

function encoded(script) {
    return Buffer.from(script, "utf16le").toString("base64");
}

// The automatons self-elevate, so only an elevated process can see their command line and stop them; UAC does not prompt here.
async function killReplacedProcess(action, game) {
    const targets = killTargets(action, game);
    if (targets === null) {
        return;
    }
    const names = await runningImageNames();
    if (names !== null) {
        const candidate = names.some((name) => {
            const isHost = (targets.hostPattern !== null) && targets.hostPattern.test(name);
            const isExe = (targets.exeName !== null) && (name.toLowerCase() === targets.exeName.toLowerCase());
            return isHost || isExe;
        });
        if (!candidate) {
            return;
        }
    }
    const inner = `-NoProfile -EncodedCommand ${encoded(elevatedKillScript(targets))}`;
    const outer = `Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList ${psQuote(inner)}`;
    await new Promise((resolve) => {
        execFile("powershell.exe", ["-NoProfile", "-Command", outer], { windowsHide: true }, () => resolve());
    });
}

module.exports = { killReplacedProcess };
