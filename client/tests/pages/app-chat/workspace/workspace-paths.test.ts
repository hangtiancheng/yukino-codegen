import { describe, expect, it } from "vitest";
import {
  baseName,
  fileExtension,
  hashContents,
  isBinaryPath,
  isIgnoredPath,
  isIgnoredSegment,
  joinPath,
  languageForPath,
  normalizePath,
  parentPath,
  WORKSPACE_IGNORED_SEGMENTS,
} from "@/pages/app-chat/workspace/workspace-paths";

describe("normalizePath", () => {
  it("strips a leading ./", () => {
    expect(normalizePath("./src/App.tsx")).toBe("src/App.tsx");
  });

  it("strips leading slashes", () => {
    expect(normalizePath("/src/App.tsx")).toBe("src/App.tsx");
    expect(normalizePath("///deep/file")).toBe("deep/file");
  });

  it("collapses duplicate slashes and trims a trailing slash", () => {
    expect(normalizePath("src//nested///file/")).toBe("src/nested/file");
    expect(normalizePath("dir/")).toBe("dir");
  });

  it("leaves an already-normal path unchanged", () => {
    expect(normalizePath("src/pages/app.ts")).toBe("src/pages/app.ts");
  });

  it("reduces a bare slash to the empty string", () => {
    expect(normalizePath("/")).toBe("");
  });
});

describe("joinPath", () => {
  it("joins a directory and a name", () => {
    expect(joinPath("src", "App.tsx")).toBe("src/App.tsx");
  });

  it("normalizes the directory before joining", () => {
    expect(joinPath("./src/", "App.tsx")).toBe("src/App.tsx");
  });

  it("returns just the normalized name when the directory is empty", () => {
    expect(joinPath("", "./App.tsx")).toBe("App.tsx");
    expect(joinPath("/", "file.ts")).toBe("file.ts");
  });
});

describe("parentPath / baseName", () => {
  it("splits a nested path into parent and base", () => {
    expect(parentPath("src/pages/App.tsx")).toBe("src/pages");
    expect(baseName("src/pages/App.tsx")).toBe("App.tsx");
  });

  it("returns an empty parent and the whole name for a root-level file", () => {
    expect(parentPath("App.tsx")).toBe("");
    expect(baseName("App.tsx")).toBe("App.tsx");
  });

  it("normalizes trailing slashes before extracting the base", () => {
    expect(baseName("src/")).toBe("src");
  });
});

describe("fileExtension", () => {
  it("returns the lower-cased extension", () => {
    expect(fileExtension("App.TSX")).toBe("tsx");
    expect(fileExtension("src/styles/main.CSS")).toBe("css");
  });

  it("returns an empty string when there is no extension", () => {
    expect(fileExtension("Makefile")).toBe("");
  });

  it("treats a dotfile with no other dot as extensionless", () => {
    expect(fileExtension(".env")).toBe("");
    expect(fileExtension(".gitignore")).toBe("");
  });
});

describe("isBinaryPath", () => {
  it("is true for known binary extensions", () => {
    expect(isBinaryPath("assets/logo.png")).toBe(true);
    expect(isBinaryPath("fonts/Inter.woff2")).toBe(true);
    expect(isBinaryPath("archive.tar.gz")).toBe(true);
    expect(isBinaryPath("bundle.wasm")).toBe(true);
  });

  it("is false for text/source extensions", () => {
    expect(isBinaryPath("src/App.tsx")).toBe(false);
    expect(isBinaryPath("README.md")).toBe(false);
    expect(isBinaryPath("data.json")).toBe(false);
  });
});

describe("ignored path helpers", () => {
  it("isIgnoredSegment matches the known ignore set", () => {
    for (const segment of WORKSPACE_IGNORED_SEGMENTS) {
      expect(isIgnoredSegment(segment)).toBe(true);
    }
    expect(isIgnoredSegment("src")).toBe(false);
    expect(isIgnoredSegment("node_module")).toBe(false);
  });

  it("isIgnoredPath is true when any segment is ignored", () => {
    expect(isIgnoredPath("src/node_modules/pkg/index.js")).toBe(true);
    expect(isIgnoredPath("dist/bundle.js")).toBe(true);
    expect(isIgnoredPath(".git/config")).toBe(true);
  });

  it("isIgnoredPath is false for clean paths", () => {
    expect(isIgnoredPath("src/pages/app.ts")).toBe(false);
    expect(isIgnoredPath("public/index.html")).toBe(false);
  });
});

describe("languageForPath", () => {
  it("maps TypeScript extensions", () => {
    expect(languageForPath("src/App.tsx")).toBe("typescript");
    expect(languageForPath("src/util.ts")).toBe("typescript");
    expect(languageForPath("src/util.mts")).toBe("typescript");
  });

  it("maps JavaScript extensions", () => {
    expect(languageForPath("src/main.js")).toBe("javascript");
    expect(languageForPath("src/comp.jsx")).toBe("javascript");
    expect(languageForPath("babel.config.cjs")).toBe("javascript");
  });

  it("maps common asset/text extensions", () => {
    expect(languageForPath("styles/app.css")).toBe("css");
    expect(languageForPath("package.json")).toBe("json");
    expect(languageForPath("README.md")).toBe("markdown");
    expect(languageForPath("icon.svg")).toBe("xml");
    expect(languageForPath("config.yaml")).toBe("yaml");
  });

  it("prefers full-filename matches over extension", () => {
    expect(languageForPath("Dockerfile")).toBe("dockerfile");
    expect(languageForPath("project/Dockerfile")).toBe("dockerfile");
    expect(languageForPath(".env")).toBe("ini");
    expect(languageForPath(".gitignore")).toBe("plaintext");
    expect(languageForPath(".npmrc")).toBe("ini");
  });

  it("falls back to plaintext for unknown extensions", () => {
    expect(languageForPath("data.unknownext")).toBe("plaintext");
    expect(languageForPath("LICENSE")).toBe("plaintext");
  });
});

describe("hashContents", () => {
  it("is deterministic for identical input", () => {
    expect(hashContents("hello world")).toBe(hashContents("hello world"));
  });

  it("produces distinct hashes for distinct input", () => {
    expect(hashContents("a")).not.toBe(hashContents("b"));
    expect(hashContents("hello")).not.toBe(hashContents("hallo"));
    // Order matters for FNV-1a.
    expect(hashContents("ab")).not.toBe(hashContents("ba"));
  });

  it("always renders as an 8-character zero-padded hex string", () => {
    for (const value of [
      "",
      "x",
      "a much longer string of content",
      "\u0000",
    ]) {
      const hash = hashContents(value);
      expect(hash).toMatch(/^[0-9a-f]{8}$/);
    }
    // FNV-1a offset basis for the empty string.
    expect(hashContents("")).toBe("811c9dc5");
  });
});
