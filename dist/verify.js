import { execShell } from "./exec.js";
async function runHook(adapter, ctx, hook, cwd) {
    try {
        const result = adapter.runHook
            ? await adapter.runHook(hook, cwd)
            : hook.command
                ? { ok: true, output: await execShell(hook.command, hook.cwd ?? cwd, adapter) }
                : { ok: true, output: "" };
        return {
            name: hook.name,
            ok: result.ok,
            output: result.output
        };
    }
    catch (error) {
        return {
            name: hook.name,
            ok: false,
            output: error instanceof Error ? error.message : String(error)
        };
    }
}
async function runStage(stage, hooks, adapter, ctx, cwd) {
    const steps = [];
    for (const hook of hooks ?? []) {
        const result = await runHook(adapter, ctx, hook, cwd);
        steps.push(result);
        if (!result.ok && hook.required !== false) {
            break;
        }
    }
    return { stage, steps };
}
export async function runVerification(adapter, manifest, ctx, cwd) {
    const stages = [];
    for (const stage of ["preflight", "verification", "smoke", "compatibility"]) {
        const result = await runStage(stage, manifest.hooks?.[stage], adapter, ctx, cwd);
        stages.push(result);
        const failed = result.steps.find((step) => !step.ok);
        if (failed) {
            return {
                ok: false,
                stages,
                failedStep: failed.name
            };
        }
    }
    return {
        ok: true,
        stages
    };
}
