import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const trackedFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean)
  .filter((file) => file !== "scripts/repository-audit.ts" && !file.endsWith("yarn.lock"));

const disallowedProviderPatterns = [
  new RegExp(`\\b${["a", "w", "s"].join("")}\\b`, "i"),
  new RegExp(["bed", "rock"].join(""), "i"),
  new RegExp(["nova", "\\s*pro"].join(""), "i"),
  new RegExp(["dynamo", "\\s*db"].join(""), "i"),
  new RegExp(["ver", "cel"].join(""), "i"),
  new RegExp(["net", "lify"].join(""), "i"),
  new RegExp(["rail", "way"].join(""), "i"),
  new RegExp(["render", "\\.com"].join(""), "i"),
];

const secretPatterns = [
  /sk-[a-z0-9._-]{20,}/i,
  /access[_-]?key[_-]?secret\s*[=:]\s*["']?[a-z0-9/+]{20,}/i,
];

const textExtensions = new Set([
  ".css",
  ".env",
  ".example",
  ".html",
  ".js",
  ".json",
  ".md",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);

const errors: string[] = [];
if (trackedFiles.includes(".env")) errors.push(".env must never be tracked");

for (const file of trackedFiles) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) continue;
  const ext = path.extname(file);
  if (ext && !textExtensions.has(ext)) continue;

  const text = fs.readFileSync(file, "utf8");
  for (const pattern of disallowedProviderPatterns) {
    if (pattern.test(text)) {
      errors.push(`${file}: contains a disallowed deployment/provider reference`);
      break;
    }
  }
  for (const pattern of secretPatterns) {
    if (pattern.test(text)) errors.push(`${file}: contains a credential-like value`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Repository audit passed (${trackedFiles.length} candidate files checked).`);
