export function defineAdapter(input) {
    return input;
}
export async function resolveAdapterContext(adapter, overrides = {}) {
    const base = await adapter.getContext(overrides);
    return {
        ...base,
        ...overrides,
        confirm: overrides.confirm ?? base.confirm
    };
}
