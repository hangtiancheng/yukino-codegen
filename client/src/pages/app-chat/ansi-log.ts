/**
 * Minimal ANSI terminal renderer for install/dev-server logs. npm and Vite
 * emit SGR colour codes together with cursor and erase control sequences: a
 * progress spinner rewrites the same line using carriage returns or the CSI
 * `G`/`K` codes. We model a per-line cell buffer so those rewrites collapse to
 * their final text, then merge neighbouring cells that share a style into spans
 * for rendering.
 */

type AnsiStyle = {
  readonly color: string | undefined;
  readonly bold: boolean;
};

export type AnsiSpan = {
  readonly text: string;
  readonly className: string;
};

export type AnsiLine = readonly AnsiSpan[];

type Cell = { readonly char: string; readonly style: AnsiStyle };

const RESET: AnsiStyle = { color: undefined, bold: false };
const BLANK: Cell = { char: " ", style: RESET };

// Tailwind text colours for the standard and bright foreground palette. The
// tones read on both the light and dark preview panel backgrounds.
const SGR_COLORS: Readonly<Record<number, string>> = {
  30: "text-neutral-500",
  31: "text-red-600",
  32: "text-green-600",
  33: "text-yellow-600",
  34: "text-blue-600",
  35: "text-fuchsia-600",
  36: "text-cyan-600",
  37: "text-neutral-600",
  90: "text-neutral-400",
  91: "text-red-500",
  92: "text-green-500",
  93: "text-yellow-500",
  94: "text-blue-500",
  95: "text-fuchsia-500",
  96: "text-cyan-500",
  97: "text-neutral-500",
};

const ESC = "\u001b";
const CSI_PARAM = /[\d;?]/u;
const CSI_FINAL = /[A-Za-z]/u;

function applySgr(style: AnsiStyle, rawParams: string): AnsiStyle {
  const codes =
    rawParams === "" ? [0] : rawParams.split(";").map((part) => Number(part));
  let next = style;
  for (const code of codes) {
    if (Number.isNaN(code) || code === 0) next = RESET;
    else if (code === 1) next = { ...next, bold: true };
    else if (code === 22) next = { ...next, bold: false };
    else if (code === 39) next = { ...next, color: undefined };
    else {
      const color = SGR_COLORS[code];
      if (color !== undefined) next = { ...next, color };
    }
  }
  return next;
}

function styleClassName(style: AnsiStyle): string {
  const classes: string[] = [];
  if (style.color !== undefined) classes.push(style.color);
  if (style.bold) classes.push("font-semibold");
  return classes.join(" ");
}

function cellsToSpans(cells: readonly Cell[]): AnsiSpan[] {
  const spans: AnsiSpan[] = [];
  for (const cell of cells) {
    const className = styleClassName(cell.style);
    const last = spans.at(-1);
    if (last !== undefined && last.className === className) {
      spans[spans.length - 1] = { text: last.text + cell.char, className };
    } else {
      spans.push({ text: cell.char, className });
    }
  }
  return spans;
}

/** Parse an ANSI string into styled lines, collapsing in-place line rewrites. */
export function parseAnsiLines(input: string): AnsiLine[] {
  const lines: Cell[][] = [];
  let line: Cell[] = [];
  let column = 0;
  let style: AnsiStyle = RESET;

  const applyControl = (command: string, params: string): void => {
    if (command === "m") {
      style = applySgr(style, params);
      return;
    }
    if (command === "G") {
      const target = Number(params);
      column = Number.isNaN(target) ? 0 : Math.max(0, target - 1);
      return;
    }
    if (command === "K") {
      const mode = Number(params) || 0;
      if (mode === 2) {
        line = [];
        column = 0;
      } else if (mode === 1) {
        for (let index = 0; index < column && index < line.length; index += 1) {
          line[index] = BLANK;
        }
      } else {
        line.length = Math.min(line.length, column);
      }
    }
  };

  let index = 0;
  while (index < input.length) {
    const char = input[index];
    if (char === ESC && input[index + 1] === "[") {
      let cursor = index + 2;
      while (cursor < input.length && CSI_PARAM.test(input[cursor])) {
        cursor += 1;
      }
      const command = input[cursor];
      if (command === undefined || !CSI_FINAL.test(command)) {
        index += 1;
        continue;
      }
      applyControl(command, input.slice(index + 2, cursor));
      index = cursor + 1;
      continue;
    }
    index += 1;
    if (char === "\n") {
      lines.push(line);
      line = [];
      column = 0;
      continue;
    }
    if (char === "\r") {
      column = 0;
      continue;
    }
    if (char === "\b") {
      if (column > 0) column -= 1;
      continue;
    }
    if (char < " ") continue;
    while (line.length < column) line.push(BLANK);
    line[column] = { char, style };
    column += 1;
  }
  lines.push(line);

  return lines.map(cellsToSpans);
}
