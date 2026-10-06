import type { IncomingMessage, ServerResponse } from "node:http";
import { createShareCode } from "../src/lib/sync/code";
import { handleSync, type SyncRequestBody } from "../src/lib/sync/http";
import { createRedisStore, redisConfigFromEnv } from "../src/lib/sync/redis-store";

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    send(res, 405, { ok: false, error: "bad_request" });
    return;
  }
  const config = redisConfigFromEnv();
  if (!config) {
    send(res, 503, { ok: false, error: "not_configured" });
    return;
  }
  try {
    const body = (await readJson(req)) as SyncRequestBody;
    const result = await handleSync(body, createRedisStore(config.url, config.token), createShareCode);
    send(res, result.status, result.body);
  } catch {
    send(res, 400, { ok: false, error: "bad_request" });
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const existing = (req as IncomingMessage & { body?: unknown }).body;
  if (existing && typeof existing === "object") return existing;
  if (typeof existing === "string" && existing) return JSON.parse(existing) as unknown;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  if (text.length > 2_000_000) throw new Error("too large");
  return JSON.parse(text) as unknown;
}
