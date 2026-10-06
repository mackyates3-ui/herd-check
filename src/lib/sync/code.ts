const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 16;

/** A share code is the secret. 16 characters from a 32-letter alphabet is 80 bits. */
export function createShareCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let raw = "";
  for (const byte of bytes) raw += ALPHABET[byte % ALPHABET.length];
  return formatShareCode(raw);
}

export function formatShareCode(raw: string): string {
  const code = normalizeShareCode(raw);
  return code.replace(/(.{4})/g, "$1-").replace(/-$/, "");
}

export function normalizeShareCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z2-9]/g, "");
}

export function isShareCode(raw: string): boolean {
  const code = normalizeShareCode(raw);
  return code.length === CODE_LENGTH && [...code].every((ch) => ALPHABET.includes(ch));
}
