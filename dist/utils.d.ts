export declare function splitRepo(repo: string): {
    owner: string;
    repo: string;
};
export declare function resolveFromCwd(cwd: string, maybePath?: string): string | undefined;
export declare function readTextIfExists(filePath?: string): Promise<string | undefined>;
export declare function normalizeVersion(version: string): string;
export declare function compareVersions(left: string, right: string): number;
export declare function takeNonEmptyLines(text: string, limit?: number): string[];
export declare function slugify(input: string): string;
export declare function defaultCachePath(): string;
export declare function formatBulletList(items: string[]): string;
