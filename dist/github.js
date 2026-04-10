import { readFile } from "node:fs/promises";
import { splitRepo, takeNonEmptyLines } from "./utils.js";
function getHeaders(token) {
    const headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "agent-upgrade-kit"
    };
    if (token)
        headers.Authorization = `Bearer ${token}`;
    return headers;
}
export async function fetchLatestRelease(repo, fetchImpl, token, apiBaseUrl = "https://api.github.com") {
    const res = await fetchImpl(`${apiBaseUrl}/repos/${repo}/releases/latest`, { headers: getHeaders(token) });
    if (!res.ok)
        throw new Error(`Failed to fetch latest release: ${res.status}`);
    return (await res.json());
}
export async function fetchLatestTag(repo, fetchImpl, token, apiBaseUrl = "https://api.github.com") {
    const res = await fetchImpl(`${apiBaseUrl}/repos/${repo}/tags?per_page=1`, { headers: getHeaders(token) });
    if (!res.ok)
        throw new Error(`Failed to fetch tags: ${res.status}`);
    const tags = (await res.json());
    if (!tags[0])
        throw new Error("No tags found.");
    return tags[0];
}
export async function fetchHighlights(params) {
    const { repo, currentVersion, latestVersion, changelogSource, fetchImpl, token, apiBaseUrl = "https://api.github.com", cwd } = params;
    if (!changelogSource || changelogSource.type === "release_notes") {
        try {
            const release = await fetchLatestRelease(repo, fetchImpl, token, apiBaseUrl);
            const highlights = takeNonEmptyLines(release.body ?? "", 5);
            return { highlights, compareUrl: release.html_url };
        }
        catch {
            return { highlights: [] };
        }
    }
    if (changelogSource.type === "changelog_file" && changelogSource.path) {
        try {
            const raw = await readFile(new URL(changelogSource.path, `file://${cwd}/`), "utf8");
            return { highlights: takeNonEmptyLines(raw, 5) };
        }
        catch {
            return { highlights: [] };
        }
    }
    if (changelogSource.type === "compare_commits") {
        try {
            const res = await fetchImpl(`${apiBaseUrl}/repos/${repo}/compare/v${currentVersion}...v${latestVersion}`, { headers: getHeaders(token) });
            if (!res.ok)
                throw new Error(String(res.status));
            const compare = (await res.json());
            const messages = (compare.commits ?? [])
                .map((item) => item.commit?.message?.split("\n")[0]?.trim())
                .filter((line) => Boolean(line))
                .slice(0, 5);
            return { highlights: messages, compareUrl: compare.html_url };
        }
        catch {
            return { highlights: [] };
        }
    }
    return { highlights: [] };
}
export async function createGithubIssue(repo, title, body, auth, fetchImpl) {
    const res = await fetchImpl(`${auth.apiBaseUrl ?? "https://api.github.com"}/repos/${repo}/issues`, {
        method: "POST",
        headers: {
            ...getHeaders(auth.token),
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ title, body })
    });
    if (!res.ok)
        throw new Error(`Failed to create issue: ${res.status}`);
    return (await res.json());
}
export async function createGithubPullRequest(repo, params, auth, fetchImpl) {
    const { owner } = splitRepo(repo);
    const res = await fetchImpl(`${auth.apiBaseUrl ?? "https://api.github.com"}/repos/${repo}/pulls`, {
        method: "POST",
        headers: {
            ...getHeaders(auth.token),
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            title: params.title,
            body: params.body,
            head: params.head.includes(":") ? params.head : `${owner}:${params.head}`,
            base: params.base
        })
    });
    if (!res.ok)
        throw new Error(`Failed to create pull request: ${res.status}`);
    return (await res.json());
}
