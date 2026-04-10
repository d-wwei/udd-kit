import type { AdapterContextOverrides, HostContext, UddAdapter } from "./types.js";
export declare function defineAdapter(input: UddAdapter): UddAdapter;
export declare function resolveAdapterContext(adapter: UddAdapter, overrides?: AdapterContextOverrides): Promise<HostContext>;
