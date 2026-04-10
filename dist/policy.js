function defaultDecisionFor(plan) {
    return plan.strategy === "upstream_update" ? "update_once" : "repair_once";
}
export async function resolveHealDecision(adapter, plan, manifest, state, ctx) {
    if (plan.strategy === "issue_only")
        return "issue_only";
    if (plan.strategy === "manual_update")
        return "update_once";
    const preferred = plan.strategy === "upstream_update"
        ? state.preferredDecision === "always_auto_update_safe"
            ? state.preferredDecision
            : undefined
        : state.preferredDecision === "always_auto_repair_safe"
            ? state.preferredDecision
            : undefined;
    if (preferred)
        return preferred;
    const options = plan.strategy === "upstream_update"
        ? ["update_once", "always_auto_update_safe", "skip_this_time", "ignore_this_version", "issue_only"]
        : ["repair_once", "always_auto_repair_safe", "skip_this_time", "issue_only"];
    const prompt = {
        kind: plan.strategy === "upstream_update" ? "update" : "repair",
        title: plan.strategy === "upstream_update" ? `Apply upstream update for ${ctx.appName}?` : `Attempt self-heal for ${ctx.appName}?`,
        summary: `${plan.diagnosis.summary} Strategy: ${plan.strategy}`,
        preview: plan.manualUpdateSteps?.join("\n"),
        options
    };
    if (adapter.decide) {
        return adapter.decide(prompt);
    }
    if (manifest.selfHealing?.approvalMode === "safe_auto") {
        return defaultDecisionFor(plan);
    }
    const confirmed = await ctx.confirm(prompt);
    return confirmed ? defaultDecisionFor(plan) : "skip_this_time";
}
