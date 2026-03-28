import { EventEmitter } from "node:events";

import type {
  ContributionDraft,
  Diagnosis,
  HealPlan,
  HealResult,
  HostError,
  IssueDraft,
  UpdateCheckResult,
  UpstreamFixMatch
} from "./types.js";

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
  "heal:failed": { error: Error; plan?: HealPlan };
  "issue:drafted": IssueDraft;
  "contribution:drafted": ContributionDraft;
  "watch:tick": { ts: string; cycle: number };
};

export class UddEventBus {
  private emitter = new EventEmitter();

  on<K extends keyof UddEventMap>(event: K, listener: (data: UddEventMap[K]) => void): this {
    this.emitter.on(event, listener);
    return this;
  }

  off<K extends keyof UddEventMap>(event: K, listener: (data: UddEventMap[K]) => void): this {
    this.emitter.off(event, listener);
    return this;
  }

  once<K extends keyof UddEventMap>(event: K, listener: (data: UddEventMap[K]) => void): this {
    this.emitter.once(event, listener);
    return this;
  }

  emit<K extends keyof UddEventMap>(event: K, data: UddEventMap[K]): boolean {
    return this.emitter.emit(event, data);
  }

  removeAllListeners(event?: keyof UddEventMap): this {
    this.emitter.removeAllListeners(event);
    return this;
  }
}
