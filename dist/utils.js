import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
export function splitRepo(repo) {
    const [owner, name] = repo.split("/");
    if (!owner || !name) {
        throw new Error(`Invalid repo value "${repo}". Expected "owner/name".`);
    }
    return { owner, repo: name };
}
export function resolveFromCwd(cwd, maybePath) {
    if (!maybePath)
        return undefined;
    return path.isAbsolute(maybePath) ? maybePath : path.join(cwd, maybePath);
}
export async function readTextIfExists(filePath) {
    if (!filePath)
        return undefined;
    try {
        return await readFile(filePath, "utf8");
    }
    catch {
        return undefined;
    }
}
export function normalizeVersion(version) {
    return version.trim().replace(/^v/, "");
}
export function compareVersions(left, right) {
    const l = normalizeVersion(left).split(/[.-]/).map(toNumberish);
    const r = normalizeVersion(right).split(/[.-]/).map(toNumberish);
    const len = Math.max(l.length, r.length);
    for (let i = 0; i < len; i += 1) {
        const a = l[i] ?? 0;
        const b = r[i] ?? 0;
        if (typeof a === "number" && typeof b === "number") {
            if (a !== b)
                return a > b ? 1 : -1;
            continue;
        }
        const sa = String(a);
        const sb = String(b);
        if (sa !== sb)
            return sa > sb ? 1 : -1;
    }
    return 0;
}
function toNumberish(value) {
    return /^\d+$/.test(value) ? Number(value) : value;
}
export function takeNonEmptyLines(text, limit = 5) {
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, limit);
}
export function slugify(input) {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "update";
}
export function defaultCachePath() {
    return path.join(os.homedir(), ".agent-upgrade-kit", "cache.json");
}
export function formatBulletList(items) {
    return items.map((item) => `- ${item}`).join("\n");
}
