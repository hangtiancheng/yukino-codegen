import type * as Monaco from "monaco-editor";
import { registerCatppuccinMonacoTheme } from "./catppuccin-theme";
import { configureMonacoWorkers } from "./monaco-workers";

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
