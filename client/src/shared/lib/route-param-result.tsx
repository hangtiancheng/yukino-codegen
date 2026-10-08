import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { z } from "zod";

export type RouteParamResultProps<TParams> = {
  readonly schema: z.ZodType<TParams>;
  readonly params: unknown;
  readonly children: (params: TParams) => ReactNode;
};

export function RouteParamResult<TParams>({
  schema,
  params,
  children,
}: RouteParamResultProps<TParams>): ReactNode {
  const result = schema.safeParse(params);
  if (!result.success) {
    return <Navigate to="/" replace />;
  }
  return children(result.data);
}
