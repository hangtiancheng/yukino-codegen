import { z } from "zod";

export const visualEditorElementInfoSchema = z.object({
  tagName: z.string().min(1),
  id: z.string(),
  className: z.string(),
  textContent: z.string(),
  selector: z.string().min(1),
  pagePath: z.string(),
  rect: z.object({
    top: z.number(),
    left: z.number(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  }),
});

export type VisualEditorElementInfo = z.infer<
  typeof visualEditorElementInfoSchema
>;

export const visualEditorIncomingMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ELEMENT_SELECTED"),
    elementInfo: visualEditorElementInfoSchema,
  }),
  z.object({
    type: z.literal("ELEMENT_HOVER"),
    elementInfo: visualEditorElementInfoSchema,
  }),
  z.object({
    type: z.literal("EDIT_MODE_TOGGLED"),
    editMode: z.boolean(),
  }),
]);

export type VisualEditorIncomingMessage = z.infer<
  typeof visualEditorIncomingMessageSchema
>;
