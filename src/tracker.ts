import * as vscode from "vscode";

export async function getAllFilesContent(): Promise<string> {
  const files = await vscode.workspace.findFiles(
    "**/*",
    "**/{node_modules,go.mod,*.lock,.git}/**",
  );

  let combinedContent = "";

  for (const fileUri of files) {
    try {
      const fileData = await vscode.workspace.fs.readFile(fileUri);

      const content = new TextDecoder("utf-8").decode(fileData);
      combinedContent += `\n--- File: ${fileUri.fsPath} ---\n${content}\n`;
    } catch (e) {
      console.error(`Could not read file ${fileUri.fsPath}:`, e);
    }
  }

  return combinedContent;
}
