import type { HerdDocument, HerdStore } from "./store";

const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
local version = '0'
if current then
  local ok, decoded = pcall(cjson.decode, current)
  if ok and decoded and decoded.version then
    version = tostring(decoded.version)
  end
end
if version ~= ARGV[1] then
  return 'conflict'
end
redis.call('SET', KEYS[1], ARGV[2])
return 'ok'
`;

export function redisConfigFromEnv(env: NodeJS.ProcessEnv = process.env): { url: string; token: string } | null {
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token };
}

export function createRedisStore(url: string, token: string): HerdStore {
  const keyFor = (code: string) => `herdcheck:${code}`;

  const command = async (args: (string | number)[]): Promise<unknown> => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new Error(`Redis ${response.status}`);
    const payload = (await response.json()) as { result?: unknown; error?: string };
    if (payload.error) throw new Error(payload.error);
    return payload.result;
  };

  const read = async (code: string): Promise<HerdDocument | null> => {
    const raw = await command(["GET", keyFor(code)]);
    if (typeof raw !== "string" || !raw) return null;
    const parsed = JSON.parse(raw) as HerdDocument;
    if (!parsed || !Array.isArray(parsed.cows) || !Array.isArray(parsed.sightings)) return null;
    return parsed;
  };

  return {
    async create(code, doc) {
      const saved = { ...doc, version: 1 };
      const result = await command(["SET", keyFor(code), JSON.stringify(saved), "NX"]);
      if (result !== "OK") return "taken";
      return saved;
    },
    load: read,
    async change(code, mutate) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const current = await read(code);
        if (!current) return null;
        const next = { ...mutate(structuredClone(current)), version: current.version + 1 };
        const result = await command([
          "EVAL",
          CAS_SCRIPT,
          "1",
          keyFor(code),
          String(current.version),
          JSON.stringify(next),
        ]);
        if (result === "ok") return next;
      }
      throw new Error("Shared herd was busy. Try again.");
    },
  };
}
