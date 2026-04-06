import { describe, expect, it } from "bun:test";
import { formatStartupIndexProgress, formatStartupIndexSummary } from "./startupIndex.js";

describe("startupIndex", () => {
  it("formats percentage-bearing progress updates", () => {
    expect(
      formatStartupIndexProgress({
        phase: "parse",
        message: "Parsing 25/100 changed files",
        completed: 25,
        total: 100,
      }),
    ).toContain("(25%)");

    expect(
      formatStartupIndexProgress({
        phase: "emit",
        message: "Updating skeleton 38/100 modules",
        completed: 38,
        total: 100,
      }),
    ).toContain("(38%)");
  });

  it("formats a concise startup summary", () => {
    expect(
      formatStartupIndexSummary({
        engine: "typescript",
        fileLimitReached: false,
        incremental: {
          cacheHits: 10,
          cacheMisses: 2,
          removedFiles: 1,
        },
        manifest: {
          artifactVersion: 1,
          rootDir: "/repo",
          outputDir: "/repo/.code_index",
          createdAt: "2026-04-06T00:00:00.000Z",
          moduleCount: 12,
          classCount: 1,
          functionCount: 30,
          methodCount: 4,
          edgeCount: 20,
          truncatedCount: 0,
          fileLimit: undefined,
          fileLimitReached: false,
          languages: { typescript: 12 },
          parseModes: { "ts-heuristic": 12 },
        },
        maxFiles: undefined,
        outputDir: "/repo/.code_index",
        parseWorkers: 4,
        rootDir: "/repo",
        skillPaths: {
          claude: "/repo/.claude/skills/code-index/SKILL.md",
          codex: "/repo/.codex/skills/code-index/SKILL.md",
          opencode: "/repo/.opencode/skills/code-index/SKILL.md",
        },
        timings: {
          buildEdgesMs: 10,
          discoverMs: 20,
          emitSkeletonMs: 30,
          parseMs: 40,
          totalMs: 1234,
          writeIndexFilesMs: 50,
          writeSkillsMs: 60,
        },
      }),
    ).toContain("Startup code index ready.");
  });
});
