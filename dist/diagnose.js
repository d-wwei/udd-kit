import { matchChangelogToError } from "./match.js";
function strategies(...items) {
    return [...new Set(items)];
}
async function resolveFixMatch(ctx, adapter) {
    const highlights = ctx.upstream?.highlights ?? [];
    if (!ctx.error || !highlights.length)
        return undefined;
    // Prefer adapter's semantic matching (LLM-powered in agent environments)
    if (adapter?.matchUpstreamFix) {
        try {
            const result = await adapter.matchUpstreamFix({
                error: ctx.error,
                highlights,
                releaseUrl: ctx.upstream?.releaseUrl,
                latestVersion: ctx.upstream?.latestVersion
            });
            if (result)
                return result;
        }
        catch {
            // fall through to text matching
        }
    }
    // Fallback: deterministic text matching (works without LLM)
    return matchChangelogToError(ctx.error, highlights);
}
export async function diagnoseIncident(ctx, manifest, adapter) {
    const message = `${ctx.error?.message ?? ""} ${ctx.error?.code ?? ""}`.toLowerCase();
    const hasUpdate = Boolean(ctx.upstream?.hasUpdate);
    const fixMatch = await resolveFixMatch(ctx, adapter);
    const evidence = [
        ctx.error?.message ? `error:${ctx.error.message}` : "",
        hasUpdate && ctx.upstream?.latestVersion ? `upstream:${ctx.upstream.latestVersion}` : "",
        ctx.git?.changedFiles?.length ? `local_changes:${ctx.git.changedFiles.length}` : "",
        fixMatch ? `changelog_match:${fixMatch.confidence}(${fixMatch.score.toFixed(2)})` : ""
    ].filter(Boolean);
    if (hasUpdate && fixMatch && (fixMatch.confidence === "high" || fixMatch.confidence === "medium")) {
        return {
            kind: "upstream_update",
            confidence: fixMatch.confidence === "high" ? 0.9 : 0.8,
            summary: fixMatch.recommendation,
            suggestedStrategies: strategies("upstream_update", "agent_patch", "issue_only"),
            evidence,
            upstreamFixMatch: fixMatch
        };
    }
    if (hasUpdate && /(dependency|version|package|module|import|compat|peer|mismatch)/.test(message)) {
        return {
            kind: "upstream_update",
            confidence: 0.8,
            summary: `Upstream update ${ctx.upstream?.latestVersion ?? "available"} may resolve this failure.`,
            suggestedStrategies: strategies("upstream_update", "agent_patch", "issue_only"),
            evidence,
            upstreamFixMatch: fixMatch
        };
    }
    if (hasUpdate && manifest.selfHealing?.strategyOrder?.includes("upstream_update")) {
        return {
            kind: "dependency_drift",
            confidence: 0.65,
            summary: `Local integration appears behind upstream ${ctx.upstream?.latestVersion ?? "version"}.`,
            suggestedStrategies: strategies("upstream_update", "agent_patch", "issue_only"),
            evidence,
            upstreamFixMatch: fixMatch
        };
    }
    if (/(config|env|credential|permission|secret)/.test(message)) {
        return {
            kind: "config_error",
            confidence: 0.7,
            summary: "The failure looks configuration-related.",
            suggestedStrategies: strategies("agent_patch", "issue_only"),
            evidence,
            upstreamFixMatch: fixMatch
        };
    }
    if (ctx.error) {
        return {
            kind: "code_bug",
            confidence: 0.7,
            summary: "The failure looks like a local code or workflow bug.",
            suggestedStrategies: strategies("agent_patch", "issue_only"),
            evidence,
            upstreamFixMatch: fixMatch
        };
    }
    return {
        kind: "unknown",
        confidence: 0.4,
        summary: "Could not confidently classify the incident.",
        suggestedStrategies: strategies("issue_only"),
        evidence,
        upstreamFixMatch: fixMatch
    };
}
