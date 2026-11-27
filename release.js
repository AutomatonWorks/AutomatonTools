const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const RELEASE_WORKFLOW = "release.yml";
const RELEASE_BRANCH = "main";
const API = "https://api.github.com";
const POLL_MS = 15 * 1000;
// a run shows up in the API a few seconds after the dispatch
const FIND_RUN_ATTEMPTS = 12;

let log = null;

function hasReleaseWorkflow(root) {
    return fs.existsSync(path.join(root, ".github", "workflows", RELEASE_WORKFLOW));
}

function git(root, args, input) {
    return new Promise((resolve, reject) => {
        const child = execFile("git", ["-C", root, ...args], { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
            (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(stderr.trim() || error.message));
                    return;
                }
                resolve(stdout.trim());
            });
        if (input !== undefined) {
            child.stdin.end(input);
        }
    });
}

async function githubRepo(root) {
    const url = await git(root, ["remote", "get-url", "origin"]);
    const match = /github\.com[:/]([^/]+)\/([^/]+?)(\.git)?$/.exec(url);
    if (match === null) {
        throw new Error(`origin is not a GitHub repo (${url})`);
    }
    return { owner: match[1], name: match[2] };
}

// The token git pushes with, so the release needs no setup beyond a working push.
async function githubToken(root, repo) {
    const request = `protocol=https\nhost=github.com\npath=${repo.owner}/${repo.name}.git\n\n`;
    const answer = await git(root, ["credential", "fill"], request);
    const line = answer.split("\n").find((entry) => entry.startsWith("password="));
    if (line === undefined) {
        throw new Error("git has no GitHub credential for this repo");
    }
    return line.slice("password=".length);
}

async function github(token, method, route, body) {
    const response = await fetch(`${API}${route}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "automaton-vscode",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`GitHub answered ${response.status} to ${method} ${route}: ${await response.text()}`);
    }
    return response.status === 204 ? null : response.json();
}

async function unpushedCommits(root) {
    await git(root, ["fetch", "origin", RELEASE_BRANCH]);
    return parseInt(await git(root, ["rev-list", "--count", `origin/${RELEASE_BRANCH}..HEAD`]), 10);
}

async function confirmRelease(game, version, unpushed) {
    const warning = (unpushed > 0)
        ? `\n\n${unpushed} local commit(s) are not pushed and will not be in it.`
        : "";
    const choice = await vscode.window.showWarningMessage(
        `Release ${game.displayName} v${version}?`,
        { modal: true, detail: `GitHub Actions tests and builds origin/${RELEASE_BRANCH}, then publishes the exe.${warning}` },
        "Release"
    );
    return choice === "Release";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findRun(token, repo, dispatchedAt) {
    const route = `/repos/${repo.owner}/${repo.name}/actions/workflows/${RELEASE_WORKFLOW}/runs?event=workflow_dispatch&per_page=5`;
    for (let attempt = 0; attempt < FIND_RUN_ATTEMPTS; attempt++) {
        await sleep(5000);
        const { workflow_runs: runs } = await github(token, "GET", route);
        const run = runs.find((candidate) => Date.parse(candidate.created_at) >= (dispatchedAt - 5000));
        if (run !== undefined) {
            return run;
        }
    }
    throw new Error("the workflow was queued but its run never showed up");
}

async function waitForRun(token, repo, run, title) {
    return vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title }, async (progress) => {
        let current = run;
        while (current.status !== "completed") {
            progress.report({ message: current.status });
            await sleep(POLL_MS);
            current = await github(token, "GET", `/repos/${repo.owner}/${repo.name}/actions/runs/${run.id}`);
        }
        return current;
    });
}

async function offerLink(show, message, label, url) {
    if ((await show(message, label)) === label) {
        await vscode.env.openExternal(vscode.Uri.parse(url));
    }
}

async function release(game) {
    const version = fs.readFileSync(path.join(game.root, "src", "VERSION"), "utf8").trim();
    const repo = await githubRepo(game.root);
    if (!(await confirmRelease(game, version, await unpushedCommits(game.root)))) {
        return null;
    }
    const token = await githubToken(game.root, repo);
    const dispatchedAt = Date.now();
    await github(token, "POST", `/repos/${repo.owner}/${repo.name}/actions/workflows/${RELEASE_WORKFLOW}/dispatches`,
        { ref: RELEASE_BRANCH });
    const run = await findRun(token, repo, dispatchedAt);
    log.appendLine(`${game.displayName} v${version}: ${run.html_url}`);
    offerLink(vscode.window.showInformationMessage, `Release of ${game.displayName} v${version} queued.`, "Open run", run.html_url);
    const finished = await waitForRun(token, repo, run, `$(cloud-upload) Release ${game.shortName}`);
    log.appendLine(`${game.displayName} v${version}: ${finished.conclusion}`);
    if (finished.conclusion !== "success") {
        offerLink(vscode.window.showErrorMessage, `Release of ${game.displayName} v${version} failed (${finished.conclusion}).`,
            "Open run", finished.html_url);
        return 1;
    }
    const releaseUrl = `https://github.com/${repo.owner}/${repo.name}/releases/tag/v${version}`;
    offerLink(vscode.window.showInformationMessage, `${game.displayName} v${version} released.`, "Open release", releaseUrl);
    return 0;
}

// Returns 0 when the release is published, 1 when its run failed, null when it never started.
async function releaseProject(game) {
    if (log === null) {
        log = vscode.window.createOutputChannel("Automaton Release");
    }
    try {
        return await release(game);
    } catch (error) {
        log.appendLine(`${game.displayName}: ${error.message}`);
        vscode.window.showErrorMessage(`Release of ${game.displayName} failed: ${error.message}`);
        return null;
    }
}

module.exports = { releaseProject, hasReleaseWorkflow };
