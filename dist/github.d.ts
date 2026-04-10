import type { ChangelogSource, GithubAuth } from "./types.js";
type GithubRelease = {
    tag_name: string;
    html_url?: string;
    body?: string;
};
type GithubTag = {
    name: string;
};
export declare function fetchLatestRelease(repo: string, fetchImpl: typeof fetch, token?: string, apiBaseUrl?: string): Promise<GithubRelease>;
export declare function fetchLatestTag(repo: string, fetchImpl: typeof fetch, token?: string, apiBaseUrl?: string): Promise<GithubTag>;
export declare function fetchHighlights(params: {
    repo: string;
    currentVersion: string;
    latestVersion: string;
    changelogSource?: ChangelogSource;
    fetchImpl: typeof fetch;
    token?: string;
    apiBaseUrl?: string;
    cwd: string;
}): Promise<{
    highlights: string[];
    compareUrl?: string;
}>;
export declare function createGithubIssue(repo: string, title: string, body: string, auth: GithubAuth, fetchImpl: typeof fetch): Promise<{
    html_url?: string;
}>;
export declare function createGithubPullRequest(repo: string, params: {
    title: string;
    body: string;
    head: string;
    base: string;
}, auth: GithubAuth, fetchImpl: typeof fetch): Promise<{
    html_url?: string;
}>;
export {};
