import type { UddAdapter, UddPersistentState, UpgradeManifest } from "./types.js";
export declare function readPersistentState(adapter: UddAdapter, manifest: UpgradeManifest, cwd: string): Promise<UddPersistentState>;
export declare function writePersistentState(adapter: UddAdapter, manifest: UpgradeManifest, cwd: string, state: UddPersistentState): Promise<void>;
