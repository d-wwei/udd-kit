import type { Diagnosis, HostContext, RepairStrategy, UpgradeManifest } from "./types.js";

function strategies(...items: RepairStrategy[]): RepairStrategy[] {
  return [...new Set(items)];
}

export function diagnoseIncident(ctx: HostContext, manifest: UpgradeManifest): Diagnosis {
  const message = `${ctx.error?.message ?? ""} ${ctx.error?.code ?? ""}`.toLowerCase();
  const hasUpdate = Boolean(ctx.upstream?.hasUpdate);
  const evidence = [
    ctx.error?.message ? `error:${ctx.error.message}` : "",
    hasUpdate && ctx.upstream?.latestVersion ? `upstream:${ctx.upstream.latestVersion}` : "",
    ctx.git?.changedFiles?.length ? `local_changes:${ctx.git.changedFiles.length}` : ""
  ].filter(Boolean);

  if (hasUpdate && /(dependency|version|package|module|import|compat|peer|mismatch)/.test(message)) {
    return {
      kind: "upstream_update",
      confidence: 0.8,
      summary: `Upstream update ${ctx.upstream?.latestVersion ?? "available"} may resolve this failure.`,
      suggestedStrategies: strategies("upstream_update", "agent_patch", "issue_only"),
      evidence
    };
  }

  if (hasUpdate && manifest.selfHealing?.strategyOrder?.includes("upstream_update")) {
    return {
      kind: "dependency_drift",
      confidence: 0.65,
      summary: `Local integration appears behind upstream ${ctx.upstream?.latestVersion ?? "version"}.`,
      suggestedStrategies: strategies("upstream_update", "agent_patch", "issue_only"),
      evidence
    };
  }

  if (/(config|env|credential|permission|secret)/.test(message)) {
    return {
      kind: "config_error",
      confidence: 0.7,
      summary: "The failure looks configuration-related.",
      suggestedStrategies: strategies("agent_patch", "issue_only"),
      evidence
    };
  }

  if (ctx.error) {
    return {
      kind: "code_bug",
      confidence: 0.7,
      summary: "The failure looks like a local code or workflow bug.",
      suggestedStrategies: strategies("agent_patch", "issue_only"),
      evidence
    };
  }

  return {
    kind: "unknown",
    confidence: 0.4,
    summary: "Could not confidently classify the incident.",
    suggestedStrategies: strategies("issue_only"),
    evidence
  };
}
