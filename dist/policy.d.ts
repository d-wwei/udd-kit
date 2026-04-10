import type { HealPlan, HostContext, UddAdapter, UddDecision, UddPersistentState, UpgradeManifest } from "./types.js";
export declare function resolveHealDecision(adapter: UddAdapter, plan: HealPlan, manifest: UpgradeManifest, state: UddPersistentState, ctx: HostContext): Promise<UddDecision>;
