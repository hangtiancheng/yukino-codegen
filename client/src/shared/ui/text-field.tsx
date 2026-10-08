import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";

export type TextFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "aria-invalid" | "aria-describedby"
> & {
  readonly label: string;
  readonly errorMessage?: string | undefined;
  readonly hint?: ReactNode;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    { label, errorMessage, hint, className, ...inputProps },
    ref,
  ) {
    const reactId = useId();
    const inputId = `${reactId}-input`;
    const hasError = Boolean(errorMessage);

    return (
      <Field data-invalid={hasError || undefined}>
        <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
        <Input
          ref={ref}
          id={inputId}
          aria-invalid={hasError || undefined}
          className={className}
          {...inputProps}
        />
        {hint && !hasError ? <FieldDescription>{hint}</FieldDescription> : null}
        {hasError ? <FieldError>{errorMessage}</FieldError> : null}
      </Field>
    );
  },
);
