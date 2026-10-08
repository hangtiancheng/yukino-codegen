import { getZodFieldError } from "@/shared/lib";
import { userRegisterRequestSchema } from "@/shared/schemas";

export function getConfirmPasswordError(
  value: string,
  password: string,
  visible: boolean,
): string | undefined {
  const minLengthError = getZodFieldError(
    userRegisterRequestSchema.shape.checkPassword,
    value,
    visible,
  );
  if (minLengthError !== undefined || !visible || value === password) {
    return minLengthError;
  }
  return "passwords must match";
}
