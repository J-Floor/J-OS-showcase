import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Finding,
  gate,
  type GateOptions,
  parseDenylist,
  PLANTED,
  runGitleaks,
  scan,
} from "./gate.ts";
import { buildDenylist } from "./build-denylist.ts";
import { HASH_HEX_LENGTH, hashKey } from "./denyHash.ts";
import { copyWorkingTree, listWorkingTree } from "./leakCheck.ts";
import { isExcludedPath } from "./snapshot.ts";
import { fakeGitleaks, hashedDenylist, writeTree } from "./test-helpers.ts";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const APPROVED_BINARY = "apps/web/public/pwa-64x64.png";
const GITLEAKS_ALLOW = ["gitleaks", "allow"].join(":");
const REAL_GITLEAKS = process.env.GITLEAKS_BIN;
const NAME = PLANTED.name;
const REAL_TREE_TIMEOUT_MS = 60_000;

let root: string;
const locked: string[] = [];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mirror-gate-"));
});

afterEach(() => {
  for (const path of locked.splice(0)) chmodSync(path, 0o700);
  rmSync(root, { recursive: true, force: true });
});

function tree(files: Record<string, string | Uint8Array>): string {
  const dir = mkdtempSync(join(root, "tree-"));
  writeTree(dir, files);
  return dir;
}

const options: GateOptions = {
  denylist: hashedDenylist(NAME),
  gitleaks: fakeGitleaks,
};

describe("parseDenylist", () => {
  test("keeps trimmed hashes and drops blank lines", () => {
    const hash = hashKey("name", "ann example");
    expect(parseDenylist(`  ${hash} \n\n${hash}\r\n`)).toEqual(new Set([hash]));
  });

  test("anything but lowercase hex of the truncated length fails closed", () => {
    const hash = hashKey("name", "ann example");
    const full = Bun.CryptoHasher.hash("sha256", "name:ann example", "hex");
    expect(hash).toHaveLength(HASH_HEX_LENGTH);
    expect(full.startsWith(hash)).toBe(true);
    for (const line of [hash.toUpperCase(), full, hash.slice(1), `${hash}0`]) {
      expect(() => parseDenylist(line)).toThrow("not a truncated hash");
    }
  });

  test("an empty or blank list fails closed", () => {
    expect(() => parseDenylist(undefined)).toThrow("empty");
    expect(() => parseDenylist("  \n \t\n")).toThrow("empty");
  });

  test("a plaintext line fails without echoing it", () => {
    const hash = hashKey("name", "ann example");
    let error: unknown;
    try {
      parseDenylist(`${hash}\n${NAME}\n`);
    } catch (caught) {
      error = caught;
    }
    expect(String((error as Error).message)).toContain("not a truncated hash");
    expect(String((error as Error).message)).not.toContain(NAME);
  });
});

describe("denylist matching", () => {
  const ACCENTED = ["Zyxwé", "Testperson"].join(" ");
  const nfd = (text: string) => text.normalize("NFD");
  const nfc = (text: string) => text.normalize("NFC");

  async function deniedLines(entries: string[], lines: string[]) {
    const dir = tree({ "a.txt": lines.join("\n") });
    const denylist = hashedDenylist(...entries);
    const findings = await scan(dir, { ...options, denylist });
    return findings.filter((f) => f.layer === "denylist").map((f) => f.line);
  }

  test("matches across case, in content and in paths", async () => {
    const dir = tree({
      "notes.txt": `first\nhello ${NAME.toLowerCase()}!\n`,
      [`people/${NAME.toUpperCase()}.txt`]: "nothing here\n",
    });
    expect(await scan(dir, options)).toEqual([
      { layer: "denylist", file: "notes.txt", line: 2 },
      { layer: "denylist", file: `people/${NAME.toUpperCase()}.txt`, line: 0 },
    ]);
  });

  test("NFD text matches an NFC entry and the reverse", async () => {
    expect(await deniedLines([nfc(ACCENTED)], [nfd(ACCENTED)])).toEqual([1]);
    expect(await deniedLines([nfd(ACCENTED)], [nfc(ACCENTED)])).toEqual([1]);
  });

  test("any run of spaces or punctuation separates words on both sides", async () => {
    const [first, last] = NAME.split(" ");
    expect(
      await deniedLines(
        [`${first}   ${last}`],
        [
          `${first}  ${last}`,
          `${first}\t${last}`,
          `${first}${last}`,
          `${first.toLowerCase()}-${last.toLowerCase()}.md`,
        ],
      ),
    ).toEqual([1, 2, 4]);
  });

  test("diacritics and case are ignored on both sides", async () => {
    const plain = ACCENTED.normalize("NFD").replace(/\p{M}/gu, "");
    expect(await deniedLines([ACCENTED], [plain.toUpperCase()])).toEqual([1]);
    expect(await deniedLines([plain], [ACCENTED])).toEqual([1]);
  });

  test("a built 'Last, First' entry matches either word order", async () => {
    const [first, last] = ACCENTED.split(" ");
    const people = join(root, "people.jsonl");
    writeFileSync(people, JSON.stringify({ name: ACCENTED }) + "\n");
    const denylist = new Set(buildDenylist([people], new Set()).list);
    const dir = tree({
      "a.txt": [`${last}, ${first}`, `${first} ${last}`, `${first}`].join("\n"),
    });
    const findings = await scan(dir, { ...options, denylist });
    expect(findings.map((f) => f.line)).toEqual([1, 2]);
  });

  test("an IPv4 entry is matched as a token, not inside other digits", async () => {
    const ip = [203, 0, 113, 9].join(".");
    const digits = ["2030", "113", "90"].join("");
    expect(
      await deniedLines(
        [ip],
        [`host ${ip}.`, `id ${digits}`, `http://${ip}:8080/`, `${ip}0`],
      ),
    ).toEqual([1, 3]);
  });

  test("a name entry matches whole words only", async () => {
    expect(
      await deniedLines(
        ["Rossini"],
        ["Rossinis text", "rossini, again", "Anna Rossini", "Signorossini"],
      ),
    ).toEqual([2, 3]);
  });

  test("a slug matches whole words only", async () => {
    expect(
      await deniedLines(
        ["anna-rossi"],
        ["docs/anna-rossi.md", "xanna-rossi", "anna-rossia", "anna-rossi2"],
      ),
    ).toEqual([1]);
  });

  test("an email matches inside other text, in any case", async () => {
    const email = ["ann", "jfloor.test"].join("@");
    expect(
      await deniedLines(
        [email],
        [`mailto:${email.toUpperCase()}`, `<${email}>`, `x${email}z`],
      ),
    ).toEqual([1, 2]);
  });

  test("a symbol-heavy secret matches as a token, in quotes and as a path segment", async () => {
    expect(
      await deniedLines(
        [PLANTED.secret],
        [
          `const wifi = "${PLANTED.secret}";`,
          `wifi=${PLANTED.secret}`,
          `see https://router.lan/${PLANTED.secret}/join?x=1`,
          `(${PLANTED.secret}).`,
          `x${PLANTED.secret}y`,
          "nothing",
        ],
      ),
    ).toEqual([1, 2, 3, 4]);
  });

  test("a raw entry matches in other case, wrapped in markdown and inside a path", async () => {
    expect(
      await deniedLines(
        [PLANTED.secret],
        [
          `**${PLANTED.secret}**`,
          `_${PLANTED.secret.toLowerCase()}_`,
          `wifi: ${PLANTED.secret.toUpperCase()}`,
          `docs/${PLANTED.secret}.txt`,
        ],
      ),
    ).toEqual([1, 2, 3, 4]);
  });

  test("an invite code matches in other case and a slug before a dot", async () => {
    const invite = ["invite", "7q2x"].join("");
    const slug = ["happy", "otter", "123"].join("-");
    expect(
      await deniedLines(
        [invite, slug],
        [
          `code=${invite.toUpperCase()}`,
          `notes/${slug}.md`,
          `see ${slug}.convex.cloud`,
          "nothing",
        ],
      ),
    ).toEqual([1, 2, 3]);
  });

  test("an IPv6 prefix matches in upper case, with or without a length", async () => {
    const prefix = ["2a01", "4f8", "c17", "1234"].join(":");
    expect(
      await deniedLines(
        [prefix],
        [`prefix ${prefix.toUpperCase()}/64`, `route ${prefix}::/64`],
      ),
    ).toEqual([1, 2]);
  });

  test("an IPv6 prefix matches the start of a longer address", async () => {
    const prefix = ["2001", "db8", "85a3", "8d3"].join(":");
    expect(
      await deniedLines([prefix], [`addr ${prefix}:1234::1`, "nothing"]),
    ).toEqual([1]);
  });

  test("an empty denylist fails closed", async () => {
    const dir = tree({ "a.txt": "x\n" });
    await expect(
      scan(dir, { ...options, denylist: new Set() }),
    ).rejects.toThrow();
  });
});

describe("scan layers", () => {
  test("email outside the allowed domains and addresses", async () => {
    const dir = tree({
      "a.ts": [
        `const to = "${PLANTED.email}";`,
        `const me = "${["someone", "thejfloor.com"].join("@")}";`,
        `const no = "${["noreply", "thejfloor.com"].join("@")}";`,
        `const gh = "${["1234+someone", "users.noreply.github.com"].join("@")}";`,
        `const ok = "board@thejfloor.com noreply@github.com x@app.example.com";`,
      ].join("\n"),
    });
    expect(await scan(dir, options)).toEqual([
      { layer: "email", file: "a.ts", line: 1 },
      { layer: "email", file: "a.ts", line: 2 },
      { layer: "email", file: "a.ts", line: 3 },
      { layer: "email", file: "a.ts", line: 4 },
    ]);
  });

  test("public IPv4 address", async () => {
    const dir = tree({ "a.txt": `\n\nhost ${PLANTED.ipv4}.\n` });
    expect(await scan(dir, options)).toEqual([
      { layer: "ipv4", file: "a.txt", line: 3 },
    ]);
  });

  test("global IPv6 addresses outside the documentation prefix", async () => {
    const other = ["2600", "1f18", "aa", "bb", "cc", "dd", "ee", "ff"].join(
      ":",
    );
    const dir = tree({
      "a.txt": [
        `listen [${PLANTED.ipv6}]:443`,
        `allow ${PLANTED.ipv6.replace("::1", "::/64")}`,
        `peer ${other.toUpperCase()}.`,
        `prefix ${["3fff", "1"].join("::")}`,
        `bare /64 ${["2a01", "4f8", "c17", "1234"].join(":").toUpperCase()}`,
        `bare /48 ${["2600", "1f18", "aa", "bb"].join(":")}/48`,
      ].join("\n"),
    });
    expect(await scan(dir, options)).toEqual([
      { layer: "ipv6", file: "a.txt", line: 1 },
      { layer: "ipv6", file: "a.txt", line: 2 },
      { layer: "ipv6", file: "a.txt", line: 3 },
      { layer: "ipv6", file: "a.txt", line: 4 },
      { layer: "ipv6", file: "a.txt", line: 5 },
      { layer: "ipv6", file: "a.txt", line: 6 },
    ]);
  });

  test("documentation, local and IPv6-looking non-addresses are clean", async () => {
    const dir = tree({
      "a.ts": [
        "ipInCidrs('2001:db8:1:2::1', ['2001:db8::/32']);",
        "loopback ::1, unspecified ::, link-local fe80::1%eth0",
        "unique-local fd00::1 and fc00:1:2::7, mapped ::ffff:10.0.0.5",
        "multicast ff02::1, all ::/0",
        "at 12:30:45 or 23:59:59; MAC 3c:5a:b4:01:02:03",
        "too many groups 1:2:3:4:5:6:7:8:9",
        "a::before, dd::after, std::vector, sha256:2a01abcd",
        "doc prefix 2001:db8:1:2, ula fd12:3456:789a:1, link fe80:1:2:3",
        "at 12:34:56:78, MAC aa:bb:cc:dd:ee:ff, css ff:ff:ff:ff",
        "three groups 2a01:4f8:c17 only",
      ].join("\n"),
    });
    expect(await scan(dir, options)).toEqual([]);
  });

  test("international phone number", async () => {
    const dir = tree({
      "a.md": `Call ${PLANTED.phone} today\nor ${PLANTED.phone.replaceAll(" ", "  ")}\n`,
    });
    expect(await scan(dir, options)).toEqual([
      { layer: "phone", file: "a.md", line: 1 },
      { layer: "phone", file: "a.md", line: 2 },
    ]);
  });

  test("placeholder phones are safe, a real-looking one is not", async () => {
    const dir = tree({
      "a.md": [
        ["+41", "79", "000", "00", "00"].join(" "),
        ["+1", "555", "0100"].join(" "),
        ["+1", "555", "01", "99"].join("-"),
        ["+1", "555", "0200"].join(" "),
        PLANTED.phone,
      ].join("\n"),
    });
    expect(await scan(dir, options)).toEqual([
      { layer: "phone", file: "a.md", line: 4 },
      { layer: "phone", file: "a.md", line: 5 },
    ]);
  });

  test("N.0.0.0 version strings are safe, other public quads are not", async () => {
    const dir = tree({
      "a.txt": [
        `Chrome/${[125, 0, 0, 0].join(".")} Safari`,
        `host ${[125, 1, 2, 3].join(".")}`,
        `edge ${[172, 32, 0, 1].join(".")} vs ${[172, 31, 0, 1].join(".")}`,
      ].join("\n"),
    });
    expect(await scan(dir, options)).toEqual([
      { layer: "ipv4", file: "a.txt", line: 2 },
      { layer: "ipv4", file: "a.txt", line: 3 },
    ]);
  });

  test("Convex document id", async () => {
    const dir = tree({ "a.json": `{"_id": "${PLANTED.convexId}"}\n` });
    expect(await scan(dir, options)).toEqual([
      { layer: "convex-id", file: "a.json", line: 1 },
    ]);
  });

  test("deployment name in a Convex URL and as CONVEX_DEPLOYMENT", async () => {
    const dir = tree({
      "a.ts": `fetch("https://${PLANTED.deployment}.convex.cloud/api");\n`,
      "b.env.example": `CONVEX_DEPLOYMENT=dev:${PLANTED.deployment} # team\n`,
    });
    expect(await scan(dir, options)).toEqual([
      { layer: "deployment", file: "a.ts", line: 1 },
      { layer: "deployment", file: "b.env.example", line: 1 },
    ]);
  });

  test("regional deployment hosts and *_CONVEX_*URL values", async () => {
    const host = `${PLANTED.deployment}.${PLANTED.region}`;
    const dir = tree({
      "a.yml": [
        `  VITE_CONVEX_SITE_URL: https://${host}.convex.site`,
        `fetch("https://${host}.convex.cloud/api")`,
        `VITE_CONVEX_URL="https://${PLANTED.deployment}"`,
        `CONVEX_SITE_URL=${PLANTED.deployment}`,
        "VITE_CONVEX_SITE_URL: ${{ secrets.VITE_CONVEX_SITE_URL }}",
        `see ${PLANTED.deployment}.example.com and ${host}.convex-docs.org`,
      ].join("\n"),
    });
    expect(await scan(dir, options)).toEqual([
      { layer: "deployment", file: "a.yml", line: 1 },
      { layer: "deployment", file: "a.yml", line: 2 },
      { layer: "deployment", file: "a.yml", line: 3 },
      { layer: "deployment", file: "a.yml", line: 4 },
    ]);
  });

  test("capability URLs on denied hosts", async () => {
    const code = "Zx9".repeat(7);
    const dir = tree({
      "a.ts": [
        `const invite = "${PLANTED.url}";`,
        `open("https://${["wa", "me"].join(".")}/${["4179", "555", "1234"].join("")}")`,
        `https://${["maps", "app", "goo", "gl"].join(".")}/${code}`,
        `<a href="https://${["goo", "gl"].join(".")}/${code}">`,
        `drive: https://${["drive", "google", "com"].join(".")}/file/d/${code}`,
        `https://${["docs", "google", "com"].join(".")}/document/d/${code}/edit`,
        `https://www.${["notion", "so"].join(".")}/team/${code}`,
        `https://acme.${["notion", "site"].join(".")}/${code}`,
        `https://${["slack", "com"].join(".")}/archives/${code}`,
        `https://acme.${["slack", "com"].join(".")}/x`,
        `https://${["calendar", "google", "com"].join(".")}/calendar/u/0`,
        `${["meet", "google", "com"].join(".")}/abc-defg-hij`,
        `https://us02web.${["zoom", "us"].join(".")}/j/${code}`,
        `https://${["CHAT", "WHATSAPP", "COM"].join(".")}/${code}`,
      ].join("\n"),
    });
    const urls = Array.from({ length: 14 }, (_, index) => ({
      layer: "url" as const,
      file: "a.ts",
      line: index + 1,
    }));
    expect(await scan(dir, options)).toEqual([
      urls[0],
      { layer: "numeric-id", file: "a.ts", line: 2 },
      ...urls.slice(1),
    ]);
  });

  test("the allowlisted invite passes and another invite on its host still fails", async () => {
    const host = ["chat", "whatsapp", "com"].join(".");
    const dir = tree({
      "a.ts": [
        `const ok = "https://${host}/EXAMPLEINVITE";`,
        `const bad = "https://${host}/EXAMPLEINVITE2";`,
        `const other = "https://${host}/ExampleInvite";`,
      ].join("\n"),
    });
    expect(await scan(dir, options)).toEqual([
      { layer: "url", file: "a.ts", line: 2 },
      { layer: "url", file: "a.ts", line: 3 },
    ]);
  });

  test("other URLs on those hosts' neighbours are clean", async () => {
    const dir = tree({
      "a.ts": [
        "const link = `https://wa.me/${phone(host)}`;",
        `https://${["wa", "me"].join(".")}/15550103`,
        `https://${["slack", "com"].join(".")} and https://${["zoom", "us"].join(".")}/pricing`,
        "https://www.google.com/maps/search/?api=1&query=Somewhere",
        "https://notslack.com/x https://example.com/chat.whatsapp.com",
        `contact ${["team", "slack.com"].join("@")}`,
        "https://developers.google.com/recaptcha/docs/v3",
      ].join("\n"),
    });
    expect(await scan(dir, options)).toEqual([
      { layer: "email", file: "a.ts", line: 6 },
    ]);
  });

  test("standalone 9 to 13 digit integers", async () => {
    const dir = tree({
      "a.ts": [
        `const lock = ${PLANTED.numericId};`,
        `smartlockId: "${["227", "5180", "4167"].join("")}",`,
        `/smartlock/${["123", "456", "789"].join("")}/action`,
        `id ${["9999", "9999", "99999"].join("")}.`,
      ].join("\n"),
    });
    expect(await scan(dir, options)).toEqual(
      [1, 2, 3, 4].map((line) => ({
        layer: "numeric-id" as const,
        file: "a.ts",
        line,
      })),
    );
  });

  test("timestamps, decimals, blobs, identifiers and short runs are not ids", async () => {
    const blob = `${"Ab+".repeat(6)}=${["4815", "16234", "2"].join("")}=${"Cd".repeat(4)}`;
    const dir = tree({
      "a.ts": [
        `const at = ${["1800", "0000", "00000"].join("")}; // ms`,
        `const s = ${["1767", "139", "200"].join("")};`,
        "z-index: 2147483647;",
        `pi ${["3", ["1415", "92653"].join("")].join(".")} and ${["123", "456", "789"].join("")}.5`,
        `hash "${blob}"`,
        `sha ${"a1b2c3d4e5f6".repeat(2)}${["1234", "5678", "90"].join("")}`,
        `<g id="svg-${["810", "799", "356"].join("")}_4216">`,
        "count 12345678 and 12345678901234",
      ].join("\n"),
      "bun.lock": `"x": ${PLANTED.numericId},\n`,
      "apps/web/convex/_generated/api.d.ts": `// ${PLANTED.numericId}\n`,
    });
    expect(await scan(dir, options)).toEqual([]);
  });

  test("unlisted, NUL-carrying and tampered binaries", async () => {
    const dir = tree({
      "x.png": "not really a png",
      "blob.dat": new Uint8Array([1, 2, 0, 3]),
      [APPROVED_BINARY]: "tampered",
    });
    expect(await scan(dir, options)).toEqual([
      { layer: "file", file: APPROVED_BINARY, line: 0 },
      { layer: "file", file: "blob.dat", line: 0 },
      { layer: "file", file: "x.png", line: 0 },
    ]);
  });

  test("symlinks are findings, whatever they point at", async () => {
    const dir = tree({ "a.txt": "clean\n" });
    symlinkSync("a.txt", join(dir, "link.txt"));
    symlinkSync("/nonexistent", join(dir, "dangling"));
    expect(await scan(dir, options)).toEqual([
      { layer: "file", file: "dangling", line: 0 },
      { layer: "file", file: "link.txt", line: 0 },
    ]);
  });

  test("secret-bearing and scanner-config file names", async () => {
    const names = [
      ".env",
      "apps/web/.env.local",
      "apps/web/.dev.vars",
      ".npmrc",
      "certs/server.pem",
      "certs/server.key",
      "certs/client.p12",
      "certs/client.pfx",
      "home/.ssh/id_rsa",
      "home/.ssh/id_ed25519",
      "config/credentials.json",
      ".gitleaks.toml",
      "sub/.gitleaksignore",
      ".gitleaksbaseline",
    ];
    const dir = tree({
      ...Object.fromEntries(names.map((name) => [name, "x\n"])),
      "apps/web/.env.example": "A=\n",
      "scripts/mirror/gitleaks.toml": "[extend]\n",
    });
    expect(await scan(dir, options)).toEqual(
      [...names]
        .sort()
        .map((file) => ({ layer: "file" as const, file, line: 0 })),
    );
  });

  test(`an inline ${GITLEAKS_ALLOW} comment is a finding`, async () => {
    const dir = tree({ "a.ts": `\nconst x = 1; // ${GITLEAKS_ALLOW}\n` });
    expect(await scan(dir, options)).toEqual([
      { layer: "file", file: "a.ts", line: 2 },
    ]);
  });

  test("gitleaks findings are kept, stripped to layer, file and line", async () => {
    const dir = tree({ "a.txt": "clean\n" });
    const leaky = {
      layer: "gitleaks",
      file: "a.txt",
      line: 7,
      secret: PLANTED.awsKey,
    } as Finding;
    const findings = await scan(dir, {
      ...options,
      gitleaks: async () => [leaky],
    });
    expect(findings).toEqual([{ layer: "gitleaks", file: "a.txt", line: 7 }]);
    expect(JSON.stringify(findings)).not.toContain(PLANTED.awsKey);
  });

  test("clean values raise nothing", async () => {
    const dir = tree({
      "a.md": [
        "Write to a@example.com, x@jfloor.test or board@thejfloor.com.",
        "Docs range 203.0.113.42, LAN 10.0.0.1, 192.168.1.20, 0.0.0.0.",
        "Version 1.2.3, dotted run 1.2.3.4.5, kebab happy-otter-123.",
        "Number +41 79 and 32 hex chars in prose: none.",
      ].join("\n"),
      "bun.lock": `"x": "${"ab12".repeat(8)}",\n`,
      "apps/web/convex/_generated/api.d.ts": `// ${PLANTED.convexId} https://${PLANTED.deployment}.convex.cloud\n`,
      [APPROVED_BINARY]: readFileSync(join(REPO_ROOT, APPROVED_BINARY)),
      "apps/web/.env.example": "VITE_CONVEX_URL=\n",
    });
    expect(await scan(dir, options)).toEqual([]);
  });

  test("findings never carry a matched value", async () => {
    const planted = Object.values(PLANTED);
    const dir = tree({
      "all.txt": planted.join("\n"),
      [`${NAME}.txt`]: "x\n",
    });
    const findings = await scan(dir, options);
    expect(findings.length).toBeGreaterThan(0);
    const json = JSON.stringify(findings).toLowerCase();
    for (const value of planted) {
      if (value === NAME) continue;
      expect(json).not.toContain(value.toLowerCase());
    }
  });

  test("an unreadable file fails closed", async () => {
    const dir = tree({ "a.txt": "x\n" });
    if (process.getuid?.() === 0) return;
    chmodSync(join(dir, "a.txt"), 0o000);
    locked.push(join(dir, "a.txt"));
    await expect(scan(dir, options)).rejects.toThrow();
  });
});

describe("gate", () => {
  test("passes its self-test, then reports the real tree", async () => {
    const dir = tree({ "a.ts": `const to = "${PLANTED.email}";\n` });
    expect(await gate(dir, options)).toEqual([
      { layer: "email", file: "a.ts", line: 1 },
    ]);
  });

  test("a clean tree passes", async () => {
    const dir = tree({ "a.ts": "export const x = 1;\n" });
    expect(await gate(dir, options)).toEqual([]);
  });

  test("a broken layer fails the self-test without scanning the tree", async () => {
    const dir = tree({ "a.ts": `const to = "${PLANTED.email}";\n` });
    expect(await gate(dir, { ...options, gitleaks: async () => [] })).toEqual([
      { layer: "self-test", file: "gitleaks", line: 0 },
    ]);
  });

  test("a gitleaks that obeys the tree's own config fails the self-test", async () => {
    const obeysTreeConfig = async (dir: string) =>
      existsSync(join(dir, ".gitleaks.toml")) ? [] : fakeGitleaks(dir);
    const dir = tree({ "a.ts": "export const x = 1;\n" });
    expect(await gate(dir, { ...options, gitleaks: obeysTreeConfig })).toEqual([
      { layer: "self-test", file: "gitleaks", line: 0 },
    ]);
  });
});

describe("runGitleaks", () => {
  function fakeBinary(body: string): string {
    const path = join(root, "gitleaks");
    writeFileSync(path, `#!/bin/sh\n${body}\n`);
    chmodSync(path, 0o755);
    return path;
  }

  const WRITE_REPORT = `dir="$2"
while [ $# -gt 0 ]; do
	if [ "$1" = "--report-path" ]; then out="$2"; fi
	shift
done`;

  test("a missing binary rejects", async () => {
    const dir = tree({ "a.txt": "x\n" });
    await expect(runGitleaks("/nonexistent/gitleaks")(dir)).rejects.toThrow();
  });

  test("parses File and StartLine into relative findings", async () => {
    const dir = tree({ "sub/a.txt": "x\n" });
    const binary = fakeBinary(`${WRITE_REPORT}
printf '[{"File":"%s/sub/a.txt","StartLine":4,"Secret":"REDACTED","Match":"REDACTED"}]' "$dir" > "$out"`);
    expect(await runGitleaks(binary)(dir)).toEqual([
      { layer: "gitleaks", file: "sub/a.txt", line: 4 },
    ]);
  });

  test("pins the config, ignores allow comments and ignore files, runs from a clean cwd", async () => {
    const dir = tree({ "a.txt": "x\n" });
    const log = join(root, "invocation.txt");
    const binary =
      fakeBinary(`printf '%s\\n' "$@" "cwd=$PWD" "env=\${GITLEAKS_CONFIG:-unset}" > "${log}"
${WRITE_REPORT}
printf '[]' > "$out"`);
    const previous = process.env.GITLEAKS_CONFIG;
    process.env.GITLEAKS_CONFIG = join(root, "elsewhere.toml");
    try {
      await runGitleaks(binary)(dir);
    } finally {
      if (previous === undefined) delete process.env.GITLEAKS_CONFIG;
      else process.env.GITLEAKS_CONFIG = previous;
    }
    const args = readFileSync(log, "utf8").split("\n");
    const after = (flag: string) => args[args.indexOf(flag) + 1];
    expect(after("--config")).toBe(join(import.meta.dir, "gitleaks.toml"));
    expect(args).toContain("--ignore-gitleaks-allow");
    const ignorePath = after("--gitleaks-ignore-path");
    expect(ignorePath.startsWith(tmpdir())).toBe(true);
    const cwd = args.find((arg) => arg.startsWith("cwd="))?.slice(4) ?? "";
    expect(cwd.startsWith(tmpdir())).toBe(true);
    expect(cwd.startsWith(dir)).toBe(false);
    expect(args).toContain("env=unset");
  });

  test("a non-zero exit rejects", async () => {
    const dir = tree({ "a.txt": "x\n" });
    const binary = fakeBinary(`${WRITE_REPORT}
printf '[]' > "$out"
exit 1`);
    await expect(runGitleaks(binary)(dir)).rejects.toThrow();
  });

  test("a malformed report rejects without echoing it", async () => {
    const dir = tree({ "a.txt": "x\n" });
    const binary = fakeBinary(`${WRITE_REPORT}
printf 'not json ${PLANTED.phone}' > "$out"`);
    const error = await runGitleaks(binary)(dir).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).not.toContain(PLANTED.phone);
  });

  test.skipIf(!REAL_GITLEAKS)(
    "the real binary ignores the tree's config, ignore file and allow comments",
    async () => {
      const key = `aws_access_key_id = ${PLANTED.awsKey}`;
      const dir = tree({
        ".gitleaks.toml": 'title = "no rules"\n',
        "a.txt": `${key}\n`,
        "b.txt": `${key} # ${GITLEAKS_ALLOW}\n`,
      });
      const findings = await runGitleaks(REAL_GITLEAKS)(dir);
      expect(findings.map((f) => f.file).sort()).toEqual(["a.txt", "b.txt"]);
    },
  );
});

describe("real tree", () => {
  test(
    "the working tree minus design docs passes the scan",
    async () => {
      const dir = mkdtempSync(join(root, "repo-"));
      const files = listWorkingTree(REPO_ROOT).filter(
        (path) => !isExcludedPath(path),
      );
      copyWorkingTree(REPO_ROOT, dir, files);
      const gitleaks = REAL_GITLEAKS
        ? runGitleaks(REAL_GITLEAKS)
        : async () => [];
      expect(
        await scan(dir, { denylist: hashedDenylist(NAME), gitleaks }),
      ).toEqual([]);
    },
    REAL_TREE_TIMEOUT_MS,
  );
});
