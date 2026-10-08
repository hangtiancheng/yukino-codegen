import type { Environment } from "monaco-editor";
// monaco-editor 0.56 exposes subpaths through an `exports` map that rewrites
// `./*` to `./esm/vs/*.js`, so worker specifiers omit the `esm/vs/` prefix.
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import CssWorker from "monaco-editor/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/language/html/html.worker?worker";
import JsonWorker from "monaco-editor/language/json/json.worker?worker";
import TsWorker from "monaco-editor/language/typescript/ts.worker?worker";

/**
 * Wire Monaco's language workers to locally bundled Vite web workers. This
 * avoids the default CDN worker loader, which cannot run under the workspace's
 * cross-origin isolation headers.
 */

let configured = false;

function createWorker(_workerId: string, label: string): Worker {
  switch (label) {
    case "json":
      return new JsonWorker();
    case "css":
    case "scss":
    case "less":
      return new CssWorker();
    case "html":
    case "handlebars":
    case "razor":
      return new HtmlWorker();
    case "typescript":
    case "javascript":
      return new TsWorker();
    default:
      return new EditorWorker();
  }
}

export function configureMonacoWorkers(): void {
  if (configured) return;
  const environment: Environment = { getWorker: createWorker };
  globalThis.MonacoEnvironment = environment;
  configured = true;
}
