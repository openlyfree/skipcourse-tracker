# SkipCourse Tracker VS Code Extension

**SkipCourse Tracker** is a VS Code extension designed to streamline syncing your local coding projects directly to [SkipCourse](https://skipcourse.com). It aggregates your workspace files and uploads them using automated browser interactions powered by Playwright.

---

## Features

- ** Direct Workspace Syncing**: Upload your current project's code files directly to SkipCourse with a single click or command.
- ** Status Bar Integration**: Access sync functionality instantly via the status bar item labeled `Sync to SkipCourse`.
- ** Automated First-time Login**: Prompts for login and opens a Playwright browser window to log in to SkipCourse, storing your session profile locally.
- ** Smart Workspace Exclusion**: Automatically ignores large dependencies and lockfiles (such as `node_modules`, `go.mod`, `.git`, `.lock` files) to ensure fast and lightweight uploads.
- ** Automatic Metadata Detection**: Infers the upload project name dynamically from your VS Code workspace name.

---

## How It Works

1. **Authentication**: On extension activation, the tracker checks for a stored browser profile in your home directory (`~/.skipcourse-tracker-profile`). If missing, it launches a visible browser window allowing you to log in to SkipCourse.
2. **Aggregation**: The extension runs a workspace search ([vscode.workspace.findFiles](https://code.visualstudio.com/api/references/vscode-api#workspace)) to gather all relevant code files. It decodes and compiles them into a single formatted payload.
3. **Upload**: It automates a headless Playwright browser instance, navigates to the project upload page, populates the project details (workspace name and codebase contents), and submits the project.

---

## Installation

### From Source

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/skipcourse-tracker.git
   cd skipcourse-tracker
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Compile the extension:
   ```bash
   npm run compile
   ```
4. Press `F5` in VS Code to open a Development Host window with the extension loaded, or package it using `vsce`:
   ```bash
   npx @vscode/vsce package
   ```

---

## Commands

This extension contributes the following command:

- `skipcourse-tracker.manualUpload` (Title: **SkipCourse Upload**): Synchronizes the active workspace files with SkipCourse. Can be run from the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).

---

## Requirements

- **VS Code** `^1.125.0` or higher.
- **Playwright** browser binaries. Playwright will use Chrome / Chromium depending on the platform settings. If needed, you can install Playwright dependencies by running:
  ```bash
  npx playwright install chromium
  ```

---

## Extension Settings

_This extension does not currently contribute any custom user settings._ It stores your session state in your user home directory under `~/.skipcourse-tracker-profile`.

---

## Known Issues

- Please ensure your internet connection is stable when performing a manual sync.
- If you run into issues with Playwright browser startup, ensure that your system has the required dependencies to run Chromium.
- If you change your account's password or enter it wrong on setup, remove the directory under `~/.skipcourse-tracker-profile` to reset the extension and log in again.

---

## License

This project is licensed under the MIT License.
