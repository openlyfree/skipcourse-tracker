import { chromium, BrowserContext, Page } from "playwright";
import * as os from "os";
import * as vscode from "vscode";
import path from "path";
let browser: BrowserContext | null = null;
let page: Page | null = null;

export function getProjectName(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return folders[0].name;
  }
  return undefined;
}

export async function uploadData(code: string) {
  if (!browser) {
    browser = await chromium.launchPersistentContext(
      path.join(process.env.HOME || "", ".skipcourse-tracker-profile"),
      {
        headless: true,//turn off for debugging
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
  browser = await chromium.launchPersistentContext(
    path.join(process.env.HOME || "", ".skipcourse-tracker-profile"),
    {
      headless: false,
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

export async function getBrowserPath() {
  const platform = os.platform();
  if (platform === "win32") {
    return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  }
  if (platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }
  return "/usr/bin/chromium";
}
