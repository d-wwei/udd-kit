type CacheState = {
    updates?: Record<string, {
        lastCheckedAt: string;
        lastVersion?: string;
        ignoredVersions?: string[];
    }>;
};
export declare function readCache(cachePath: string): Promise<CacheState>;
export declare function writeCache(cachePath: string, state: CacheState): Promise<void>;
export declare function rememberUpdateCheck(cachePath: string, repo: string, payload: {
    lastCheckedAt: string;
    lastVersion?: string;
    ignoredVersions?: string[];
}): Promise<void>;
export declare function ignoreVersion(cachePath: string, repo: string, version: string): Promise<void>;
export {};
