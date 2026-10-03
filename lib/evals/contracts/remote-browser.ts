import { z } from "zod";

export const teachPartSchema = z.enum(["launcher", "input", "submit", "response", "busy"]);
export type TeachPart = z.infer<typeof teachPartSchema>;

const x = z.number().min(0).max(1280);
const y = z.number().min(0).max(800);
const keySchema = z.string().regex(/^(?:(?:Control|Meta|Shift|Alt)\+){0,3}(?:[a-zA-Z0-9]|Enter|Tab|Backspace|Delete|Escape|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|Space)$/);
const button = z.enum(["left", "right", "middle"]).default("left");

/** One human input event, replayed in order inside the remote page. */
export const remoteInputEventSchema = z.discriminatedUnion("t", [
  z.strictObject({ t: z.literal("move"), x, y }),
  z.strictObject({ t: z.literal("down"), x, y, button, count: z.int().min(1).max(3).default(1) }),
  z.strictObject({ t: z.literal("up"), x, y, button, count: z.int().min(1).max(3).default(1) }),
  z.strictObject({ t: z.literal("wheel"), x, y, dx: z.number().min(-3000).max(3000), dy: z.number().min(-3000).max(3000) }),
  z.strictObject({ t: z.literal("key"), key: keySchema }),
  // Typed characters produce real key events (2FA boxes listen for them);
  // pasted text is inserted in one step.
  z.strictObject({ t: z.literal("type"), text: z.string().min(1).max(200) }),
  z.strictObject({ t: z.literal("text"), text: z.string().min(1).max(4000) }),
]);
export type RemoteInputEvent = z.infer<typeof remoteInputEventSchema>;

export const remoteActionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("open") }),
  z.strictObject({ action: z.literal("snapshot"), sessionId: z.uuid() }),
  z.strictObject({ action: z.literal("close"), sessionId: z.uuid() }),
  z.strictObject({ action: z.literal("navigate"), sessionId: z.uuid(), url: z.url().max(2000) }),
  z.strictObject({ action: z.literal("history"), sessionId: z.uuid(), direction: z.enum(["back", "forward", "reload"]) }),
  z.strictObject({ action: z.literal("tab"), sessionId: z.uuid(), index: z.int().min(0).max(15) }),
  z.strictObject({ action: z.literal("mode"), sessionId: z.uuid(), mode: z.enum(["view", "control", "teach"]), part: teachPartSchema.optional() }),
  z.strictObject({ action: z.literal("input"), sessionId: z.uuid(), events: z.array(remoteInputEventSchema).min(1).max(80) }),
  z.strictObject({ action: z.literal("click"), sessionId: z.uuid(), x, y, button: z.enum(["left", "right"]).default("left"), part: teachPartSchema.optional() }),
  z.strictObject({ action: z.literal("pointer"), sessionId: z.uuid(), phase: z.enum(["move", "down", "up"]), x, y }),
  z.strictObject({ action: z.literal("key"), sessionId: z.uuid(), key: keySchema }),
  z.strictObject({ action: z.literal("text"), sessionId: z.uuid(), text: z.string().min(1).max(4000) }),
  z.strictObject({ action: z.literal("scroll"), sessionId: z.uuid(), dx: z.number().min(-2000).max(2000), dy: z.number().min(-2000).max(2000) }),
  z.strictObject({ action: z.literal("clear"), sessionId: z.uuid(), part: teachPartSchema }),
  // Detect every element automatically, then run Test Connection.
  z.strictObject({ action: z.literal("autoteach"), sessionId: z.uuid() }),
  z.strictObject({ action: z.literal("cancel"), sessionId: z.uuid() }),
  z.strictObject({ action: z.literal("save"), sessionId: z.uuid() }),
  // Login retention does not depend on a complete or passing recipe.
  z.strictObject({ action: z.literal("checkpoint"), sessionId: z.uuid() }),
  z.strictObject({ action: z.literal("test"), sessionId: z.uuid() }),
  z.strictObject({ action: z.literal("result"), sessionId: z.uuid() }),
]);
export type RemoteAction = z.infer<typeof remoteActionSchema>;

export type RemoteRect = { x: number; y: number; width: number; height: number };
export type RemoteWork = { status: "idle" | "running" | "ready" | "failed"; error: string | null };
/** What the live view needs besides pixels. Never contains storage state. */
export type RemoteState = {
  sessionId: string;
  mode: "view" | "control" | "teach";
  pickPart: TeachPart | null;
  url: string;
  title: string;
  loading: boolean;
  tabs: Array<{ index: number; url: string; active: boolean }>;
  parts: Partial<Record<TeachPart, { kind: string; frames: number; rect: RemoteRect | null }>>;
  completion: string | null;
  teach: RemoteWork & { step: string | null; reply: string };
  test: RemoteWork & { response: string; step: string | null };
  expiresAt: string;
};
export type RemoteStreamMessage =
  | { type: "frame"; seq: number; image: string; width: number; height: number }
  | { type: "state"; state: RemoteState }
  | { type: "ping" }
  | { type: "closed"; reason: string };
