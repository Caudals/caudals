import { toNextJsHandler } from "better-auth/next-js";

import { getBetterAuth } from "@/lib/auth/better-auth";

export const runtime = "nodejs";

const handler = toNextJsHandler((request) => getBetterAuth().handler(request));

export const { DELETE, GET, PATCH, POST, PUT } = handler;
