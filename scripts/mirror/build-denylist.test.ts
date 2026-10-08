import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildDenylist as build,
  checkSecretSize,
  MAX_SECRET_BYTES,
  rawHashes,
  readSkipList,
} from "./build-denylist.ts";
import { HASH_HEX_LENGTH, hashKey, type HashKind, isHash } from "./denyHash.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mirror-denylist-test-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function jsonl(name: string, rows: object[]): string {
  const path = join(dir, name);
  writeFileSync(path, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return path;
}

function buildDenylist(...args: Parameters<typeof build>): string[] {
  return build(...args).list;
}

function hashes(...entries: [HashKind, string][]): string[] {
  return [...new Set(entries.map(([kind, key]) => hashKey(kind, key)))].sort();
}

function name(key: string): [HashKind, string] {
  return ["name", key];
}

function email(key: string): [HashKind, string] {
  return ["email", key];
}

test("emits only sorted, de-duplicated truncated hashes", () => {
  const people = jsonl("people.jsonl", [
    { email: "Ann@jfloor.test", name: "Ann Example", phone: "+1 555 0100" },
  ]);
  const list = buildDenylist([people, people]);
  expect(list.every(isHash)).toBe(true);
  expect(list.every((line) => line.length === HASH_HEX_LENGTH)).toBe(true);
  expect(list).toEqual([...new Set(list)].sort());
  expect(list.join("\n").toLowerCase()).not.toContain("example");
});

test("collects emails and multi-word names in both word orders, never phones", () => {
  const people = jsonl("people.jsonl", [
    { email: "Ann@jfloor.test", name: "Ann Example", phone: "+1 555 0100" },
    { email: "bob@jfloor.test", name: "Bob", note: "Secret Note" },
  ]);
  const applications = jsonl("applications.jsonl", [
    { email: "ann@JFLOOR.test", firstName: "Cy", lastName: "Sample" },
    { firstName: "Solo", lastName: "", phone: "12 34" },
  ]);
  expect(buildDenylist([people, applications])).toEqual(
    hashes(
      email("ann@jfloor.test"),
      email("bob@jfloor.test"),
      name("ann example"),
      name("example ann"),
      name("example"),
      name("cy sample"),
      name("sample cy"),
      name("sample"),
    ),
  );
});

test("a longer name adds first-last pairs, folded and without diacritics", () => {
  const people = jsonl("people.jsonl", [
    { name: "Zoé Quillfeather" },
    { name: "Ida Marie Brandvoll" },
    { name: "Ida Marie de la Brandvoll" },
  ]);
  expect(buildDenylist([people])).toEqual(
    hashes(
      name("zoe quillfeather"),
      name("quillfeather zoe"),
      name("quillfeather"),
      name("ida marie brandvoll"),
      name("ida brandvoll"),
      name("brandvoll ida"),
      name("brandvoll"),
    ),
  );
});

test("a skipped word is not emitted alone; its other forms stay", () => {
  const people = jsonl("people.jsonl", [{ name: "Ann Tëster" }]);
  expect(buildDenylist([people], new Set(["tester"]))).toEqual(
    hashes(name("ann tester"), name("tester ann")),
  );
});

test("an exact full-name skip drops every variant of that name but keeps the email", () => {
  const people = jsonl("people.jsonl", [
    { name: "Ann Tëster", email: "ann@jfloor.test", phone: "+1 555 0100" },
    { name: "Bo Quillfeather" },
  ]);
  expect(buildDenylist([people], new Set(["ann tester"]))).toEqual(
    hashes(
      email("ann@jfloor.test"),
      name("tester ann"),
      name("tester"),
      name("bo quillfeather"),
      name("quillfeather bo"),
      name("quillfeather"),
    ),
  );
  const both = new Set(["ann tester", "tester ann", "tester"]);
  expect(buildDenylist([people], both)).not.toContain(
    hashKey("name", "tester ann"),
  );
});

test("reads the committed skip list by default", () => {
  const skip = readSkipList();
  expect(skip.has("member")).toBe(true);
  expect([...skip].some((word) => word.startsWith("#"))).toBe(false);
  const people = jsonl("people.jsonl", [{ name: "Ann Member" }]);
  expect(buildDenylist([people])).not.toContain(hashKey("name", "member"));
  expect(skip.has("j floor dev")).toBe(true);
});

test("drops name forms shorter than 6 characters but keeps every email", () => {
  const people = jsonl("people.jsonl", [
    { email: "v@b.c", name: "V L" },
    { firstName: "Ann", lastName: "Li" },
  ]);
  expect(buildDenylist([people])).toEqual(
    hashes(email("v@b.c"), name("ann li"), name("li ann")),
  );
});

test("a raw line hashes as raw and as its name form, plus email when it has that shape", () => {
  const secret = ["Pa$$", "w0rd!", "#9"].join("");
  const allowed = ["board", "thejfloor.com"].join("@");
  expect(rawHashes([secret, "", allowed, "Build in Zurich"])).toEqual({
    hashes: [
      hashKey("raw", secret),
      hashKey("name", "pa w0rd 9"),
      hashKey("raw", allowed),
      hashKey("email", allowed),
      hashKey("name", "board thejfloor com"),
      hashKey("name", "build in zurich"),
    ],
    skipped: 0,
  });
});

test("raw lines a shape layer already catches are skipped and counted", () => {
  const secret = ["k3y", "Zz9"].join("-");
  const covered = [
    [8, 8, 4, 4].join("."),
    `${["2a01", "4f8", "c17", "1234"].join(":")}::1`,
    ["2a01", "4f8", "c17", "1234"].join(":"),
    ["+41", "79", "555", "12", "34"].join(" "),
    ["4815", "16234", "2"].join(""),
    ["ann", "gmail.com"].join("@"),
    `https://${["happy", "otter", "123"].join("-")}.convex.cloud`,
  ];
  expect(rawHashes([...covered, secret])).toEqual({
    hashes: [hashKey("raw", secret), hashKey("name", "k3y zz9")],
    skipped: covered.length,
  });
});

test("a raw line no layer could match fails without echoing it", () => {
  const line = "a b c d e!";
  expect(() => rawHashes(["ok-token", line])).toThrow("Raw line 2");
  expect(() => rawHashes([line])).not.toThrow(line);
});

test("a raw line with surrounding whitespace or too many delimiters fails closed", () => {
  const padded = ` ${["k3y", "Zz9"].join("-")}`;
  expect(() => rawHashes([padded])).toThrow("Raw line 1 has leading");
  const split = Array.from({ length: 9 }, (_, i) => `p${i}`).join("/");
  expect(() => rawHashes(["", split])).toThrow("Raw line 2 has 8 or more");
});

test("a stored email also hashes every address the gate would extract from it", () => {
  const people = jsonl("people.jsonl", [
    { email: `O'Brien.x@jfloor.test`, name: "Ann Example" },
  ]);
  const list = buildDenylist([people]);
  expect(list).toContain(hashKey("email", "brien.x@jfloor.test"));
  expect(list).toContain(hashKey("email", "o'brien.x@jfloor.test"));
});

test("an export with rows but no name or email field fails; an empty one is fine", () => {
  const renamed = jsonl("renamed.jsonl", [{ fullName: "Ann Example" }]);
  expect(() => buildDenylist([renamed])).toThrow("none with an email or name");
  const people = jsonl("people.jsonl", [{ name: "Ann Example" }]);
  const empty = join(dir, "empty.jsonl");
  writeFileSync(empty, "");
  expect(buildDenylist([people, empty]).length).toBeGreaterThan(0);
  expect(() => buildDenylist([empty])).toThrow("would be empty");
});

test("raw lines join the person hashes", () => {
  const people = jsonl("people.jsonl", [{ name: "Ann Example" }]);
  const token = ["k3y", "Zz9"].join("-");
  expect(buildDenylist([people], new Set(), [token])).toContain(
    hashKey("raw", token),
  );
});

test("a list over the GitHub secret limit fails instead of being cut", () => {
  const line = "0".repeat(HASH_HEX_LENGTH);
  const lines = Math.floor(MAX_SECRET_BYTES / (HASH_HEX_LENGTH + 1));
  const fits = Array.from({ length: lines }, () => line).join("\n");
  expect(checkSecretSize(fits)).toBeLessThanOrEqual(MAX_SECRET_BYTES);
  expect(() => checkSecretSize(`${fits}\n${line}\n${line}`)).toThrow(
    "over the",
  );
});

test("the CLI reports skipped raw lines by count only", () => {
  const raw = join(dir, "raw.txt");
  const ip = [8, 8, 4, 4].join(".");
  writeFileSync(raw, `${ip}\n${["k3y", "Zz9"].join("-")}\n`);
  const script = join(import.meta.dir, "build-denylist.ts");
  const result = Bun.spawnSync(["bun", script, "--raw", raw]);
  expect(result.exitCode).toBe(0);
  const stderr = result.stderr.toString();
  expect(stderr).toContain(
    "skipped 1 raw entries already covered by shape rules",
  );
  expect(stderr).toContain("2 entries");
  expect(stderr).not.toContain(ip);
});

test("the CLI prints the size and exits non-zero over the limit", () => {
  const raw = join(dir, "raw.txt");
  const count = Math.ceil(MAX_SECRET_BYTES / (HASH_HEX_LENGTH + 1)) + 1;
  writeFileSync(
    raw,
    Array.from({ length: count }, (_, i) => `tok-${i}-x`).join("\n"),
  );
  const script = join(import.meta.dir, "build-denylist.ts");
  const result = Bun.spawnSync(["bun", script, "--raw", raw]);
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain("bytes");
  expect(result.stdout.toString()).toBe("");
});
