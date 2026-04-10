export async function runRepairAgent(adapter, ctx, diagnosis, manifest, workspacePath) {
    if (!adapter.invokeRepairAgent) {
        throw new Error("Repair agent is not available on this adapter.");
    }
    return adapter.invokeRepairAgent({
        incident: ctx,
        diagnosis,
        workspacePath,
        constraints: {
            protectedPaths: manifest.repair?.protectedPaths,
            maxFilesChanged: manifest.repair?.maxFilesChanged
        }
    });
}
