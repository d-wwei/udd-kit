import { resolveUpdateProvider } from "./update-bridge.js";
export async function selectRepairStrategy(adapter, diagnosis, manifest) {
    const ordered = manifest.selfHealing?.strategyOrder ?? ["agent_patch", "upstream_update", "issue_only"];
    const updateProvider = await resolveUpdateProvider(adapter, manifest);
    for (const candidate of ordered) {
        if (!diagnosis.suggestedStrategies.includes(candidate))
            continue;
        if (candidate === "agent_patch" && !adapter.invokeRepairAgent)
            continue;
        if (candidate === "upstream_update" && !updateProvider)
            continue;
        return candidate;
    }
    if (diagnosis.suggestedStrategies.includes("upstream_update") && updateProvider?.kind === "manual") {
        return "manual_update";
    }
    return "issue_only";
}
