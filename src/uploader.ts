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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      log("warn", `Could not access configured browserPath ${configured}: ${message}`);
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
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      log("warn", `Could not access path ${p}: ${message}`);
    }
  }

  log("warn", `No browser runtime found in standard paths. Will fall back to Playwright bundled browser.`);
  return undefined;
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
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    log("error", `Failed to remove profile path ${profilePath}: ${message}`);
    throw e;
  }
}

async function ensureBrowser(): Promise<Page> {
  if (!browser) {
    log("info", "No active browser context, initializing...");
    const executablePath = getBrowserPath();
    const profilePath = getProfilePath();
    log("info", `Using profile path: ${profilePath}`);

    const config = vscode.workspace.getConfiguration("skipcourse-tracker");
    const headed = !!config.get<boolean>("headed");

    const launchOptions: {
      headless: boolean;
      executablePath?: string;
    } = { headless: !headed };
    if (executablePath) {
      launchOptions.executablePath = executablePath;
    }

    browser = await chromium.launchPersistentContext(profilePath, launchOptions);
    log("info", "Browser context created");

    page = await browser.newPage();
    log("info", "New page created");
  }

  if (!page) {
    throw new Error("Failed to create page instance");
  }
  return page;
}

/**
 * Upload a workspace ZIP via Playwright against the SkipCourse project upload page.
 * Selects the zip through the file input (agentic pre-processor path), then submits.
 */
export async function uploadZip(
  zipPath: string,
  options?: { projectName?: string; description?: string },
): Promise<void> {
  try {
    if (!fs.existsSync(zipPath)) {
      throw new Error(`ZIP file not found: ${zipPath}`);
    }

    const zipSize = fs.statSync(zipPath).size;
    log("info", `Preparing ZIP upload (${(zipSize / 1024).toFixed(1)}KB): ${zipPath}`);

    const activePage = await ensureBrowser();

    log("info", "Navigating to SkipCourse upload page...");
    await activePage.goto("https://skipcourse.com/upload?type=project", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    log("info", "Page loaded successfully");

    // Ensure Upload & Analyze mode (not Diarize Audio)
    const uploadTab = activePage.locator('button:has-text("Upload & Analyze")');
    if (await uploadTab.count()) {
      await uploadTab.first().click({ timeout: 5000 }).catch(() => undefined);
    }

    const projectName = options?.projectName || getProjectName() || "Coding Project";
    log("info", `Filling project name: ${projectName}`);

    const titleField = activePage.locator("#title");
    await titleField.waitFor({ state: "visible", timeout: 15000 });
    await titleField.fill(projectName);
    log("info", "Project name field filled");

    if (options?.description) {
      const descField = activePage.locator('.ProseMirror[role="textbox"]');
      if (await descField.count()) {
        await descField.first().click();
        await descField.first().fill(options.description);
        log("info", "Description field filled");
      }
    }

    // react-dropzone exposes a hidden file input; setInputFiles triggers onDrop with the ZIP
    const fileInput = activePage.locator('input[type="file"]').first();
    await fileInput.waitFor({ state: "attached", timeout: 10000 });
    log("info", "Setting ZIP on file input...");
    await fileInput.setInputFiles(zipPath);
    log("info", "ZIP attached via file input");

    // Wait until the selected ZIP appears in the Files list
    const zipName = path.basename(zipPath);
    await activePage
      .locator(`text=${zipName}`)
      .first()
      .waitFor({ state: "visible", timeout: 20000 })
      .catch(async () => {
        // Fallback: notice toast for ZIP added
        await activePage
          .locator("text=/ZIP added|\\.zip/i")
          .first()
          .waitFor({ state: "visible", timeout: 10000 })
          .catch(() => {
            log("warn", "Could not confirm ZIP in UI list; continuing to submit");
          });
      });

    log("info", "Waiting for and clicking submit button...");
    const submitButton = activePage.locator('button:has-text("Submit Project")');
    await submitButton.waitFor({ state: "attached", timeout: 10000 });

    // Submit may stay disabled until ZIP lands in selectedFiles — wait until enabled
    await activePage
      .waitForFunction(
        () => {
          const buttons = Array.from(document.querySelectorAll("button"));
          const submit = buttons.find((b) => /Submit Project/i.test(b.textContent || ""));
          return !!submit && !submit.hasAttribute("disabled") && !(submit as HTMLButtonElement).disabled;
        },
        undefined,
        { timeout: 20000 },
      )
      .catch(() => {
        log("warn", "Submit button may still be disabled; attempting click anyway");
      });

    await submitButton.click();
    log("info", "Submit button clicked");

    // Wait for celebration / processing / navigation after ZIP submit
    await Promise.race([
      activePage.waitForURL(/assessment\/processing|projects|match/i, { timeout: 120000 }),
      activePage.locator("text=/Submission Complete|Code project submitted|Assessment submitted/i").first().waitFor({
        state: "visible",
        timeout: 120000,
      }),
      activePage.locator("text=/Extracting and analyzing code|Uploading code archive/i").first().waitFor({
        state: "visible",
        timeout: 60000,
      }),
    ]).catch(() => {
      log("warn", "Timeout waiting for post-upload confirmation; submission may still have succeeded");
    });

    log("info", "ZIP upload process completed");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log("error", `Upload failed: ${message}`);
    if (error instanceof Error && error.stack) {
      log("error", `Stack: ${error.stack}`);
    }
    throw error;
  }
}

/** @deprecated Use uploadZip — kept temporarily for callers still expecting paste upload. */
export async function uploadData(code: string) {
  log("warn", "uploadData(paste) is deprecated; use uploadZip instead");
  void code;
  throw new Error("Text paste upload has been replaced by ZIP upload. Use uploadZip().");
}

export async function login() {
  try {
    log("info", "Starting login flow...");
    const executablePath = getBrowserPath();
    const profilePath = getProfilePath();

    log("info", `Launching browser for login (profile: ${profilePath})...`);
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log("error", `Login initialization failed: ${message}`);
    throw error;
  }
}
