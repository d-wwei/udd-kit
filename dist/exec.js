import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
export async function execCommand(cmd, cwd, adapter) {
    if (adapter?.runCommand) {
        return adapter.runCommand(cmd, cwd);
    }
    const [file, ...args] = cmd;
    const { stdout } = await execFileAsync(file, args, { cwd });
    return stdout.trim();
}
export async function execShell(command, cwd, adapter) {
    if (adapter?.runCommand) {
        return adapter.runCommand(["sh", "-lc", command], cwd);
    }
    const { stdout } = await execFileAsync("sh", ["-lc", command], { cwd });
    return stdout.trim();
}
