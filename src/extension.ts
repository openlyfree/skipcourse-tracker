import * as vscode from "vscode";
import { login, uploadZip, getProfilePath, resetProfile } from "./uploader";
import { createWorkspaceZip } from "./tracker";
import * as fs from "fs";

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

      if (!vscode.workspace.workspaceFolders?.length) {
        log("error", "No workspace folder open");
        vscode.window.showErrorMessage("Open a folder/workspace before syncing to SkipCourse.");
        return;
      }

      log("info", `Starting ZIP sync from workspace: ${vscode.workspace.name || "unknown"}`);
      const startTime = Date.now();
      let zipPath: string | undefined;

      try {
        vscode.window.showInformationMessage("Packaging workspace ZIP for SkipCourse...");
        log("info", "Building workspace ZIP...");

        const zipResult = await createWorkspaceZip();
        zipPath = zipResult.zipPath;
        log(
          "info",
          `ZIP ready: ${zipResult.fileCount} files, ${(zipResult.sizeBytes / 1024).toFixed(1)}KB (${zipResult.skippedCount} skipped)`,
        );

        vscode.window.showInformationMessage("Uploading ZIP to SkipCourse...");
        log("info", "Uploading ZIP via Playwright...");

        await uploadZip(zipPath, {
          projectName: zipResult.projectName,
          description: `Workspace upload from VS Code: ${zipResult.projectName}`,
        });

        const duration = Date.now() - startTime;
        log("info", `ZIP sync successful! Duration: ${duration}ms`);
        vscode.window.showInformationMessage("✓ ZIP sync successful!");
      } catch (error: unknown) {
        const duration = Date.now() - startTime;
        const errMsg = error instanceof Error ? error.message : String(error);
        log("error", `Sync failed after ${duration}ms: ${errMsg}`);
        if (error instanceof Error && error.stack) {
          log("error", `Stack trace: ${error.stack}`);
        }
        vscode.window.showErrorMessage(`Sync failed: ${errMsg}`);
      } finally {
        if (zipPath) {
          try {
            fs.unlinkSync(zipPath);
            log("info", `Cleaned up temp ZIP: ${zipPath}`);
          } catch {
            // ignore cleanup errors
          }
        }
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
    const confirmed = await vscode.window.showWarningMessage(
      "Reset SkipCourse profile and require re-login?",
      { modal: true },
      "Reset",
    );
    if (confirmed !== "Reset") {
      log("info", "User cancelled profile reset");
      return;
    }

    try {
      await resetProfile();
      vscode.window.showInformationMessage("SkipCourse profile reset. Please log in again.");
      log("info", "Profile reset completed, launching login flow");
      login();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      log("error", `Reset profile failed: ${message}`);
      vscode.window.showErrorMessage(`Failed to reset profile: ${message}`);
    }
  });

  context.subscriptions.push(statusBarItem, disposable, resetDisposable);
  log("info", "SkipCourse Tracker extension activated successfully");
}

export function deactivate() {
  log("info", "SkipCourse Tracker extension deactivated");
}
