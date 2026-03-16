import type { AdapterContextOverrides, HostContext, UddAdapter } from "./types.js";

export function defineAdapter(input: UddAdapter): UddAdapter {
  return input;
}

export async function resolveAdapterContext(
  adapter: UddAdapter,
  overrides: AdapterContextOverrides = {}
): Promise<HostContext> {
  const base = await adapter.getContext(overrides);
  return {
    ...base,
    ...overrides,
    confirm: overrides.confirm ?? base.confirm
  };
}
