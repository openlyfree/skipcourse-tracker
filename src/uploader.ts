import { chromium, BrowserContext, Page } from "playwright";
import * as os from "os";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

let browser: BrowserContext | null = null;
let page: Page | null = null;

export function getProjectName(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return folders[0].name;
  }
  return undefined;
}

export function getBrowserPath(): string {
  const platform = os.platform();
  const paths: string[] = [];

  if (platform === "win32") {
    paths.push(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe")
    );
  } else if (platform === "darwin") {
    paths.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    );
  } else {
    paths.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium"
    );
  }

  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  throw new Error("Could not find a local installation of Google Chrome or Chromium. Please install Google Chrome or Chromium to sync.");
}

export async function uploadData(code: string) {
  if (!browser) {
    const executablePath = getBrowserPath();
    browser = await chromium.launchPersistentContext(
      path.join(process.env.HOME || "", ".skipcourse-tracker-profile"),
      {
        headless: true, // turn off for debugging
        executablePath,
      },
    );
    page = await browser.newPage();
    await page.goto("https://skipcourse.com/upload?type=project");

    const titleField = page.locator("#title");
    await titleField.waitFor({ state: "visible" });
    await titleField.fill(getProjectName() || "Coding Project");

    const descField = page.locator('.ProseMirror[role="textbox"]');
    await descField.waitFor({ state: "visible" });
    await descField.click();
    await descField.fill(code);

    const submitButton = page.locator('button:has-text("Submit Project")');
    await submitButton.waitFor({ state: "attached" });
    await submitButton.click();
  }
}

export async function login() {
  const executablePath = getBrowserPath();
  browser = await chromium.launchPersistentContext(
    path.join(process.env.HOME || "", ".skipcourse-tracker-profile"),
    {
      headless: false,
      executablePath,
    },
  );
  page = await browser.newPage();
  await page?.goto("https://skipcourse.com/");
  console.log("logging in");

  vscode.window.showInformationMessage(
    "Please log into SkipCourse to track your work.",
  );
  page.getByText("Login").click();
}

