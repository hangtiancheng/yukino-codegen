import { type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { RouteParamResult } from "@/shared/lib";
import { appEditRouteParamsSchema } from "@/shared/schemas";
import { AppEditContent } from "./app-edit-content";

export function AppEditPage(): ReactNode {
  const params = useParams();

  return (
    <RouteParamResult schema={appEditRouteParamsSchema} params={params}>
      {({ id }) => <AppEditContent appId={id} />}
    </RouteParamResult>
  );
}
