import * as vscode from "vscode";
import { login, uploadData } from "./uploader";
import path from "path";
import * as fs from "fs";
import { getAllFilesContent } from "./tracker";

export function activate(context: vscode.ExtensionContext) {
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
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        vscode.window.showInformationMessage("Syncing code to SkipCourse...");
        try {
          await uploadData(await getAllFilesContent());
          vscode.window.showInformationMessage("Sync successful!");
        } catch (error: any) {
          console.error(error);
          const errMsg = error?.message || String(error);
          vscode.window.showErrorMessage(`Sync failed: ${errMsg}`);
        }
      } else {
        vscode.window.showErrorMessage("No active file to sync!");
      }
    },
  );
  const profilePath = path.join(
    process.env.HOME || "",
    ".skipcourse-tracker-profile",
  );

  if (!fs.existsSync(profilePath)) {
    vscode.window.showInformationMessage(
      "First time setup: Please log in to SkipCourse.",
    );
    login();
  }

  context.subscriptions.push(statusBarItem, disposable);
}

export function deactivate() {}
