import type * as Monaco from "monaco-editor";
import { registerCatppuccinMonacoTheme } from "./catppuccin-theme";
import { configureMonacoWorkers } from "./monaco-workers";

/**
 * Lazily import `monaco-editor` so its large bundle and language workers are
 * only fetched the first time the Code tab is opened. The module is cached, so
 * later calls resolve immediately and the editor can stay mounted.
 */

export type MonacoModule = typeof Monaco;

let monacoPromise: Promise<MonacoModule> | undefined;

export function loadMonaco(): Promise<MonacoModule> {
  monacoPromise ??= importMonaco();
  return monacoPromise;
}

async function importMonaco(): Promise<MonacoModule> {
  try {
    configureMonacoWorkers();
    const monaco = await import("monaco-editor");
    registerCatppuccinMonacoTheme(monaco);
    configureLanguageDefaults(monaco);
    return monaco;
  } catch (error) {
    monacoPromise = undefined;
    throw error;
  }
}

/**
 * Monaco's built-in TypeScript language service has its own compiler options
 * (independent of the project's tsconfig.json) and no access to the project's
 * `node_modules` type definitions. Without configuration `.tsx` files report
 * "Cannot use JSX unless the '--jsx' flag is provided" (17004). We enable JSX and
 * disable semantic validation so module resolution against missing types does not
 * flood the editor with false "cannot find module" errors — genuine type-checking
 * happens in the integrated terminal (tsc/Vite) or via the agent. Syntax
 * diagnostics stay on so real syntax mistakes still surface.
 */
function configureLanguageDefaults(monaco: MonacoModule): void {
  const ts = monaco.typescript;
  const compilerOptions: Monaco.typescript.CompilerOptions = {
    allowJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true,
    isolatedModules: true,
    jsx: ts.JsxEmit.ReactJSX,
    jsxImportSource: "react",
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ESNext,
  };
  const diagnosticsOptions: Monaco.typescript.DiagnosticsOptions = {
    noSemanticValidation: true,
    noSuggestionDiagnostics: true,
    noSyntaxValidation: false,
  };
  for (const defaults of [ts.typescriptDefaults, ts.javascriptDefaults]) {
    defaults.setCompilerOptions(compilerOptions);
    defaults.setDiagnosticsOptions(diagnosticsOptions);
    defaults.setEagerModelSync(true);
  }
}
