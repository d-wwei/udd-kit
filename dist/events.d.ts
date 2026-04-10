import type { ContributionDraft, Diagnosis, HealPlan, HealResult, HostError, IssueDraft, UpdateCheckResult, UpstreamFixMatch } from "./types.js";
export type UddEventMap = {
    "update:available": UpdateCheckResult;
    "update:fixes-local-error": {
        update: UpdateCheckResult;
        match: UpstreamFixMatch;
        error: HostError;
    };
    "diagnosis:completed": Diagnosis;
    "heal:started": HealPlan;
    "heal:completed": HealResult;
    "heal:failed": {
        error: Error;
        plan?: HealPlan;
    };
    "issue:drafted": IssueDraft;
    "contribution:drafted": ContributionDraft;
    "watch:tick": {
        ts: string;
        cycle: number;
    };
};
export declare class UddEventBus {
    private emitter;
    on<K extends keyof UddEventMap>(event: K, listener: (data: UddEventMap[K]) => void): this;
    off<K extends keyof UddEventMap>(event: K, listener: (data: UddEventMap[K]) => void): this;
    once<K extends keyof UddEventMap>(event: K, listener: (data: UddEventMap[K]) => void): this;
    emit<K extends keyof UddEventMap>(event: K, data: UddEventMap[K]): boolean;
    removeAllListeners(event?: keyof UddEventMap): this;
}
