import * as vscode from "vscode";

function log(level: "info" | "warn" | "error", message: string) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [TRACKER] [${level.toUpperCase()}]`;
  console.log(`${prefix} ${message}`);
}

export async function getAllFilesContent(): Promise<string> {
  log("info", "Starting workspace file discovery...");
  const startTime = Date.now();

  const files = await vscode.workspace.findFiles(
    "**/*",
    "**/{node_modules,go.mod,*.lock,.git}/**",
  );

  log("info", `Discovered ${files.length} candidate files`);

  let combinedContent = "";
  let successCount = 0;
  let skippedCount = 0;

  for (const fileUri of files) {
    try {
      const fileData = await vscode.workspace.fs.readFile(fileUri);

      // Heuristic: skip binary files containing NUL bytes
      const hasNull = fileData.includes(0);
      if (hasNull) {
        log("warn", `Skipping binary file: ${fileUri.fsPath}`);
        skippedCount++;
        continue;
      }

      const content = new TextDecoder("utf-8").decode(fileData);

      // Skip files that are too large to reasonably paste into a textbox
      if (content.length > 5 * 1024 * 1024) {
        log("warn", `Skipping large file (${(content.length / 1024 / 1024).toFixed(2)}MB): ${fileUri.fsPath}`);
        skippedCount++;
        continue;
      }

      combinedContent += `\n--- File: ${fileUri.fsPath} ---\n${content}\n`;
      successCount++;
    } catch (e: any) {
      log("warn", `Could not read file ${fileUri.fsPath}: ${e?.message || String(e)}`);
      skippedCount++;
    }
  }

  const duration = Date.now() - startTime;
  const totalSizeKB = Buffer.byteLength(combinedContent || "", "utf8") / 1024;
  log("info", `Aggregation finished in ${duration}ms. Included: ${successCount}, Skipped: ${skippedCount}, Total size: ${totalSizeKB.toFixed(2)}KB`);

  return combinedContent;
}
