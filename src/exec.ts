import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { UddAdapter } from "./types.js";

const execFileAsync = promisify(execFile);

export async function execCommand(
  cmd: string[],
  cwd: string,
  adapter?: Pick<UddAdapter, "runCommand">
): Promise<string> {
  if (adapter?.runCommand) {
    return adapter.runCommand(cmd, cwd);
  }
  const [file, ...args] = cmd;
  const { stdout } = await execFileAsync(file, args, { cwd });
  return stdout.trim();
}

export async function execShell(
  command: string,
  cwd: string,
  adapter?: Pick<UddAdapter, "runCommand">
): Promise<string> {
  if (adapter?.runCommand) {
    return adapter.runCommand(["sh", "-lc", command], cwd);
  }
  const { stdout } = await execFileAsync("sh", ["-lc", command], { cwd });
  return stdout.trim();
}
