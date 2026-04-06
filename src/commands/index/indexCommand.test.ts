import { describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { LOCAL_COMMAND_STDOUT_TAG } from "../../constants/xml.js";

describe("/index command", () => {
  it("streams progress updates into the transcript before the final result", async () => {
    const rootDir = await mkdtemp(
      join(tmpdir(), "claude-code-index-command-"),
    );

    try {
      await writeFile(
        join(rootDir, "alpha.ts"),
        `export const alpha = 1
`,
        "utf8",
      );

      let refreshCount = 0;
      mock.module("./refreshCodeIndexSkillRuntime.js", () => ({
        refreshCodeIndexSkillRuntime: async () => {
          refreshCount++;
        },
      }));

      const { call } = await import("./indexCommand.js");
      const messages: Array<{ content?: string; uuid?: string }> = [];
      const outputs: string[] = [];
      const context = {
        setMessages(updater: (prev: typeof messages) => typeof messages) {
          const next = updater(messages);
          messages.splice(0, messages.length, ...next);
          const last = messages.at(-1);
          if (typeof last?.content === "string") {
            outputs.push(last.content);
          }
        },
      } as Parameters<typeof call>[1];

      const result = await call(rootDir, context);

      expect(result).toEqual({ type: "skip" });
      expect(refreshCount).toBe(1);
      expect(
        outputs.some((output) =>
          output.includes(`<${LOCAL_COMMAND_STDOUT_TAG}>Indexing project:`),
        ),
      ).toBe(true);
      expect(
        outputs.some((output) => output.includes("Code index build complete.")),
      ).toBe(true);
      expect(
        messages.some((message) =>
          message.content?.includes("Code index build complete."),
        ),
      ).toBe(true);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
