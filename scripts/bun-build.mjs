#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

const compile = process.argv.includes("--compile");
const forceSource = process.argv.includes("--source");
const forcePublished = process.argv.includes("--published");
const preview = process.argv.includes("--preview");
const customOutfile = getArgValue("--out") ?? getArgValue("--outfile");

if (forceSource && forcePublished) {
  console.error("Choose either --source or --published, not both.");
  process.exit(1);
}

if (preview && forcePublished) {
  console.error("Preview builds currently support --source only.");
  process.exit(1);
}

const publishedEntrypoint = resolve("cli.js");
const sourceEntrypoint = resolve("src/entrypoints/cli.tsx");
const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const hasPublishedBundle = existsSync(publishedEntrypoint);
const hasSourceEntrypoint = existsSync(sourceEntrypoint);

if (forcePublished && !hasPublishedBundle) {
  console.error(`Published entrypoint not found: ${publishedEntrypoint}`);
  process.exit(1);
}

if (forceSource && !hasSourceEntrypoint) {
  console.error(`Source entrypoint not found: ${sourceEntrypoint}`);
  process.exit(1);
}

if (preview && !hasSourceEntrypoint) {
  console.error(`Preview source entrypoint not found: ${sourceEntrypoint}`);
  process.exit(1);
}

if (!hasPublishedBundle && !hasSourceEntrypoint) {
  console.error("No build entrypoint found.");
  process.exit(1);
}

const usePublishedBundle = forcePublished
  ? true
  : preview
    ? false
  : forceSource
    ? false
    : hasPublishedBundle;
const entrypoint = usePublishedBundle ? publishedEntrypoint : sourceEntrypoint;
const productName = preview ? "claudenative" : "claudecode";
const defaultOutfile = compile
  ? `dist/${productName}`
  : usePublishedBundle || forceSource || preview
    ? `dist/${productName}.js`
    : "cli.js";
const outfile = resolve(
  customOutfile ?? defaultOutfile
);

mkdirSync(dirname(outfile), { recursive: true });

async function runOrExit(args, label) {
  const proc = Bun.spawn(args, {
    cwd: process.cwd(),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit"
  });

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    if (label) {
      console.error(`${label} failed with exit code ${exitCode}`);
    }
    process.exit(exitCode);
  }
}

const macroValues = {
  VERSION: packageJson.version,
  PACKAGE_URL: "@anthropic-ai/claude-code",
  NATIVE_PACKAGE_URL: "@anthropic-ai/claude-code",
  BUILD_TIME: "2026-03-30T22:36:48.424Z",
  VERSION_CHANGELOG: "",
  FEEDBACK_CHANNEL: "https://github.com/anthropics/claude-code/issues",
  ISSUES_EXPLAINER: "file an issue at https://github.com/anthropics/claude-code/issues"
};

const args = [
  "build",
  "--target=bun",
  "--outfile",
  outfile
];

if (!usePublishedBundle) {
  args.push(
    "--banner",
    `const MACRO = Object.freeze(${JSON.stringify(macroValues)});`
  );

  args.push(
    "--define",
    preview ? 'process.env.USER_TYPE="ant"' : 'process.env.USER_TYPE="external"'
  );
  if (preview) {
    args.push(
      "--define",
      'process.env.CLAUDE_CODE_DISABLE_STARTUP_DIALOGS="1"'
    );
  }
}

args.push(entrypoint);

if (compile) {
  args.splice(1, 0, "--compile");
}

await runOrExit([process.execPath, ...args], "Bun build");
