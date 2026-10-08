import {
  forwardRef,
  useId,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/shared/ui/field";
import { Textarea } from "@/shared/ui/textarea";

export type TextAreaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "id" | "aria-invalid" | "aria-describedby"
> & {
  readonly label?: string;
  readonly errorMessage?: string | undefined;
  readonly hint?: ReactNode;
};

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea(
    { label, errorMessage, hint, className, ...textareaProps },
    ref,
  ) {
    const reactId = useId();
    const textareaId = `${reactId}-textarea`;
    const hasError = Boolean(errorMessage);

    return (
      <Field data-invalid={hasError || undefined}>
        {label ? <FieldLabel htmlFor={textareaId}>{label}</FieldLabel> : null}
        <Textarea
          ref={ref}
          id={textareaId}
          aria-invalid={hasError || undefined}
          className={className}
          {...textareaProps}
        />
        {hint && !hasError ? <FieldDescription>{hint}</FieldDescription> : null}
        {hasError ? <FieldError>{errorMessage}</FieldError> : null}
      </Field>
    );
  },
);
