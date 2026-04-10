import os from "node:os";
const BUILTIN_PATTERNS = [
    /ghp_[A-Za-z0-9]+/g,
    /github_pat_[A-Za-z0-9_]+/g,
    /sk-[A-Za-z0-9]+/g,
    /Bearer\s+[A-Za-z0-9._-]+/g
];
export function redactText(input, manifest, cwd) {
    let output = input;
    for (const pattern of BUILTIN_PATTERNS) {
        output = output.replace(pattern, "[REDACTED]");
    }
    for (const rawPattern of manifest.privacyRules?.redactPatterns ?? []) {
        try {
            output = output.replace(new RegExp(rawPattern, "g"), "[REDACTED]");
        }
        catch {
            continue;
        }
    }
    const sensitiveRoots = [cwd, os.homedir()].filter(Boolean);
    for (const root of sensitiveRoots) {
        output = output.split(root).join("[PATH]");
    }
    return output;
}
