import { describe, expect, it } from "vitest";
import { buildPreviewFixPrompt } from "@/pages/app-chat/build-error-context";

describe("buildPreviewFixPrompt", () => {
  it("includes the error message", () => {
    const prompt = buildPreviewFixPrompt({
      message: "Cannot read property 'x'",
    });
    expect(prompt).toContain("Error: Cannot read property 'x'");
    expect(prompt).toContain("Fix the generated React app error below.");
  });

  it("omits the Stack section when no stack is present", () => {
    const prompt = buildPreviewFixPrompt({ message: "boom" });
    expect(prompt).not.toContain("Stack:");
    // The prompt ends on the Error line when there is no stack.
    expect(prompt.trimEnd().endsWith("Error: boom")).toBe(true);
  });

  it("appends the Stack section only when a stack is provided", () => {
    const stack = "at foo (app.tsx:1:1)\nat bar (app.tsx:2:2)";
    const prompt = buildPreviewFixPrompt({ message: "boom", stack });
    expect(prompt).toContain("Error: boom");
    expect(prompt).toContain("Stack:");
    expect(prompt).toContain(stack);
    // The stack block comes after the error message.
    expect(prompt.indexOf("Stack:")).toBeGreaterThan(
      prompt.indexOf("Error: boom"),
    );
  });
});
