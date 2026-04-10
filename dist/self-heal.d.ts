import type { Diagnosis, HealOptions, HealPlan, HealResult, UddAdapter, UpgradeManifest } from "./types.js";
export declare function analyzeIncident(adapter: UddAdapter, manifest: UpgradeManifest, options?: HealOptions): Promise<Diagnosis>;
export declare function planHealing(adapter: UddAdapter, manifest: UpgradeManifest, options?: HealOptions): Promise<HealPlan>;
export declare function healIncident(adapter: UddAdapter, manifest: UpgradeManifest, options?: HealOptions): Promise<HealResult>;
