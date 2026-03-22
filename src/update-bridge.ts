import type {
  HostContext,
  UpdateProvider,
  UpdateProviderKind,
  UpdateRequest,
  UddAdapter,
  UpgradeManifest
} from "./types.js";

export async function listAvailableUpdateProviders(adapter: UddAdapter): Promise<UpdateProvider[]> {
  const providers = (await adapter.getUpdateProviders?.()) ?? [];
  const checks = await Promise.all(
    providers.map(async (provider) => ({
      provider,
      available: provider.isAvailable ? await provider.isAvailable() : true
    }))
  );
  return checks.filter((item) => item.available).map((item) => item.provider);
}

export async function resolveUpdateProvider(
  adapter: UddAdapter,
  manifest: UpgradeManifest
): Promise<UpdateProvider | undefined> {
  const providers = await listAvailableUpdateProviders(adapter);
  const order = manifest.selfHealing?.updateStrategyOrder ?? ["update-kit", "host-native", "manual"];
  for (const kind of order) {
    const match = providers.find((provider) => provider.kind === kind);
    if (match) return match;
  }
  return undefined;
}

export async function planUpdateProvider(
  provider: UpdateProvider,
  request: UpdateRequest
): Promise<{ kind: UpdateProviderKind; manualSteps?: string[]; targetVersion?: string }> {
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

export function buildUpdateRequest(ctx: HostContext, manifest: UpgradeManifest): UpdateRequest {
  return {
    repo: manifest.repo,
    currentVersion: ctx.upstream?.currentVersion ?? ctx.appVersion,
    targetVersion: ctx.upstream?.latestVersion,
    cwd: ctx.cwd,
    reason: ctx.error?.message ?? "upstream update requested"
  };
}
