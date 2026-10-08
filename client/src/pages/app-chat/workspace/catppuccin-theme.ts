import type { ITheme } from "@xterm/xterm";
import type { MonacoModule } from "./monaco-loader";

/**
 * Catppuccin palette for the web IDE, read from the CSS variables that
 * `@catppuccin/tailwindcss` defines on `:root` (the Frappe flavor). Monaco and
 * xterm cannot use Tailwind classes, so both take their colors from these
 * variables to stay in sync with the stylesheet.
 */

export type CatppuccinPalette = {
  readonly base: string;
  readonly mantle: string;
  readonly crust: string;
  readonly text: string;
  readonly subtext0: string;
  readonly subtext1: string;
  readonly surface0: string;
  readonly surface1: string;
  readonly surface2: string;
  readonly overlay0: string;
  readonly overlay1: string;
  readonly overlay2: string;
  readonly rosewater: string;
  readonly flamingo: string;
  readonly pink: string;
  readonly mauve: string;
  readonly red: string;
  readonly maroon: string;
  readonly peach: string;
  readonly yellow: string;
  readonly green: string;
  readonly teal: string;
  readonly sky: string;
  readonly blue: string;
  readonly lavender: string;
};

function readVar(styles: CSSStyleDeclaration, key: string): string {
  const value = styles.getPropertyValue(`--catppuccin-color-${key}`).trim();
  return value.length > 0 ? value : "#eff1f5";
}

function readPalette(): CatppuccinPalette {
  const styles = getComputedStyle(document.documentElement);
  return {
    base: readVar(styles, "base"),
    mantle: readVar(styles, "mantle"),
    crust: readVar(styles, "crust"),
    text: readVar(styles, "text"),
    subtext0: readVar(styles, "subtext0"),
    subtext1: readVar(styles, "subtext1"),
    surface0: readVar(styles, "surface0"),
    surface1: readVar(styles, "surface1"),
    surface2: readVar(styles, "surface2"),
    overlay0: readVar(styles, "overlay0"),
    overlay1: readVar(styles, "overlay1"),
    overlay2: readVar(styles, "overlay2"),
    rosewater: readVar(styles, "rosewater"),
    flamingo: readVar(styles, "flamingo"),
    pink: readVar(styles, "pink"),
    mauve: readVar(styles, "mauve"),
    red: readVar(styles, "red"),
    maroon: readVar(styles, "maroon"),
    peach: readVar(styles, "peach"),
    yellow: readVar(styles, "yellow"),
    green: readVar(styles, "green"),
    teal: readVar(styles, "teal"),
    sky: readVar(styles, "sky"),
    blue: readVar(styles, "blue"),
    lavender: readVar(styles, "lavender"),
  };
}

export const CATPPUCCIN_THEME_NAME = "catppuccin";

let themeRegistered = false;

/** Define the Catppuccin Monaco theme once; later calls are no-ops. */
export function registerCatppuccinMonacoTheme(monaco: MonacoModule): void {
  if (themeRegistered) return;
  themeRegistered = true;
  const palette = readPalette();
  monaco.editor.defineTheme(CATPPUCCIN_THEME_NAME, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "", foreground: stripHash(palette.text) },
      {
        token: "comment",
        foreground: stripHash(palette.overlay0),
        fontStyle: "italic",
      },
      { token: "keyword", foreground: stripHash(palette.mauve) },
      { token: "string", foreground: stripHash(palette.green) },
      { token: "number", foreground: stripHash(palette.peach) },
      { token: "regexp", foreground: stripHash(palette.red) },
      { token: "type", foreground: stripHash(palette.yellow) },
      { token: "type.identifier", foreground: stripHash(palette.yellow) },
      { token: "identifier", foreground: stripHash(palette.text) },
      { token: "function", foreground: stripHash(palette.blue) },
      { token: "variable", foreground: stripHash(palette.text) },
      { token: "variable.predefined", foreground: stripHash(palette.peach) },
      { token: "constant", foreground: stripHash(palette.peach) },
      { token: "tag", foreground: stripHash(palette.red) },
      { token: "attribute.name", foreground: stripHash(palette.peach) },
      { token: "attribute.value", foreground: stripHash(palette.green) },
      { token: "delimiter", foreground: stripHash(palette.subtext0) },
      { token: "operator", foreground: stripHash(palette.sky) },
    ],
    colors: {
      "editor.background": palette.base,
      "editor.foreground": palette.text,
      "editorLineNumber.foreground": palette.overlay0,
      "editorLineNumber.activeForeground": palette.text,
      "editorCursor.foreground": palette.rosewater,
      "editor.selectionBackground": `${palette.surface1}80`,
      "editor.inactiveSelectionBackground": `${palette.surface0}66`,
      "editor.lineHighlightBackground": palette.mantle,
      "editorWhitespace.foreground": palette.surface1,
      "editorIndentGuide.background": palette.surface0,
      "editorWidget.background": palette.mantle,
      "editorWidget.border": palette.surface0,
      "editorSuggestWidget.background": palette.mantle,
      "editorSuggestWidget.selectedBackground": palette.surface0,
      "editorHoverWidget.background": palette.mantle,
      "editorHoverWidget.border": palette.surface0,
      "diffEditor.insertedTextBackground": `${palette.green}1a`,
      "diffEditor.removedTextBackground": `${palette.red}1a`,
      "scrollbarSlider.background": `${palette.surface0}80`,
      "scrollbarSlider.hoverBackground": `${palette.surface1}80`,
    },
  });
}

/** xterm theme built from the same Catppuccin palette. */
export function catppuccinXtermTheme(): ITheme {
  const palette = readPalette();
  return {
    background: palette.base,
    foreground: palette.text,
    cursor: palette.rosewater,
    cursorAccent: palette.base,
    selectionBackground: `${palette.surface1}80`,
    black: palette.surface1,
    red: palette.red,
    green: palette.green,
    yellow: palette.yellow,
    blue: palette.blue,
    magenta: palette.pink,
    cyan: palette.teal,
    white: palette.subtext1,
    brightBlack: palette.overlay0,
    brightRed: palette.maroon,
    brightGreen: palette.green,
    brightYellow: palette.peach,
    brightBlue: palette.sky,
    brightMagenta: palette.flamingo,
    brightCyan: palette.sky,
    brightWhite: palette.text,
  };
}

/** Palette entry for use in Tailwind-free contexts (panel backgrounds). */
export function catppuccinBase(): string {
  return readPalette().base;
}

function stripHash(color: string): string {
  return color.startsWith("#") ? color.slice(1) : color;
}
