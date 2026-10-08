export type HashKind = "name" | "email" | "raw";

export const MAX_NAME_WORDS = 4;
export const MIN_NAME_KEY_LENGTH = 6;
export const MIN_RAW_KEY_LENGTH = 6;
/** Hex characters kept from each SHA-256 (64 bits), so the list fits a GitHub secret. */
export const HASH_HEX_LENGTH = 16;
/** Characters that split a whitespace-free run into raw candidates. */
export const RAW_DELIMITERS = new Set("/=:;,?&#@|\\()[]{}<>");
/** Most consecutive delimiter-separated parts the gate joins into one raw candidate. */
export const MAX_RAW_SPAN = 8;
export const EMAIL = /[A-Za-z0-9._%+-]+@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})/g;
const HASH_LINE = new RegExp(`^[0-9a-f]{${HASH_HEX_LENGTH}}$`);
const EMAIL_ENTRY = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RAW_FORBIDDEN = /[\s"'`]/;

export function nameKey(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function emailKey(text: string): string {
  return text.trim().toLowerCase();
}

export function rawKey(text: string): string {
  return text.trim();
}

export function digitsOf(text: string): string {
  return text.replace(/\D/g, "");
}

/** The `kind:key` string that is hashed; the gate builds its candidates with it too. */
export function tag(kind: HashKind, key: string): string {
  return `${kind}:${key}`;
}

export function hashTagged(tagged: string): string {
  return Bun.CryptoHasher.hash("sha256", tagged, "hex").slice(
    0,
    HASH_HEX_LENGTH,
  );
}

export function hashKey(kind: HashKind, key: string): string {
  return hashTagged(tag(kind, key));
}

export function isHash(line: string): boolean {
  return HASH_LINE.test(line);
}

/** Hash of a name form, or undefined when the form is too short or too long to match. */
export function nameHash(form: string): string | undefined {
  const key = nameKey(form);
  if (key.length < MIN_NAME_KEY_LENGTH) return undefined;
  if (key.split(" ").length > MAX_NAME_WORDS) return undefined;
  return hashKey("name", key);
}

export function emailHash(email: string): string {
  return hashKey("email", emailKey(email));
}

/** Hashes of a stored email and of every address the gate would extract from it. */
export function storedEmailHashes(value: string): string[] {
  const keys = new Set([emailKey(value)]);
  for (const m of value.matchAll(EMAIL)) keys.add(emailKey(m[0]));
  return [...keys].map((key) => hashKey("email", key));
}

/**
 * Hashes of one hand-typed secret: `raw` when it can be found as a token (no
 * whitespace or quotes, at least 6 characters), `email` when it has that
 * shape, and always its `name` form, so other case, markdown and quoting
 * still match. Empty when no layer could ever match it.
 */
export function rawEntryHashes(entry: string): string[] {
  const key = rawKey(entry);
  if (key === "") return [];
  const hashes: string[] = [];
  if (!RAW_FORBIDDEN.test(key) && key.length >= MIN_RAW_KEY_LENGTH) {
    hashes.push(hashKey("raw", key));
  }
  if (EMAIL_ENTRY.test(key)) hashes.push(emailHash(key));
  const name = nameHash(key);
  if (name !== undefined) hashes.push(name);
  return hashes;
}
