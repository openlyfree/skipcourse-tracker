import * as vscode from "vscode";
import { login, uploadData, getProfilePath, resetProfile } from "./uploader";
import * as fs from "fs";
import { getAllFilesContent } from "./tracker";

const outputChannel = vscode.window.createOutputChannel("SkipCourse Tracker");

function log(level: "info" | "warn" | "error", message: string) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  outputChannel.appendLine(`${prefix} ${message}`);
  if (level === "error") {
    console.error(message);
  } else if (level === "warn") {
    console.warn(message);
  } else {
    console.log(message);
  }
}

export function activate(context: vscode.ExtensionContext) {
  log("info", "SkipCourse Tracker extension activating...");

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBarItem.text = "$(cloud-upload) Sync to SkipCourse";
  statusBarItem.command = "skipcourse-tracker.manualUpload";
  statusBarItem.show();

  let disposable = vscode.commands.registerCommand(
    "skipcourse-tracker.manualUpload",
    async () => {
      outputChannel.show();
      const editor = vscode.window.activeTextEditor;
      
      if (!editor) {
        log("error", "No active editor found - cannot proceed with sync");
        vscode.window.showErrorMessage("No active file to sync!");
        return;
      }

      log("info", `Starting sync from workspace: ${vscode.workspace.name || "unknown"}`);
      const startTime = Date.now();

      try {
        vscode.window.showInformationMessage("Syncing code to SkipCourse...");
        log("info", "Aggregating workspace files...");

        let files_content = await getAllFilesContent();
        const fileSize = Buffer.byteLength(files_content || "", "utf8");
        log("info", `Files aggregated successfully. Total size: ${(fileSize / 1024).toFixed(2)}KB`);

        if (!files_content || files_content.trim().length === 0) {
          log("warn", "No files found in workspace");
          vscode.window.showWarningMessage("No code files found to sync.");
          return;
        }

        log("info", "Uploading data to SkipCourse...");
        await uploadData(files_content);

        const duration = Date.now() - startTime;
        log("info", `Sync successful! Duration: ${duration}ms`);
        vscode.window.showInformationMessage("✓ Sync successful!");
      } catch (error: any) {
        const duration = Date.now() - startTime;
        const errMsg = error?.message || String(error);
        log("error", `Sync failed after ${duration}ms: ${errMsg}`);
        if (error?.stack) {
          log("error", `Stack trace: ${error.stack}`);
        }
        vscode.window.showErrorMessage(`Sync failed: ${errMsg}`);
      }
    },
  );

  const profilePath = getProfilePath();

  if (!fs.existsSync(profilePath)) {
    log("info", "First time setup detected. Prompting user to log in...");
    vscode.window.showInformationMessage(
      "First time setup: Please log in to SkipCourse.",
    );
    login();
  } else {
    log("info", "Existing session profile found");
  }

  let resetDisposable = vscode.commands.registerCommand("skipcourse-tracker.resetProfile", async () => {
    outputChannel.show();
    log("info", "Reset profile command invoked");
    const confirmed = await vscode.window.showWarningMessage("Reset SkipCourse profile and require re-login?", { modal: true }, "Reset");
    if (confirmed !== "Reset") {
      log("info", "User cancelled profile reset");
      return;
    }

    try {
      await resetProfile();
      vscode.window.showInformationMessage("SkipCourse profile reset. Please log in again.");
      log("info", "Profile reset completed, launching login flow");
      login();
    } catch (e: any) {
      log("error", `Reset profile failed: ${e?.message || String(e)}`);
      vscode.window.showErrorMessage(`Failed to reset profile: ${e?.message || String(e)}`);
    }
  });

  context.subscriptions.push(statusBarItem, disposable, resetDisposable);
  log("info", "SkipCourse Tracker extension activated successfully");
}

export function deactivate() {
  log("info", "SkipCourse Tracker extension deactivated");
}
