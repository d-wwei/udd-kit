#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { checkForUpdates, ignoreUpdateVersion } from "./check.js";
import { contribute, detectIdentity } from "./contribute.js";
import { prepareContributionDraft } from "./contribution.js";
import { prepareIssueDraft } from "./issue.js";
import { defineAdapter } from "./adapter.js";
import { loadManifest } from "./manifest.js";
import { createRuntime } from "./runtime.js";
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const options = parseFlags(args.slice(1));
    const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
    if (command === "init") {
        await runInit(cwd, options);
        return;
    }
    const manifest = await loadManifest(cwd, options.manifest ?? "udd.config.json").catch(async () => {
        return loadManifest(cwd, options.manifest ?? "agent-upgrade.json");
    });
    const decision = options.decision;
    const manualSteps = collectMultiFlags(args.slice(1), "--manual-step");
    const ctx = {
        cwd,
        appName: options.appName ?? path.basename(cwd),
        appVersion: options.appVersion,
        logs: collectMultiFlags(args.slice(1), "--log"),
        error: options.error ? { message: options.error } : undefined,
        confirm: async () => false
    };
    const adapter = defineAdapter({
        name: `${ctx.appName}-cli`,
        async getContext() {
            return ctx;
        },
        async decide(prompt) {
            if (decision)
                return decision;
            if (options.yes === "true") {
                return prompt.kind === "update" ? "update_once" : "repair_once";
            }
            return prompt.kind === "update" ? "skip_this_time" : "issue_only";
        },
        async getUpdateProviders() {
            if (!manualSteps.length)
                return [];
            return [{
                    kind: "manual",
                    async describeManualSteps() {
                        return manualSteps;
                    }
                }];
        }
    });
    const runtime = await createRuntime({ cwd, manifest });
    if (command === "check") {
        const result = await checkForUpdates(ctx, manifest);
        printOutput(result, options);
        return;
    }
    if (command === "ignore") {
        if (!options.version) {
            throw new Error("--version is required for ignore");
        }
        await ignoreUpdateVersion(manifest, options.version);
        printOutput({ ok: true, ignored: options.version, repo: manifest.repo }, options);
        return;
    }
    if (command === "issue-draft") {
        const draft = await prepareIssueDraft(ctx, manifest, {
            expectedResult: options.expectedResult,
            reproductionSteps: options.repro ? options.repro.split("|||") : undefined,
            attemptedFixes: options.attemptedFixes ? options.attemptedFixes.split("|||") : undefined
        });
        printOutput(draft, options);
        if (options.out) {
            await writeFile(path.resolve(cwd, options.out), draft.preview, "utf8");
        }
        return;
    }
    if (command === "contribute-draft") {
        const draft = await prepareContributionDraft(ctx, manifest, {
            summary: options.summary,
            rootCause: options.rootCause,
            validation: options.validation ? options.validation.split("|||") : undefined
        });
        printOutput(draft, options);
        if (options.out) {
            await writeFile(path.resolve(cwd, options.out), draft.prBody, "utf8");
        }
        return;
    }
    if (command === "identity") {
        const result = await detectIdentity(cwd, manifest, options.remote);
        printOutput(result, options);
        return;
    }
    if (command === "contribute") {
        const strategy = (options.strategy ?? options.pr === "true" ? "pull_request" : undefined);
        const result = await contribute(adapter, manifest, ctx, {
            message: options.message ?? options.m,
            strategy,
            target: options.target,
            auth: options["github-token"] ? { token: options["github-token"] } : undefined,
            remoteName: options.remote,
            skipVerification: options["skip-verification"] === "true"
        });
        printOutput(result, options);
        return;
    }
    if (command === "analyze") {
        const diagnosis = await runtime.analyze(adapter, {
            error: ctx.error,
            appVersion: ctx.appVersion
        });
        printOutput(diagnosis, options);
        return;
    }
    if (command === "heal") {
        const result = await runtime.heal(adapter, {
            error: ctx.error,
            appVersion: ctx.appVersion,
            auth: options["github-token"] ? { token: options["github-token"] } : undefined,
            submitIssueOnEscalation: options["submit-issue"] === "true",
            createPr: options["no-pr"] === "true" ? false : true
        });
        printOutput(result, options);
        return;
    }
    if (command === "state") {
        const state = await runtime.getState(adapter);
        printOutput(state, options);
        return;
    }
    if (command === "audit") {
        const limit = options.limit ? Number(options.limit) : 20;
        const audit = await runtime.getAudit(adapter, Number.isFinite(limit) ? limit : 20);
        printOutput(audit, options);
        return;
    }
    printUsage();
    process.exitCode = 1;
}
async function runInit(cwd, options) {
    const configPath = path.join(cwd, "udd.config.json");
    try {
        await readFile(configPath, "utf8");
        if (options.force !== "true") {
            console.error("udd.config.json already exists. Use --force to overwrite.");
            process.exitCode = 1;
            return;
        }
    }
    catch { /* does not exist, proceed */ }
    let repo = options.repo ?? "";
    let versionType = "package.json";
    let versionPath = "./package.json";
    if (!repo) {
        try {
            const pkg = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8"));
            const raw = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url ?? "";
            const match = raw.match(/github\.com[/:]([^/]+\/[^/.]+)/);
            if (match)
                repo = match[1];
        }
        catch { /* no package.json */ }
    }
    if (!repo) {
        try {
            const { execFile } = await import("node:child_process");
            const { promisify } = await import("node:util");
            const exec = promisify(execFile);
            const { stdout } = await exec("git", ["remote", "get-url", "origin"], { cwd });
            const match = stdout.trim().match(/github\.com[/:]([^/]+\/[^/.]+)/);
            if (match)
                repo = match[1];
        }
        catch { /* not a git repo or no remote */ }
    }
    try {
        await readFile(path.join(cwd, "pyproject.toml"), "utf8");
        versionType = "pyproject.toml";
        versionPath = "./pyproject.toml";
    }
    catch { /* not Python */ }
    // Build contribute config with optional project-specific token
    const contributeConfig = {
        defaultTarget: "main",
        strategy: "auto",
        upstream: repo || "owner/repository",
        requireVerification: true,
        autoContributeAfterHeal: true
    };
    // Project-specific GitHub token for external contributors to create PRs
    const githubToken = options["github-token"];
    if (githubToken) {
        contributeConfig.githubToken = githubToken;
    }
    const config = {
        $schemaVersion: 1,
        repo: repo || "owner/repository",
        releaseChannel: "releases",
        currentVersionSource: { type: versionType, path: versionPath },
        changelogSource: { type: "release_notes" },
        updateInstructions: {
            command: versionType === "package.json"
                ? `npm install ${repo || "owner/repository"}@latest`
                : `pip install --upgrade ${repo.split("/")[1] ?? "package"}`,
            docsUrl: repo ? `https://github.com/${repo}#readme` : "https://github.com/owner/repository#readme"
        },
        contribute: contributeConfig,
        selfHealing: {
            enabled: true,
            strategyOrder: ["agent_patch", "upstream_update", "issue_only"],
            workspaceMode: "git_worktree",
            approvalMode: "manual"
        },
        hooks: {
            verification: [
                { name: "test", command: versionType === "package.json" ? "npm test" : "python -m pytest" }
            ]
        }
    };
    await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
    console.log(`Created ${configPath}`);
    if (!repo) {
        console.log("  repo: owner/repository (edit this in udd.config.json)");
    }
    if (!githubToken) {
        console.log("");
        console.log("  ⚠ No --github-token provided. External contributors won't be able to auto-create PRs.");
        console.log("  To enable, create a fine-grained PAT with Pull Requests (Write) scope for this repo,");
        console.log("  then either:");
        console.log(`    - Re-run: udd init --github-token <token> --force`);
        console.log(`    - Or add "githubToken" to contribute section in udd.config.json`);
    }
    const productName = repo ? repo.split("/")[1] : path.basename(cwd);
    const prompt = generateAgentPrompt(productName, cwd, config.repo);
    const promptPath = options.out
        ? path.resolve(cwd, options.out)
        : undefined;
    if (promptPath) {
        await writeFile(promptPath, prompt, "utf8");
        console.log(`\nAgent instructions written to ${promptPath}`);
    }
    else {
        console.log("\n--- Copy the following into your agent instructions (CLAUDE.md, AGENT_INSTRUCTIONS.md, etc.) ---\n");
        console.log(prompt);
        console.log("--- End of agent instructions ---");
    }
}
function generateAgentPrompt(productName, productRoot, repo) {
    return `## Self-Healing Protocol (UDD)

This project uses UDD Kit for self-healing and proactive health monitoring.

### Proactive monitoring (on session start)

At the start of each session, spawn a subagent to run a health check:
\`\`\`bash
cd ${productRoot} && udd check --json
\`\`\`
- If \`hasUpdate\` is true, inform the user: "${productName} has a new version available."
- If \`upstreamFixMatch\` is present, highlight it: "Upstream may have fixed [issue]. Consider updating."
- If no updates, proceed silently.

### Reactive self-healing (on error)

When you encounter a failure while using ${productName}:
- A tool or command fails with an error
- A previously working workflow stops working
- You see version mismatch, dependency, or compatibility errors

**Spawn a separate subagent** to handle diagnosis and repair. Do NOT attempt UDD operations in your current context -- use an isolated subagent to avoid recursive dependency (you may be part of the product being repaired).

The subagent should:

1. **Check if upstream already fixed the problem:**
\`\`\`bash
cd ${productRoot} && udd check --json
\`\`\`
Read the JSON output. If \`hasUpdate\` is true and \`upstreamFixMatch\` is present with medium/high confidence, the upstream release likely fixes this error. Recommend the user to update.

2. **If no upstream fix, analyze the error:**
\`\`\`bash
cd ${productRoot} && udd analyze --error "<the actual error message>" --json
\`\`\`
Report the \`kind\` (upstream_update, code_bug, config_error, dependency_drift) and suggested strategies.

3. **If the user approves, attempt self-heal:**
\`\`\`bash
cd ${productRoot} && udd heal --error "<the actual error message>" --decision repair_once --json
\`\`\`
This runs in an isolated git worktree. If verification passes, the fix is ready for review.

4. **If all else fails, draft an issue:**
\`\`\`bash
cd ${productRoot} && udd issue-draft --error "<the actual error message>" --out ./issue-draft.md
\`\`\`
Present the draft to the user before submission.

### Semantic matching

When analyzing whether an upstream changelog entry fixes the current error, use your own LLM judgment -- you are better at semantic matching than keyword overlap. Consider whether the changelog mentions the same component, error class, or failure pattern, even with different wording.

### Proactive contribution (local improvements)

When you have made local improvements (bug fixes, enhancements, new features) and want to push them upstream:

1. **Auto-detect identity and strategy (recommended):**
\`\`\`bash
cd ${productRoot} && udd identity --json
cd ${productRoot} && udd contribute --message "fix: description" --strategy auto --github-token \${GITHUB_TOKEN}
\`\`\`
With \`--strategy auto\`, UDD Kit detects whether you are the repo owner or an external contributor:
- **Owner** (origin matches upstream): direct push to target branch
- **External** (origin is a fork): create PR against upstream repo

2. **Direct push to target branch (owner only):**
\`\`\`bash
cd ${productRoot} && udd contribute --message "fix: description of changes"
\`\`\`

3. **Create a pull request (external contributor):**
\`\`\`bash
cd ${productRoot} && udd contribute --message "feat: description" --strategy pull_request --github-token \${GITHUB_TOKEN}
\`\`\`

4. **Skip verification if needed:**
\`\`\`bash
cd ${productRoot} && udd contribute --message "chore: quick fix" --skip-verification
\`\`\`

The contribute command will: detect identity → detect local changes → run verification hooks → commit → push (direct or PR). If verification fails, the push is blocked.

### Auto-contribute after self-heal

If \`contribute.autoContributeAfterHeal\` is true in \`udd.config.json\`, successful self-heal repairs are automatically contributed back upstream. The strategy (direct_push vs pull_request) is determined by identity detection:
- Owner agents: direct push fixes to main
- External agents: create PRs for the upstream maintainer to review

### Rules

- Always run UDD commands in a subagent, never in the main agent context
- Never modify files outside ${productRoot}
- Never commit to main/master directly (unless contribute strategy is direct_push and target is explicitly set)
- If \`udd.config.json\` is missing, tell the user to run \`udd init\`
- Respect .env, secrets, and protectedPaths in udd.config.json
`;
}
function parseFlags(args) {
    const output = {};
    for (let i = 0; i < args.length; i += 1) {
        const token = args[i];
        if (!token.startsWith("--"))
            continue;
        const next = args[i + 1];
        if (!next || next.startsWith("--")) {
            output[token.slice(2)] = "true";
            continue;
        }
        output[token.slice(2)] = next;
        i += 1;
    }
    return output;
}
function collectMultiFlags(args, flag) {
    const result = [];
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] === flag && args[i + 1]) {
            result.push(path.resolve(args[i + 1]));
            i += 1;
        }
    }
    return result;
}
function printUsage() {
    console.error([
        "Usage:",
        "  udd init [--repo owner/name] [--github-token <PAT>] [--force]",
        "  udd check [--manifest ./udd.config.json] [--json]",
        "  udd ignore --version 1.2.3",
        "  udd analyze --error \"Request failed\" [--json]",
        "  udd heal --error \"Request failed\" --decision repair_once [--json]",
        "  udd state [--json]",
        "  udd audit [--limit 20] [--json]",
        "  udd issue-draft --error \"Request failed\" [--out ./issue.md]",
        "  udd identity [--remote origin] [--json]          Detect owner vs external contributor",
        "  udd contribute --message \"fix: token auth\" [--strategy direct_push|pull_request|auto] [--target main]",
        "  udd contribute-draft --summary \"Fixed retry logic\" [--out ./pr.md]"
    ].join("\n"));
}
function printOutput(value, options) {
    if (options.json === "true") {
        console.log(JSON.stringify(value, null, 2));
        return;
    }
    if (typeof value === "string") {
        console.log(value);
        return;
    }
    console.log(JSON.stringify(value, null, 2));
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
