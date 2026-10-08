import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAX_RAW_SPAN,
  nameForms,
  nameHash,
  nameKey,
  RAW_DELIMITERS,
  rawEntryHashes,
  storedEmailHashes,
} from "./denyHash.ts";
import { isShapeCovered } from "./gate.ts";

const MIN_NAME_WORDS = 2;
const SKIP_FILE = join(import.meta.dir, "denylist-skip.txt");
/** GitHub Actions caps one secret at 48 KB. */
export const MAX_SECRET_BYTES = 48 * 1024;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function linesOf(path: string): string[] {
  return readFileSync(path, "utf8").split(/\r?\n/);
}

function rowsOf(path: string): Record<string, unknown>[] {
  return linesOf(path)
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function isFullName(value: string): boolean {
  return value.split(/\s+/).length >= MIN_NAME_WORDS;
}

export function readSkipList(path = SKIP_FILE): Set<string> {
  return new Set(
    linesOf(path)
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"))
      .map(nameKey),
  );
}

function delimiterCount(line: string): number {
  return [...line].filter((char) => RAW_DELIMITERS.has(char)).length;
}

function rawLineError(index: number, reason: string): Error {
  return new Error(`Raw line ${index + 1} ${reason}`);
}

export type RawResult = { hashes: string[]; skipped: number };

/**
 * Hashes of hand-typed secrets, one per line. A line a shape layer already
 * catches (IP, phone, ID, email, deployment or capability URL) is skipped, so
 * the secret holds only what nothing else can find. Throws, naming the line
 * number only, on a line the gate could not match whole.
 */
export function rawHashes(lines: string[]): RawResult {
  let skipped = 0;
  const hashes = lines.flatMap((line, index) => {
    if (line.trim() === "") return [];
    if (line !== line.trim()) {
      throw rawLineError(index, "has leading or trailing whitespace.");
    }
    if (delimiterCount(line) >= MAX_RAW_SPAN) {
      throw rawLineError(
        index,
        `has ${MAX_RAW_SPAN} or more delimiters, so it only matches standing alone.`,
      );
    }
    if (isShapeCovered(line)) {
      skipped += 1;
      return [];
    }
    const lineHashes = rawEntryHashes(line);
    if (lineHashes.length === 0) {
      throw rawLineError(
        index,
        "can never match: it has whitespace or quotes and no name or email form.",
      );
    }
    return lineHashes;
  });
  return { hashes, skipped };
}

function hasIdentity(row: Record<string, unknown>): boolean {
  return ["email", "name", "firstName", "lastName"].some(
    (field) => text(row[field]) !== "",
  );
}

export type Denylist = { list: string[]; skippedRaw: number };

/**
 * Name and email hashes from the people exports, plus the raw lines no shape
 * layer catches. Throws when a non-empty export has no row with a name or
 * email (a renamed field), or when the result is empty.
 */
export function buildDenylist(
  paths: string[],
  skip: Set<string> = readSkipList(),
  raw: string[] = [],
): Denylist {
  const { hashes: rawList, skipped } = rawHashes(raw);
  const hashes = new Set<string>(rawList);
  const addName = (form: string) => {
    if (skip.has(nameKey(form))) return;
    const hash = nameHash(form);
    if (hash !== undefined) hashes.add(hash);
  };
  for (const path of paths) {
    const rows = rowsOf(path);
    if (rows.length > 0 && !rows.some(hasIdentity)) {
      throw new Error(
        `${path} has ${rows.length} rows but none with an email or name field.`,
      );
    }
    for (const row of rows) {
      const email = text(row.email);
      if (email !== "") storedEmailHashes(email).forEach((h) => hashes.add(h));
      const name = text(row.name);
      if (isFullName(name)) nameForms(name).forEach(addName);
      const full = `${text(row.firstName)} ${text(row.lastName)}`.trim();
      if (isFullName(full)) nameForms(full).forEach(addName);
    }
  }
  if (hashes.size === 0) throw new Error("The denylist would be empty.");
  return { list: [...hashes].sort(), skippedRaw: skipped };
}

/** Byte size of the secret; throws when GitHub would refuse it. */
export function checkSecretSize(output: string): number {
  const bytes = Buffer.byteLength(output, "utf8");
  if (bytes > MAX_SECRET_BYTES) {
    throw new Error(
      `The denylist is ${bytes} bytes, over the ${MAX_SECRET_BYTES}-byte GitHub secret limit.`,
    );
  }
  return bytes;
}

function parseArgs(argv: string[]): { paths: string[]; raw: string[] } {
  const paths: string[] = [];
  const raw: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== "--raw") {
      paths.push(argv[i]);
      continue;
    }
    const file = argv[++i] ?? "";
    if (file === "") throw new Error("--raw needs a file");
    raw.push(...linesOf(file));
  }
  return { paths, raw };
}

if (import.meta.main) {
  const { paths, raw } = parseArgs(process.argv.slice(2));
  if (paths.length === 0 && raw.length === 0) {
    console.error("usage: build-denylist.ts <file.jsonl>... [--raw <file>]");
    process.exit(1);
  }
  let output: string;
  try {
    const { list, skippedRaw } = buildDenylist(paths, readSkipList(), raw);
    if (skippedRaw > 0) {
      console.error(
        `skipped ${skippedRaw} raw entries already covered by shape rules`,
      );
    }
    output = `${list.join("\n")}\n`;
    const bytes = checkSecretSize(output);
    console.error(`${list.length} entries, ${bytes} bytes`);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
  process.stdout.write(output);
}
