import type { UddAdapter } from "./types.js";
export declare function execCommand(cmd: string[], cwd: string, adapter?: Pick<UddAdapter, "runCommand">): Promise<string>;
export declare function execShell(command: string, cwd: string, adapter?: Pick<UddAdapter, "runCommand">): Promise<string>;
