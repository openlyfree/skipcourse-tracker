import * as vscode from "vscode";
import { chromium, BrowserContext, Page } from "playwright";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

let browser: BrowserContext | null = null;
let page: Page | null = null;

function log(level: "info" | "warn" | "error", message: string) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  console.log(`${prefix} ${message}`);
}

export function getProjectName(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    const name = folders[0].name;
    log("info", `Project name detected: ${name}`);
    return name;
  }
  log("warn", "No workspace folders found, will use default project name");
  return undefined;
}

export function getBrowserPath(): string | undefined {
  const config = vscode.workspace.getConfiguration("skipcourse-tracker");
  const configured = config.get<string>("browserPath");
  if (configured && configured.trim().length > 0) {
    try {
      if (fs.existsSync(configured)) {
        log("info", `Using configured browserPath: ${configured}`);
        return configured;
      }
      log("warn", `Configured browserPath does not exist: ${configured}`);
    } catch (e: any) {
      log("warn", `Could not access configured browserPath ${configured}: ${e?.message || String(e)}`);
    }
  }

  const platform = os.platform();
  const paths: string[] = [];
  log("info", `Platform detected: ${platform}`);

  if (platform === "win32") {
    paths.push(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
      // Edge
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      // Brave
      "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    );
  } else if (platform === "darwin") {
    paths.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  } else {
    paths.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium",
    );
  }

  for (const p of paths) {
    if (!p) continue;
    try {
      if (fs.existsSync(p)) {
        log("info", `Found browser at: ${p}`);
        return p;
      }
    } catch (e: any) {
      // ignore permission errors, continue searching
      log("warn", `Could not access path ${p}: ${e?.message || String(e)}`);
    }
  }

  log("warn", `No browser runtime found in standard paths. Will fall back to Playwright bundled browser.`);
  return undefined; // allow Playwright to use its bundled browser
}

export function getProfilePath(): string {
  const config = vscode.workspace.getConfiguration("skipcourse-tracker");
  const configured = config.get<string>("profilePath");
  if (configured && configured.trim().length > 0) {
    log("info", `Using configured profilePath: ${configured}`);
    return configured;
  }
  const profileRoot = process.env.HOME || process.env.USERPROFILE || "";
  return path.join(profileRoot, ".skipcourse-tracker-profile");
}

export async function resetProfile(): Promise<void> {
  const profilePath = getProfilePath();
  try {
    if (fs.existsSync(profilePath)) {
      log("info", `Removing profile directory: ${profilePath}`);
      fs.rmSync(profilePath, { recursive: true, force: true });
      log("info", "Profile directory removed");
    } else {
      log("info", `Profile path does not exist: ${profilePath}`);
    }
  } catch (e: any) {
    log("error", `Failed to remove profile path ${profilePath}: ${e?.message || String(e)}`);
    throw e;
  }
}

export async function uploadData(code: string) {
  try {
    if (!browser) {
      log("info", "No active browser context, initializing...");
      const executablePath = getBrowserPath();
      const profilePath = getProfilePath();
      log("info", `Using profile path: ${profilePath}`);

      const config = vscode.workspace.getConfiguration("skipcourse-tracker");
      const headed = !!config.get<boolean>("headed");

      const launchOptions: any = { headless: !headed };
      if (executablePath) launchOptions.executablePath = executablePath;

      browser = await chromium.launchPersistentContext(profilePath, launchOptions);
      log("info", "Browser context created");

      page = await browser.newPage();
      log("info", "New page created");
    }

    if (!page) {
      throw new Error("Failed to create page instance");
    }

    log("info", "Navigating to SkipCourse upload page...");
    await page.goto("https://skipcourse.com/upload?type=project", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    log("info", "Page loaded successfully");

    const projectName = getProjectName() || "Coding Project";
    log("info", `Filling project name: ${projectName}`);

    const titleField = page.locator("#title");
    await titleField.waitFor({ state: "visible", timeout: 10000 });
    await titleField.fill(projectName);
    log("info", "Project name field filled");

    const codeSize = Buffer.byteLength(code || "", "utf8");
    log("info", `Filling code field (${(codeSize / 1024).toFixed(2)}KB)...`);

    const descField = page.locator('.ProseMirror[role="textbox"]');
    await descField.waitFor({ state: "visible", timeout: 10000 });
    await descField.click();
    await descField.fill(code);
    log("info", "Code field filled");

    log("info", "Waiting for and clicking submit button...");
    const submitButton = page.locator('button:has-text("Submit Project")');
    await submitButton.waitFor({ state: "attached", timeout: 10000 });
    await submitButton.click();
    log("info", "Submit button clicked");

    // Wait for navigation/confirmation
    await page.waitForURL(/.*upload.*|.*projects.*/, { timeout: 15000 }).catch(() => {
      log("warn", "Timeout waiting for post-upload navigation, but submission may have succeeded");
    });

    log("info", "Upload process completed");
  } catch (error: any) {
    log("error", `Upload failed: ${error?.message || String(error)}`);
    if (error?.stack) {
      log("error", `Stack: ${error.stack}`);
    }
    throw error;
  }
}

export async function login() {
  try {
    log("info", "Starting login flow...");
    const executablePath = getBrowserPath();
    const profilePath = getProfilePath();
    
    log("info", `Launching browser for login (profile: ${profilePath})...`);
    const config = vscode.workspace.getConfiguration("skipcourse-tracker");
    const headed = true; // login should be headed to allow interactive auth

    browser = await chromium.launchPersistentContext(profilePath, {
      headless: !headed,
      executablePath: executablePath || undefined,
    });
    log("info", "Browser launched in headed mode");

    page = await browser.newPage();
    log("info", "Navigating to SkipCourse...");
    await page.goto("https://skipcourse.com/");
    log("info", "SkipCourse page loaded");

    log("info", "Waiting for user login...");
  } catch (error: any) {
    log("error", `Login initialization failed: ${error?.message || String(error)}`);
    throw error;
  }
}
