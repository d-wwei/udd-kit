import { readFile } from "node:fs/promises";

import { ignoreVersion, readCache, rememberUpdateCheck } from "./cache.js";
import { fetchHighlights, fetchLatestRelease, fetchLatestTag } from "./github.js";
import type { CheckForUpdatesOptions, HostContext, UpdateCheckResult, UpgradeManifest } from "./types.js";
import { defaultCachePath, compareVersions, formatBulletList, normalizeVersion, resolveFromCwd } from "./utils.js";

export async function detectCurrentVersion(cwd: string, manifest: UpgradeManifest): Promise<string> {
  const source = manifest.currentVersionSource;
  if (source.type === "literal" && source.value) return normalizeVersion(source.value);
  const filePath = resolveFromCwd(cwd, source.path);
  if (!filePath) throw new Error(`Version source ${source.type} requires a path.`);
  const raw = await readFile(filePath, "utf8");

  if (source.type === "package.json") {
    const parsed = JSON.parse(raw) as { version?: string };
    if (!parsed.version) throw new Error("package.json missing version.");
    return normalizeVersion(parsed.version);
  }

  if (source.type === "pyproject.toml") {
    const match = raw.match(/^version\s*=\s*["']([^"']+)["']/m);
    if (!match) throw new Error("pyproject.toml missing version.");
    return normalizeVersion(match[1]);
  }

  if (source.type === "file") {
    if (!source.key) return normalizeVersion(raw.trim());
    const pattern = new RegExp(`${escapeRegExp(source.key)}\\s*[:=]\\s*["']?([^"'\n]+)`, "m");
    const match = raw.match(pattern);
    if (!match) throw new Error(`Could not find key ${source.key}.`);
    return normalizeVersion(match[1]);
  }

  throw new Error(`Unsupported version source ${source.type}.`);
}

export async function checkForUpdates(
  ctx: HostContext,
  manifest: UpgradeManifest,
  options: CheckForUpdatesOptions = {}
): Promise<UpdateCheckResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const cachePath = options.cachePath ?? defaultCachePath();
  const cacheTtlMs = options.cacheTtlMs ?? 24 * 60 * 60 * 1000;
  const now = new Date().toISOString();
  const currentVersion = normalizeVersion(ctx.appVersion ?? await detectCurrentVersion(ctx.cwd, manifest));
  const cache = await readCache(cachePath);
  const cacheEntry = cache.updates?.[manifest.repo];

  let latestVersion = currentVersion;
  let releaseUrl: string | undefined;
  let ignored = Boolean(cacheEntry?.ignoredVersions?.includes(currentVersion));
  let highlights: string[] = [];
  let compareUrl: string | undefined;

  const shouldRefresh =
    !cacheEntry?.lastCheckedAt ||
    Date.now() - new Date(cacheEntry.lastCheckedAt).getTime() > cacheTtlMs;

  try {
    if (manifest.releaseChannel === "releases") {
      const release = await fetchLatestRelease(manifest.repo, fetchImpl);
      latestVersion = normalizeVersion(release.tag_name);
      releaseUrl = release.html_url;
    } else {
      const tag = await fetchLatestTag(manifest.repo, fetchImpl);
      latestVersion = normalizeVersion(tag.name);
    }
    if (shouldRefresh) {
      const details = await fetchHighlights({
        repo: manifest.repo,
        currentVersion,
        latestVersion,
        changelogSource: manifest.changelogSource,
        fetchImpl,
        cwd: ctx.cwd
      });
      highlights = details.highlights;
      compareUrl = details.compareUrl;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: currentVersion,
      shouldNotify: false,
      highlights: [],
      checkedAt: now,
      ignored: false,
      message: `Could not check updates for ${manifest.repo}: ${message}`
    };
  }

  const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
  ignored = Boolean(cacheEntry?.ignoredVersions?.includes(latestVersion));
  const shouldNotify = hasUpdate && !ignored;

  await rememberUpdateCheck(cachePath, manifest.repo, {
    lastCheckedAt: now,
    lastVersion: latestVersion,
    ignoredVersions: cacheEntry?.ignoredVersions ?? []
  });

  const message = shouldNotify
    ? [
        `Update available for ${ctx.appName}: ${currentVersion} -> ${latestVersion}`,
        highlights.length ? "Highlights:\n" + formatBulletList(highlights.slice(0, 5)) : "Highlights unavailable.",
        manifest.updateInstructions?.command ? `Upgrade command: ${manifest.updateInstructions.command}` : "Upgrade command: check the project README.",
        manifest.updateInstructions?.docsUrl
          ? `Docs: ${manifest.updateInstructions.docsUrl}`
          : releaseUrl ? `Release: ${releaseUrl}` : compareUrl ? `Compare: ${compareUrl}` : "Check GitHub for details.",
        `You can ignore this version by calling ignoreUpdate(${JSON.stringify(latestVersion)}).`
      ].join("\n\n")
    : hasUpdate
      ? `Update ${latestVersion} is available but currently ignored.`
      : `${ctx.appName} is up to date at ${currentVersion}.`;

  return {
    hasUpdate,
    currentVersion,
    latestVersion,
    shouldNotify,
    highlights,
    releaseUrl,
    compareUrl,
    checkedAt: now,
    ignored,
    message
  };
}

export async function ignoreUpdateVersion(
  manifest: UpgradeManifest,
  version: string,
  options: { cachePath?: string } = {}
): Promise<void> {
  await ignoreVersion(options.cachePath ?? defaultCachePath(), manifest.repo, normalizeVersion(version));
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
