import { prepareContributionDraft, submitContribution } from "./contribution.js";
import { prepareIssueDraft, submitIssue } from "./issue.js";
import { writeAuditRecord } from "./audit.js";
import { diagnoseIncident } from "./diagnose.js";
import { collectIncidentContext } from "./incident.js";
import { resolveHealDecision } from "./policy.js";
import { runRepairAgent } from "./repair.js";
import { readPersistentState, writePersistentState } from "./state.js";
import { selectRepairStrategy } from "./strategy.js";
import { buildUpdateRequest, planUpdateProvider, resolveUpdateProvider } from "./update-bridge.js";
import { runVerification } from "./verify.js";
import { createWorkspace } from "./workspace.js";
import type {
  Diagnosis,
  HealOptions,
  HealPlan,
  HealResult,
  HostContext,
  UddAdapter,
  UddPersistentState,
  UpgradeManifest,
  VerificationResult
} from "./types.js";

function validationLines(verification: VerificationResult): string[] {
  return verification.stages.flatMap((stage) =>
    stage.steps.map((step) => `${stage.stage}:${step.name}:${step.ok ? "ok" : "failed"}`)
  );
}

async function persistState(
  adapter: UddAdapter,
  manifest: UpgradeManifest,
  ctx: HostContext,
  state: UddPersistentState,
  patch: Partial<UddPersistentState>
): Promise<UddPersistentState> {
  const next = {
    ...state,
    ...patch
  };
  await writePersistentState(adapter, manifest, ctx.cwd, next);
  return next;
}

async function escalateIssue(
  adapter: UddAdapter,
  manifest: UpgradeManifest,
  ctx: HostContext,
  diagnosis: Diagnosis,
  options: HealOptions,
  summary: string
): Promise<HealResult> {
  const issueDraft = await prepareIssueDraft(ctx, manifest, {
    attemptedFixes: [summary],
    expectedResult: "UDD self-heal should resolve the incident without requiring manual escalation."
  });
  let issueUrl: string | undefined;
  if (options.submitIssueOnEscalation && options.auth) {
    issueUrl = (await submitIssue(ctx, issueDraft, options.auth)).url;
  }
  await writeAuditRecord(adapter, manifest, ctx, {
    step: "issue_created",
    status: issueUrl ? "ok" : "skipped",
    message: summary,
    repo: manifest.repo,
    fromVersion: ctx.upstream?.currentVersion,
    toVersion: ctx.upstream?.latestVersion
  });
  return {
    status: "escalated",
    summary,
    strategy: "issue_only",
    diagnosis,
    issueDraft,
    issueUrl,
    recommendation: diagnosis.upstreamFixMatch
  };
}

export async function analyzeIncident(
  adapter: UddAdapter,
  manifest: UpgradeManifest,
  options: HealOptions = {}
): Promise<Diagnosis> {
  const { confirm, auth: _auth, submitIssueOnEscalation: _submit, createPr: _createPr, ...overrides } = options;
  const incident = await collectIncidentContext(adapter, manifest, { ...overrides, confirm });
  return diagnoseIncident(incident, manifest, adapter);
}

export async function planHealing(
  adapter: UddAdapter,
  manifest: UpgradeManifest,
  options: HealOptions = {}
): Promise<HealPlan> {
  const { confirm, auth: _auth, submitIssueOnEscalation: _submit, createPr: _createPr, ...overrides } = options;
  const incident = await collectIncidentContext(adapter, manifest, { ...overrides, confirm });
  const diagnosis = await diagnoseIncident(incident, manifest, adapter);
  const strategy = await selectRepairStrategy(adapter, diagnosis, manifest);

  let updateProviderKind: HealPlan["updateProviderKind"];
  let manualUpdateSteps: string[] | undefined;
  let updateTargetVersion = incident.upstream?.latestVersion;
  if (strategy === "upstream_update") {
    const provider = await resolveUpdateProvider(adapter, manifest);
    if (provider) {
      const planned = await planUpdateProvider(provider, buildUpdateRequest(incident, manifest));
      updateProviderKind = planned.kind;
      manualUpdateSteps = planned.manualSteps;
      updateTargetVersion = planned.targetVersion ?? updateTargetVersion;
    }
  }

  return {
    incident,
    diagnosis,
    strategy,
    updateProviderKind,
    manualUpdateSteps,
    updateTargetVersion
  };
}

export async function healIncident(
  adapter: UddAdapter,
  manifest: UpgradeManifest,
  options: HealOptions = {}
): Promise<HealResult> {
  const plan = await planHealing(adapter, manifest, options);
  const { incident, diagnosis } = plan;
  let state = await readPersistentState(adapter, manifest, incident.cwd);

  await writeAuditRecord(adapter, manifest, incident, {
    step: "incident_collected",
    status: "ok",
    message: incident.error?.message ?? "Incident collected for self-heal.",
    repo: manifest.repo,
    fromVersion: incident.upstream?.currentVersion,
    toVersion: incident.upstream?.latestVersion
  });
  await writeAuditRecord(adapter, manifest, incident, {
    step: "diagnosis_completed",
    status: "ok",
    message: diagnosis.summary,
    repo: manifest.repo,
    fromVersion: incident.upstream?.currentVersion,
    toVersion: incident.upstream?.latestVersion,
    metadata: {
      kind: diagnosis.kind,
      confidence: diagnosis.confidence,
      strategies: diagnosis.suggestedStrategies
    }
  });

  if (plan.updateTargetVersion && state.ignoredVersions?.includes(plan.updateTargetVersion)) {
    const summary = `Update ${plan.updateTargetVersion} is ignored for ${incident.appName}.`;
    state = await persistState(adapter, manifest, incident, state, {
      lastHeal: {
        status: "skipped",
        strategy: plan.strategy,
        summary,
        ts: new Date().toISOString()
      }
    });
    return {
      status: "skipped",
      summary,
      strategy: plan.strategy,
      diagnosis,
      manualUpdateSteps: plan.manualUpdateSteps,
      recommendation: diagnosis.upstreamFixMatch
    };
  }

  const decision = await resolveHealDecision(adapter, plan, manifest, state, incident);
  await writeAuditRecord(adapter, manifest, incident, {
    step: "decision_recorded",
    status: "ok",
    message: `Decision: ${decision}`,
    repo: manifest.repo,
    fromVersion: incident.upstream?.currentVersion,
    toVersion: plan.updateTargetVersion,
    metadata: {
      strategy: plan.strategy,
      provider: plan.updateProviderKind
    }
  });

  if (decision === "always_auto_repair_safe" || decision === "always_auto_update_safe") {
    state = await persistState(adapter, manifest, incident, state, {
      preferredDecision: decision
    });
  }

  if (decision === "ignore_this_version" && plan.updateTargetVersion) {
    state = await persistState(adapter, manifest, incident, state, {
      ignoredVersions: [...new Set([...(state.ignoredVersions ?? []), plan.updateTargetVersion])]
    });
    return {
      status: "skipped",
      summary: `Ignored version ${plan.updateTargetVersion} for future update prompts.`,
      strategy: plan.strategy,
      diagnosis,
      manualUpdateSteps: plan.manualUpdateSteps,
      recommendation: diagnosis.upstreamFixMatch
    };
  }

  if (decision === "skip_this_time") {
    const summary = `Skipped self-heal for ${incident.appName}.`;
    state = await persistState(adapter, manifest, incident, state, {
      lastHeal: {
        status: "skipped",
        strategy: plan.strategy,
        summary,
        ts: new Date().toISOString()
      }
    });
    return {
      status: "skipped",
      summary,
      strategy: plan.strategy,
      diagnosis,
      manualUpdateSteps: plan.manualUpdateSteps,
      recommendation: diagnosis.upstreamFixMatch
    };
  }

  if (decision === "issue_only" || plan.strategy === "issue_only") {
    const result = await escalateIssue(adapter, manifest, incident, diagnosis, options, diagnosis.summary);
    await persistState(adapter, manifest, incident, state, {
      lastHeal: {
        status: "escalated",
        strategy: "issue_only",
        summary: result.summary,
        ts: new Date().toISOString()
      }
    });
    return result;
  }

  if (plan.updateProviderKind === "manual" || plan.strategy === "manual_update") {
    const summary = "Manual upstream update is required in this host.";
    await persistState(adapter, manifest, incident, state, {
      lastHeal: {
        status: "skipped",
        strategy: plan.strategy,
        summary,
        ts: new Date().toISOString()
      }
    });
    return {
      status: "skipped",
      summary,
      strategy: plan.strategy,
      diagnosis,
      manualUpdateSteps: plan.manualUpdateSteps,
      recommendation: diagnosis.upstreamFixMatch
    };
  }

  const workspace = await createWorkspace(adapter, manifest, incident.cwd);
  const workspaceContext: HostContext = {
    ...incident,
    cwd: workspace.cwd
  };

  try {
    if (plan.strategy === "agent_patch") {
      await writeAuditRecord(adapter, manifest, incident, {
        step: "repair_started",
        status: "ok",
        message: diagnosis.summary,
        repo: manifest.repo,
        fromVersion: incident.upstream?.currentVersion,
        toVersion: plan.updateTargetVersion
      });
      const repair = await runRepairAgent(adapter, incident, diagnosis, manifest, workspace.cwd);
      if (!repair.ok) {
        const result = await escalateIssue(adapter, manifest, incident, diagnosis, options, repair.summary);
        await persistState(adapter, manifest, incident, state, {
          lastHeal: {
            status: "escalated",
            strategy: plan.strategy,
            summary: result.summary,
            ts: new Date().toISOString()
          }
        });
        return result;
      }
    } else if (plan.strategy === "upstream_update") {
      const provider = await resolveUpdateProvider(adapter, manifest);
      if (!provider?.apply) {
        return {
          status: "skipped",
          summary: "No executable update provider is available; manual update is required.",
          strategy: plan.strategy,
          diagnosis,
          manualUpdateSteps: plan.manualUpdateSteps,
          recommendation: diagnosis.upstreamFixMatch
        };
      }
      await writeAuditRecord(adapter, manifest, incident, {
        step: "update_started",
        status: "ok",
        message: diagnosis.summary,
        repo: manifest.repo,
        fromVersion: incident.upstream?.currentVersion,
        toVersion: plan.updateTargetVersion
      });
      const applied = await provider.apply({
        ...buildUpdateRequest(workspaceContext, manifest),
        targetVersion: plan.updateTargetVersion
      });
      if (!applied.ok) {
        const result = await escalateIssue(adapter, manifest, incident, diagnosis, options, applied.details ?? diagnosis.summary);
        await persistState(adapter, manifest, incident, state, {
          lastHeal: {
            status: "escalated",
            strategy: plan.strategy,
            summary: result.summary,
            ts: new Date().toISOString()
          }
        });
        return result;
      }
    }

    const verification = await runVerification(adapter, manifest, workspaceContext, workspace.cwd);
    await writeAuditRecord(adapter, manifest, incident, {
      step: "verification_completed",
      status: verification.ok ? "ok" : "failed",
      message: verification.ok ? "Verification passed." : `Verification failed at ${verification.failedStep ?? "unknown step"}.`,
      repo: manifest.repo,
      fromVersion: incident.upstream?.currentVersion,
      toVersion: plan.updateTargetVersion,
      metadata: {
        stages: verification.stages
      }
    });
    if (!verification.ok) {
      await writeAuditRecord(adapter, manifest, incident, {
        step: "rollback_completed",
        status: workspace.mode === "git_worktree" ? "ok" : "skipped",
        message: workspace.mode === "git_worktree" ? "Rolled back by removing isolated worktree." : "Inline workspace cannot be auto-rolled back safely.",
        repo: manifest.repo,
        fromVersion: incident.upstream?.currentVersion,
        toVersion: plan.updateTargetVersion
      });
      const result = await escalateIssue(
        adapter,
        manifest,
        incident,
        diagnosis,
        options,
        `Verification failed after ${plan.strategy} at ${verification.failedStep ?? "unknown step"}.`
      );
      await persistState(adapter, manifest, incident, state, {
        lastHeal: {
          status: "escalated",
          strategy: plan.strategy,
          summary: result.summary,
          ts: new Date().toISOString()
        }
      });
      return result;
    }

    const contribution = await prepareContributionDraft(workspaceContext, manifest, {
      summary: diagnosis.summary,
      validation: validationLines(verification)
    });
    let branchUrl: string | undefined;
    let prUrl: string | undefined;
    if (options.auth && options.createPr !== false && manifest.selfHealing?.autoSubmitPr !== false && contribution.allowed) {
      const submitted = await submitContribution(workspaceContext, contribution, options.auth, {
        createPr: true
      });
      branchUrl = submitted.branchUrl;
      prUrl = submitted.prUrl;
    }
    await writeAuditRecord(adapter, manifest, incident, {
      step: "pr_created",
      status: prUrl || branchUrl ? "ok" : "skipped",
      message: prUrl ? "Created pull request from self-heal flow." : "Prepared contribution draft from self-heal flow.",
      repo: manifest.repo,
      fromVersion: incident.upstream?.currentVersion,
      toVersion: plan.updateTargetVersion
    });
    await persistState(adapter, manifest, incident, state, {
      lastHeal: {
        status: "repaired",
        strategy: plan.strategy,
        summary: contribution.prTitle,
        ts: new Date().toISOString()
      }
    });
    return {
      status: "repaired",
      summary: contribution.prTitle,
      strategy: plan.strategy,
      diagnosis,
      verification,
      contribution,
      branchUrl,
      prUrl,
      recommendation: diagnosis.upstreamFixMatch
    };
  } finally {
    await workspace.cleanup();
  }
}
