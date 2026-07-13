import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import JSZip from "jszip";

function log(level: "info" | "warn" | "error", message: string) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [TRACKER] [${level.toUpperCase()}]`;
  console.log(`${prefix} ${message}`);
}

/** Globs ignored when building the upload ZIP (noise / deps / binaries). */
const EXCLUDE_GLOB =
  "**/{node_modules,.git,.svn,.hg,dist,build,out,target,.venv,venv,__pycache__,.idea,.vscode,.next,.turbo,coverage,.gradle,bin,obj,tmp,temp}/**";

const EXCLUDED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".webp",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".mp3",
  ".mp4",
  ".wav",
  ".avi",
  ".mov",
  ".db",
  ".sqlite",
  ".sqlite3",
  ".bin",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".class",
  ".pyc",
  ".pyo",
  ".woff",
  ".woff2",
  ".eot",
  ".ttf",
  ".svg",
  ".lock",
  ".log",
  ".map",
]);

const EXCLUDED_FILENAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "poetry.lock",
  ".ds_store",
  ".gitignore",
  ".env",
  ".env.local",
  ".env.production",
]);

const MAX_FILE_BYTES = 300 * 1024; // match agentic pre-processor soft cap
const MAX_ZIP_BYTES = 40 * 1024 * 1024;

function toZipPath(fileUri: vscode.Uri, workspaceRoot: vscode.Uri): string {
  const rel = path.relative(workspaceRoot.fsPath, fileUri.fsPath);
  // ZIP paths should use forward slashes
  return rel.split(path.sep).join("/");
}

function shouldSkipFile(relPath: string, size: number): string | null {
  const base = path.basename(relPath).toLowerCase();
  const ext = path.extname(relPath).toLowerCase();

  if (EXCLUDED_FILENAMES.has(base)) {
    return "excluded filename";
  }
  if (EXCLUDED_EXTENSIONS.has(ext)) {
    return "excluded extension";
  }
  if (size > MAX_FILE_BYTES) {
    return `too large (${(size / 1024).toFixed(0)}KB)`;
  }
  return null;
}

export interface ZipBuildResult {
  zipPath: string;
  fileCount: number;
  skippedCount: number;
  sizeBytes: number;
  projectName: string;
}

/**
 * Aggregate the active workspace into a temporary ZIP archive for SkipCourse upload.
 */
export async function createWorkspaceZip(): Promise<ZipBuildResult> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    throw new Error("No workspace folder open");
  }

  const workspaceRoot = folders[0].uri;
  const projectName = folders[0].name;
  log("info", `Starting ZIP build for workspace: ${projectName}`);
  const startTime = Date.now();

  const files = await vscode.workspace.findFiles("**/*", EXCLUDE_GLOB);
  log("info", `Discovered ${files.length} candidate files`);

  const zip = new JSZip();
  let fileCount = 0;
  let skippedCount = 0;

  for (const fileUri of files) {
    try {
      const relPath = toZipPath(fileUri, workspaceRoot);
      if (!relPath || relPath.startsWith("..")) {
        skippedCount++;
        continue;
      }

      const fileData = await vscode.workspace.fs.readFile(fileUri);
      const size = fileData.byteLength;

      const skipReason = shouldSkipFile(relPath, size);
      if (skipReason) {
        log("warn", `Skipping ${relPath}: ${skipReason}`);
        skippedCount++;
        continue;
      }

      // Skip likely binaries (NUL byte heuristic)
      if (fileData.includes(0)) {
        log("warn", `Skipping binary file: ${relPath}`);
        skippedCount++;
        continue;
      }

      zip.file(relPath, Buffer.from(fileData));
      fileCount++;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      log("warn", `Could not read file ${fileUri.fsPath}: ${message}`);
      skippedCount++;
    }
  }

  if (fileCount === 0) {
    throw new Error("No uploadable code files found in workspace");
  }

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  if (zipBuffer.byteLength > MAX_ZIP_BYTES) {
    throw new Error(
      `ZIP too large (${(zipBuffer.byteLength / 1024 / 1024).toFixed(1)}MB). Remove large assets and try again.`,
    );
  }

  const zipPath = path.join(
    os.tmpdir(),
    `skipcourse-${projectName.replace(/[^a-zA-Z0-9._-]/g, "_")}-${Date.now()}.zip`,
  );
  fs.writeFileSync(zipPath, zipBuffer);

  const duration = Date.now() - startTime;
  log(
    "info",
    `ZIP built in ${duration}ms. Files: ${fileCount}, Skipped: ${skippedCount}, Size: ${(zipBuffer.byteLength / 1024).toFixed(1)}KB -> ${zipPath}`,
  );

  return {
    zipPath,
    fileCount,
    skippedCount,
    sizeBytes: zipBuffer.byteLength,
    projectName,
  };
}
