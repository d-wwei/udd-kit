export async function listAvailableUpdateProviders(adapter) {
    const providers = (await adapter.getUpdateProviders?.()) ?? [];
    const checks = await Promise.all(providers.map(async (provider) => ({
        provider,
        available: provider.isAvailable ? await provider.isAvailable() : true
    })));
    return checks.filter((item) => item.available).map((item) => item.provider);
}
export async function resolveUpdateProvider(adapter, manifest) {
    const providers = await listAvailableUpdateProviders(adapter);
    const order = manifest.selfHealing?.updateStrategyOrder ?? ["update-kit", "host-native", "manual"];
    for (const kind of order) {
        const match = providers.find((provider) => provider.kind === kind);
        if (match)
            return match;
    }
    return undefined;
}
export async function planUpdateProvider(provider, request) {
    if (provider.kind === "manual") {
        return {
            kind: provider.kind,
            manualSteps: await provider.describeManualSteps?.(request) ?? [
                `Fetch upstream updates for ${request.repo}.`,
                "Install the updated version in your host environment.",
                "Re-run verification hooks after the update."
            ],
            targetVersion: request.targetVersion
        };
    }
    const plan = provider.plan ? await provider.plan(request) : undefined;
    return {
        kind: provider.kind,
        targetVersion: plan?.targetVersion ?? request.targetVersion
    };
}
export function buildUpdateRequest(ctx, manifest) {
    return {
        repo: manifest.repo,
        currentVersion: ctx.upstream?.currentVersion ?? ctx.appVersion,
        targetVersion: ctx.upstream?.latestVersion,
        cwd: ctx.cwd,
        reason: ctx.error?.message ?? "upstream update requested"
    };
}
