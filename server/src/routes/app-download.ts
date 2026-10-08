import type { AppService } from "../app-module/index.js";
import { buildCodeOutputDir, createProjectZipStream } from "../project/index.js";

export type AppDownloadDeps = Readonly<{
  appService: AppService;
  projectRootDir?: string;
}>;

export type AppDownloadInput = Readonly<{
  appId: bigint;
  userId: bigint;
}>;

export const createAppProjectArchive = async (
  { appService, projectRootDir }: AppDownloadDeps,
  input: AppDownloadInput,
) => {
  const app = await appService.requireOwnedApp(input.appId, input.userId);
  const projectDir = buildCodeOutputDir(projectRootDir ?? process.cwd(), app.id.toString());
  return {
    archive: await createProjectZipStream(projectDir),
    filename: `app-${app.id.toString()}.zip`,
  };
};
