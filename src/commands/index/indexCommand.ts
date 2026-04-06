import { stat } from "fs/promises";
import { join, resolve } from "path";
import { buildCodeIndex } from "../../indexing/build.js";
import type { LocalCommandCall } from "../../types/command.js";
import { getCwd } from "../../utils/cwd.js";
import { errorMessage } from "../../utils/errors.js";
import { parseIndexArgs } from "./args.js";
import { refreshCodeIndexSkillRuntime } from "./refreshCodeIndexSkillRuntime.js";

const USAGE = [
  "Usage: /index [path] [--output DIR] [--max-file-bytes N] [--max-files N] [--workers N] [--ignore-dir NAME]",
  "",
  "Examples:",
  "  /index",
  "  /index src",
  "  /index . --output .code_index",
  "  /index --max-file-bytes 1048576",
  "  /index . --workers 8",
  "  /index . --max-files 20000 --ignore-dir ThirdParty",
].join("\n");

function formatResult(args: {
  result: Awaited<ReturnType<typeof buildCodeIndex>>;
}): string {
  const { manifest, outputDir, rootDir, skillPaths, timings } = args.result;
  const languageSummary = Object.entries(manifest.languages)
    .map(([language, count]) => `${language}: ${count}`)
    .join(" | ");

  return [
    "Code index build complete.",
    `Engine: ${args.result.engine}`,
    `Workers: ${args.result.parseWorkers}`,
    `Incremental: reused ${args.result.incremental.cacheHits} | parsed ${args.result.incremental.cacheMisses} | removed ${args.result.incremental.removedFiles}`,
    `Duration: ${formatDuration(timings.totalMs)}`,
    `Phases: discover ${formatDuration(timings.discoverMs)} | parse ${formatDuration(timings.parseMs)} | emit ${formatDuration(timings.emitSkeletonMs)} | edges ${formatDuration(timings.buildEdgesMs)} | write ${formatDuration(timings.writeIndexFilesMs)} | skills ${formatDuration(timings.writeSkillsMs)}`,
    `Root: ${rootDir}`,
    `Output: ${outputDir}`,
    `Modules: ${manifest.moduleCount}`,
    `Classes: ${manifest.classCount}`,
    `Functions: ${manifest.functionCount}`,
    `Methods: ${manifest.methodCount}`,
    `Edges: ${manifest.edgeCount}`,
    `File limit: ${manifest.fileLimit ?? "none"}${manifest.fileLimitReached ? " (reached)" : ""}`,
    `Truncated files: ${manifest.truncatedCount}`,
    `Languages: ${languageSummary || "none"}`,
    "",
    "Generated:",
    `- ${join(outputDir, "index", "architecture.dot")}  (file-level dependency map)`,
    `- ${join(outputDir, "__index__.py")}  (entry points, top dirs, hot symbols)`,
    `- ${join(outputDir, "index", "summary.md")}`,
    `- ${join(outputDir, "index", "manifest.json")}`,
    `- ${join(outputDir, "skeleton")}`,
    `- ${skillPaths.claude}`,
    `- ${skillPaths.codex}`,
    `- ${skillPaths.opencode}`,
  ].join("\n");
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }

  const seconds = durationMs / 1000;
  const precision = seconds >= 10 ? 1 : 2;
  return `${seconds.toFixed(precision)}s (${Math.round(durationMs)}ms)`;
}

export const call: LocalCommandCall = async (args) => {
  const parsed = parseIndexArgs(args);
  if (parsed.kind === "help") {
    return {
      type: "text",
      value: USAGE,
    };
  }

  if (parsed.kind === "error") {
    return {
      type: "text",
      value: `${parsed.message}\n\n${USAGE}`,
    };
  }

  const cwd = getCwd();
  const rootDir = resolve(cwd, parsed.rootDir);
  const outputDir = parsed.outputDir
    ? resolve(cwd, parsed.outputDir)
    : resolve(rootDir, ".code_index");

  try {
    const fileStat = await stat(rootDir);
    if (!fileStat.isDirectory()) {
      return {
        type: "text",
        value: `Index root is not a directory: ${rootDir}`,
      };
    }
  } catch (error) {
    return {
      type: "text",
      value: `Cannot access index root: ${errorMessage(error)}`,
    };
  }

  try {
    const result = await buildCodeIndex({
      ignoredDirNames: parsed.ignoredDirNames,
      maxFiles: parsed.maxFiles,
      rootDir,
      outputDir,
      maxFileBytes: parsed.maxFileBytes,
      workers: parsed.workers,
    });
    await refreshCodeIndexSkillRuntime();

    return {
      type: "text",
      value: formatResult({ result }),
    };
  } catch (error) {
    return {
      type: "text",
      value: `Code index build failed: ${errorMessage(error)}`,
    };
  }
};
