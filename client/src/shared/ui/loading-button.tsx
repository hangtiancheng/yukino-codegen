import { type ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

export type LoadingButtonProps = React.ComponentProps<typeof Button> & {
  readonly isLoading?: boolean;
};

/**
 * Button composed with a Spinner for in-flight actions, following the shadcn
 * convention of no built-in loading prop on the base Button.
 */
export function LoadingButton({
  isLoading = false,
  disabled,
  children,
  ...props
}: LoadingButtonProps): ReactNode {
  return (
    <Button disabled={disabled || isLoading} {...props}>
      {isLoading ? <Spinner data-icon="inline-start" /> : null}
      {children}
    </Button>
  );
}
