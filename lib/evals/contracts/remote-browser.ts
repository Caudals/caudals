import { z } from "zod";

export const teachPartSchema = z.enum(["launcher", "input", "submit", "response", "busy"]);
export const remoteActionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("open") }),
  z.strictObject({ action: z.literal("snapshot"), sessionId: z.uuid() }),
  z.strictObject({ action: z.literal("close"), sessionId: z.uuid() }),
  z.strictObject({ action: z.literal("navigate"), sessionId: z.uuid(), url: z.url().max(2000) }),
  z.strictObject({ action: z.literal("tab"), sessionId: z.uuid(), index: z.int().min(0).max(15) }),
  z.strictObject({ action: z.literal("mode"), sessionId: z.uuid(), mode: z.enum(["view", "control", "teach"]) }),
  z.strictObject({ action: z.literal("click"), sessionId: z.uuid(), x: z.number().min(0).max(1280), y: z.number().min(0).max(800), button: z.enum(["left", "right"]).default("left"), part: teachPartSchema.optional() }),
  z.strictObject({ action: z.literal("pointer"), sessionId: z.uuid(), phase: z.enum(["move", "down", "up"]), x: z.number().min(0).max(1280), y: z.number().min(0).max(800) }),
  z.strictObject({ action: z.literal("key"), sessionId: z.uuid(), key: z.string().regex(/^(?:(?:Control|Meta|Shift|Alt)\+){0,3}(?:[a-zA-Z0-9]|Enter|Tab|Backspace|Delete|Escape|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|Space)$/) }),
  z.strictObject({ action: z.literal("text"), sessionId: z.uuid(), text: z.string().min(1).max(4000) }),
  z.strictObject({ action: z.literal("scroll"), sessionId: z.uuid(), dx: z.number().min(-2000).max(2000), dy: z.number().min(-2000).max(2000) }),
  z.strictObject({ action: z.literal("clear"), sessionId: z.uuid(), part: teachPartSchema }),
  z.strictObject({ action: z.literal("save"), sessionId: z.uuid() }),
  z.strictObject({ action: z.literal("test"), sessionId: z.uuid() }),
  z.strictObject({ action: z.literal("result"), sessionId: z.uuid() }),
]);
export type RemoteAction = z.infer<typeof remoteActionSchema>;
