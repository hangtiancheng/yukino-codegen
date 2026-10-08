import { describe, expect, it } from "vitest";
import { parseAnsiLines, type AnsiLine } from "@/pages/app-chat/ansi-log";

const lineText = (line: AnsiLine): string =>
  line.map((span) => span.text).join("");

describe("parseAnsiLines", () => {
  it("returns a single unstyled span for plain text", () => {
    const [line, ...rest] = parseAnsiLines("hello world");
    expect(rest).toHaveLength(0);
    expect(line).toEqual([{ text: "hello world", className: "" }]);
  });

  it("splits on newlines into separate lines", () => {
    const lines = parseAnsiLines("first\nsecond");
    expect(lines.map(lineText)).toEqual(["first", "second"]);
  });

  it("maps SGR colour and bold codes to Tailwind classes", () => {
    const [line] = parseAnsiLines(
      "\u001b[1mnpm\u001b[22m \u001b[31merror\u001b[39m \u001b[94mcode\u001b[39m ENOENT",
    );
    expect(lineText(line ?? [])).toBe("npm error code ENOENT");
    const npm = (line ?? []).find((span) => span.text === "npm");
    const error = (line ?? []).find((span) => span.text === "error");
    const code = (line ?? []).find((span) => span.text === "code");
    expect(npm?.className).toBe("font-semibold");
    expect(error?.className).toBe("text-red-600");
    expect(code?.className).toBe("text-blue-500");
  });

  it("resets styling on the 0 code and the shorthand [m", () => {
    const [line] = parseAnsiLines("\u001b[31mred\u001b[0mplain\u001b[mstill");
    expect(line).toEqual([
      { text: "red", className: "text-red-600" },
      { text: "plainstill", className: "" },
    ]);
  });

  it("collapses carriage-return progress rewrites to the final text", () => {
    const [line, ...rest] = parseAnsiLines("foo\r\u001b[0Kbar");
    expect(rest).toHaveLength(0);
    expect(lineText(line ?? [])).toBe("bar");
  });

  it("collapses cursor-column and erase spinner frames", () => {
    const frame = "\u001b[1G\u001b[0K";
    const [line, ...rest] = parseAnsiLines(`${frame}\\${frame}|${frame}done`);
    expect(rest).toHaveLength(0);
    expect(lineText(line ?? [])).toBe("done");
  });

  it("ignores unsupported control sequences without leaking them", () => {
    const [line] = parseAnsiLines("a\u001b[2Kb\u001b[Hc");
    expect(lineText(line ?? [])).toBe("bc");
  });
});
