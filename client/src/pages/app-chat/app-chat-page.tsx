import { type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { RouteParamResult } from "@/shared/lib";
import { appChatRouteParamsSchema } from "@/shared/schemas";
import { AppChatContent } from "./app-chat-content";

export function AppChatPage(): ReactNode {
  const params = useParams();

  return (
    <RouteParamResult schema={appChatRouteParamsSchema} params={params}>
      {({ id }) => <AppChatContent appId={id} />}
    </RouteParamResult>
  );
}
