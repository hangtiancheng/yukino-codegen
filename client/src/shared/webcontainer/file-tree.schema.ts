import type { FileSystemTree } from "@webcontainer/api";
import { z } from "zod";

export type AppFileTreeTransport = Readonly<
  Record<string, AppDirectoryTransport | AppFileTransport>
>;

type AppDirectoryTransport = Readonly<{
  directory: AppFileTreeTransport;
}>;

type AppFileTransport = Readonly<{
  file: Readonly<{
    contents: string;
    encoding: "base64" | "utf8";
  }>;
}>;

export const appFileTreeTransportSchema: z.ZodType<AppFileTreeTransport> =
  z.record(
    z.string(),
    z.lazy(() => appFileTreeNodeSchema),
  );

const appFileTreeNodeSchema: z.ZodType<
  AppDirectoryTransport | AppFileTransport
> = z.union([
  z.object({ directory: appFileTreeTransportSchema }),
  z.object({
    file: z.object({
      contents: z.string(),
      encoding: z.enum(["base64", "utf8"]),
    }),
  }),
]);

const decodeBase64 = (contents: string): Uint8Array => {
  const binary = atob(contents);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export function toWebContainerFileTree(
  transport: AppFileTreeTransport,
): FileSystemTree {
  const result: FileSystemTree = {};
  for (const [name, node] of Object.entries(transport)) {
    if ("directory" in node) {
      result[name] = { directory: toWebContainerFileTree(node.directory) };
      continue;
    }
    result[name] = {
      file: {
        contents:
          node.file.encoding === "utf8"
            ? node.file.contents
            : decodeBase64(node.file.contents),
      },
    };
  }
  return result;
}
