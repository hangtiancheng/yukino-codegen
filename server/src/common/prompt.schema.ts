import { z } from "zod";
import { env } from "../config/index.js";

export const promptSchema = z.string().min(1).max(env.PROMPT_MAX_LENGTH);
