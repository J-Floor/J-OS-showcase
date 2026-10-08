import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
  ALLOWED_IPV4,
  ALLOWED_IPV6,
  ALLOWED_URLS,
  BINARIES,
  DENIED_URL_HOSTS,
  type DeniedUrlHost,
  EMAIL_ADDRESSES,
  EMAIL_DOMAINS,
  IGNORE_PATHS,
} from "./allow.ts";
import {
  digitsOf,
  EMAIL,
  emailHash,
  emailKey,
  hashKey,
  hashTagged,
  isHash,
  MAX_NAME_WORDS,
  MAX_RAW_SPAN,
  MIN_NAME_KEY_LENGTH,
  MIN_RAW_KEY_LENGTH,
  nameHash,
  nameKey,
  RAW_DELIMITERS,
  rawKey,
  tag,
} from "./denyHash.ts";

type Layer =
  | "denylist"
  | "email"
  | "ipv4"
  | "ipv6"
  | "phone"
  | "convex-id"
  | "deployment"
  | "url"
  | "numeric-id"
  | "file"
  | "gitleaks"
  | "self-test";
export type Finding = { layer: Layer; file: string; line: number };
export type GateOptions = {
  denylist: Set<string>;
  gitleaks: (dir: string) => Promise<Finding[]>;
};

const BINARY_SNIFF_BYTES = 8000;
const MAX_OCTET = 255;
const IPV4_BITS = 32;
const IPV6_BITS = 128n;
const HEXTETS = 8;
const MIN_PREFIX_HEXTETS = 4;
const HEXTET_BITS = 16n;
const GLOBAL_UNICAST_SHIFT = 125n;
const MIN_PHONE_DIGITS = 8;
const MAX_PHONE_DIGITS = 15;
const PLACEHOLDER_ZERO_DIGITS = 7;
const MIN_BLOB_LENGTH = 24;
const TIMESTAMP_SECONDS_DIGITS = 10;
const TIMESTAMP_MS_DIGITS = 13;
const MS_PER_SECOND = 1000;
const EARLIEST_TIMESTAMP_MS = Date.UTC(2000, 0, 1);
const LATEST_TIMESTAMP_MS = Date.UTC(2100, 0, 1);
const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "pdf",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "zip",
  "gz",
]);
const FORBIDDEN_NAMES = new Set([
  ".env",
  ".dev.vars",
  ".npmrc",
  "credentials.json",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  ".gitleaks.toml",
  ".gitleaksignore",
  ".gitleaksbaseline",
]);
const FORBIDDEN_EXTENSIONS = [".pem", ".key", ".p12", ".pfx"];
const GITLEAKS_ALLOW = ["gitleaks", "allow"].join(":");
const GITLEAKS_CONFIG = join(import.meta.dir, "gitleaks.toml");
const APPROVED_BINARIES = new Map(BINARIES.map((b) => [b.path, b.sha256]));
const IGNORE_GLOBS = IGNORE_PATHS.map((pattern) => new Bun.Glob(pattern));

const IPV4 =
  /(?<!\d)(?<!\d\.)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?!\d)(?!\.\d)/g;
const IPV6 =
  /(?<![0-9a-f:])[0-9a-f]{1,4}(?:(?::[0-9a-f]{1,4}){2,7}|(?::[0-9a-f]{1,4}){0,6}::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,5})?)(?![0-9a-f:])/gi;
const PHONE = new RegExp(
  String.raw`\+\d(?:[ -]{0,2}\d){${MIN_PHONE_DIGITS - 1},${MAX_PHONE_DIGITS - 1}}`,
  "g",
);
const FICTIONAL_NANP = /^155501\d\d$/;
const CONVEX_ID = /\b[0-9a-z]{32}\b/g;
const DEPLOYMENT_NAME = String.raw`[a-z]+-[a-z]+-\d{3}`;
const DEPLOYMENT_URL = new RegExp(
  String.raw`\b${DEPLOYMENT_NAME}(?:\.[a-z0-9-]+)*\.convex\.[a-z]+\b`,
);
const DEPLOYMENT_VAR = new RegExp(
  String.raw`(?:\bCONVEX_DEPLOYMENT|[A-Z0-9_]*CONVEX_[A-Z0-9_]*URL)\b[^=:]*[=:]\s*["'\`]?(?:https?:\/\/|[a-z]+:)?${DEPLOYMENT_NAME}\b`,
);
const URL_HOST =
  /(?:(?<=\/\/)|(?<![\w.@\/-]))((?:[a-z0-9-]+\.)+[a-z]{2,})(?![a-z0-9-])(?::\d+)?(\/[^\s"'`<>()[\]{}\\]*)?/gi;
const NUMERIC_ID = /(?<![\w.])\d{9,13}(?!\w|\.\d)/g;
const BLOB_CHAR = /[A-Za-z0-9+=]/;
const ANY_PATH = /^\/./;
const RAW_RUN_SPLIT = /[\s"'`]+/;
const RAW_EDGE = /^[()[\]{}<>,;:.]+|[()[\]{}<>,;:.]+$/g;

/**
 * One truncated SHA-256 hash (HASH_HEX_LENGTH lowercase hex characters) per
 * line; blank lines are dropped. Throws on anything else or an empty list.
 */
export function parseDenylist(raw: string | undefined): Set<string> {
  const lines = (raw ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (lines.length === 0) throw new Error("The denylist is empty.");
  if (!lines.every(isHash)) {
    throw new Error("The denylist has a line that is not a truncated hash.");
  }
  return new Set(lines);
}

function nameCandidates(text: string, out: Set<string>): void {
  const key = nameKey(text);
  if (key === "") return;
  const words = key.split(" ");
  for (let i = 0; i < words.length; i++) {
    let window = "";
    for (let n = 0; n < MAX_NAME_WORDS && i + n < words.length; n++) {
      window = n === 0 ? words[i] : `${window} ${words[i + n]}`;
      if (window.length >= MIN_NAME_KEY_LENGTH) out.add(tag("name", window));
    }
  }
}

function addRaw(value: string, out: Set<string>): void {
  if (value.length >= MIN_RAW_KEY_LENGTH) out.add(tag("raw", value));
  const stripped = value.replace(RAW_EDGE, "");
  if (stripped !== value && stripped.length >= MIN_RAW_KEY_LENGTH) {
    out.add(tag("raw", stripped));
  }
}

function rawCandidates(run: string, out: Set<string>): void {
  if (run.length < MIN_RAW_KEY_LENGTH) return;
  addRaw(run, out);
  const starts = [0];
  const ends: number[] = [];
  for (let i = 0; i < run.length; i++) {
    if (!RAW_DELIMITERS.has(run[i])) continue;
    ends.push(i);
    starts.push(i + 1);
  }
  ends.push(run.length);
  starts.forEach((from, s) => {
    for (let e = s; e < ends.length && e - s < MAX_RAW_SPAN; e++) {
      if (ends[e] - from >= MIN_RAW_KEY_LENGTH) {
        addRaw(run.slice(from, ends[e]), out);
      }
    }
  });
}

/** Every `kind:key` a text could match: name windows, emails and raw tokens. */
function candidatesOf(text: string): Set<string> {
  const out = new Set<string>();
  nameCandidates(text, out);
  if (text.includes("@")) {
    for (const m of text.matchAll(EMAIL)) out.add(tag("email", emailKey(m[0])));
  }
  for (const run of text.split(RAW_RUN_SPLIT)) rawCandidates(rawKey(run), out);
  return out;
}

type DenyCheck = (text: string) => boolean;

/**
 * True when any candidate of a text hashes into the denylist. Repeated lines
 * and candidates already known to be clean are not hashed again.
 */
function denyCheck(denylist: Set<string>): DenyCheck {
  const lines = new Map<string, boolean>();
  const hashed = new Set<string>();
  const isDeniedCandidate = (tagged: string) => {
    if (hashed.has(tagged)) return false;
    if (denylist.has(hashTagged(tagged))) return true;
    hashed.add(tagged);
    return false;
  };
  return (text) => {
    let verdict = lines.get(text);
    if (verdict === undefined) {
      verdict = [...candidatesOf(text)].some(isDeniedCandidate);
      lines.set(text, verdict);
    }
    return verdict;
  };
}

type Entry = { path: string; full: string; symlink: boolean };

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function walk(dir: string, base = dir): Entry[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    const stat = lstatSync(full);
    if (stat.isDirectory()) return walk(full, base);
    const path = toPosix(relative(base, full));
    return [{ path, full, symlink: stat.isSymbolicLink() }];
  });
}

function isForbiddenFile(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (FORBIDDEN_NAMES.has(name)) return true;
  if (name.startsWith(".env.") && name !== ".env.example") return true;
  return FORBIDDEN_EXTENSIONS.some((extension) => name.endsWith(extension));
}

function isBinary(path: string, content: Buffer): boolean {
  const dot = path.lastIndexOf(".");
  const extension = dot === -1 ? "" : path.slice(dot + 1).toLowerCase();
  if (BINARY_EXTENSIONS.has(extension)) return true;
  return content.subarray(0, BINARY_SNIFF_BYTES).includes(0);
}

function isApprovedBinary(path: string, content: Buffer): boolean {
  const sha256 = createHash("sha256").update(content).digest("hex");
  return APPROVED_BINARIES.get(path) === sha256;
}

function isIgnored(path: string): boolean {
  return IGNORE_GLOBS.some((glob) => glob.match(path));
}

function isAllowedEmail(address: string, domain: string): boolean {
  if (EMAIL_ADDRESSES.includes(address.toLowerCase())) return true;
  const labels = domain.toLowerCase().split(".");
  return labels.some((_, index) =>
    EMAIL_DOMAINS.includes(labels.slice(index).join(".")),
  );
}

function ipv4ToInt(octets: number[]): number {
  return octets.reduce((acc, octet) => acc * (MAX_OCTET + 1) + octet, 0);
}

function ipv4Mask(bits: number): number {
  return bits === 0 ? 0 : (~0 << (IPV4_BITS - bits)) >>> 0;
}

const IPV4_RANGES = ALLOWED_IPV4.map((cidr) => {
  const [address, bits] = cidr.split("/");
  const mask = ipv4Mask(Number(bits));
  return {
    base: (ipv4ToInt(address.split(".").map(Number)) & mask) >>> 0,
    mask,
  };
});

function isAllowedIpv4(octets: number[]): boolean {
  const value = ipv4ToInt(octets);
  if (IPV4_RANGES.some(({ base, mask }) => (value & mask) >>> 0 === base)) {
    return true;
  }
  const [, b, c, d] = octets;
  return b === 0 && c === 0 && d === 0;
}

function ipv6ToBigInt(text: string): bigint | undefined {
  const halves = text.split("::");
  if (halves.length > 2) return undefined;
  const head = halves[0] === "" ? [] : halves[0].split(":");
  const tail =
    halves.length === 1 || halves[1] === "" ? [] : halves[1].split(":");
  const missing = HEXTETS - head.length - tail.length;
  const compressed = halves.length === 2;
  if (compressed ? missing < 1 : missing !== 0) return undefined;
  const zeros = Array.from({ length: compressed ? missing : 0 }, () => "0");
  const groups = [...head, ...zeros, ...tail];
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) {
    return undefined;
  }
  return groups.reduce(
    (acc, group) => (acc << HEXTET_BITS) | BigInt(parseInt(group, 16)),
    0n,
  );
}

const IPV6_RANGES = ALLOWED_IPV6.map((cidr) => {
  const [address, bits] = cidr.split("/");
  const shift = IPV6_BITS - BigInt(bits);
  return { prefix: (ipv6ToBigInt(address) as bigint) >> shift, shift };
});

/** A bare prefix such as a `/64` written as its first 4–7 hextets, zero-filled. */
function ipv6PrefixToBigInt(text: string): bigint | undefined {
  if (text.includes("::")) return undefined;
  const groups = text.split(":");
  if (groups.length < MIN_PREFIX_HEXTETS || groups.length >= HEXTETS) {
    return undefined;
  }
  const zeros = Array.from({ length: HEXTETS - groups.length }, () => "0");
  return ipv6ToBigInt([...groups, ...zeros].join(":"));
}

function isGlobalIpv6(text: string): boolean {
  const value = ipv6ToBigInt(text) ?? ipv6PrefixToBigInt(text);
  if (value === undefined || value >> GLOBAL_UNICAST_SHIFT !== 1n) return false;
  return !IPV6_RANGES.some(({ prefix, shift }) => value >> shift === prefix);
}

function hasEmail(line: string): boolean {
  if (!line.includes("@")) return false;
  return [...line.matchAll(EMAIL)].some((m) => !isAllowedEmail(m[0], m[1]));
}

function hasPublicIpv4(line: string): boolean {
  return [...line.matchAll(IPV4)].some((m) => {
    const octets = m.slice(1, 5).map(Number);
    if (octets.some((octet) => octet > MAX_OCTET)) return false;
    return !isAllowedIpv4(octets);
  });
}

function hasGlobalIpv6(line: string): boolean {
  return [...line.matchAll(IPV6)].some((m) => isGlobalIpv6(m[0]));
}

function isPlaceholderPhone(digits: string): boolean {
  if (FICTIONAL_NANP.test(digits)) return true;
  return /^0+$/.test(digits.slice(-PLACEHOLDER_ZERO_DIGITS));
}

function hasPhone(line: string): boolean {
  return [...line.matchAll(PHONE)].some(
    (m) => !isPlaceholderPhone(digitsOf(m[0])),
  );
}

function hasConvexId(line: string): boolean {
  return [...line.matchAll(CONVEX_ID)].some(
    (m) => /[a-z]/.test(m[0]) && /\d/.test(m[0]),
  );
}

function hasDeployment(line: string): boolean {
  return DEPLOYMENT_URL.test(line) || DEPLOYMENT_VAR.test(line);
}

function hostMatches(rule: string, host: string): boolean {
  if (rule.startsWith("*.")) return host.endsWith(rule.slice(1));
  return host === rule;
}

function isDeniedUrl(rule: DeniedUrlHost, host: string, path: string): boolean {
  if (!hostMatches(rule.host, host)) return false;
  if (!(rule.path ?? ANY_PATH).test(path)) return false;
  if (rule.placeholderPhonePath) {
    return !isPlaceholderPhone(digitsOf(path.split("/")[1] ?? ""));
  }
  return true;
}

function hasCapabilityUrl(line: string): boolean {
  return [...line.matchAll(URL_HOST)].some((m) => {
    const host = m[1].toLowerCase();
    const path = m[2] ?? "";
    if (
      ALLOWED_URLS.some(
        (url) => url.replace(/^https?:\/\//, "") === `${host}${path}`,
      )
    ) {
      return false;
    }
    return DENIED_URL_HOSTS.some((rule) => isDeniedUrl(rule, host, path));
  });
}

function isTimestamp(digits: string): boolean {
  const value = Number(digits);
  const ms =
    digits.length === TIMESTAMP_MS_DIGITS
      ? value
      : digits.length === TIMESTAMP_SECONDS_DIGITS
        ? value * MS_PER_SECOND
        : undefined;
  return (
    ms !== undefined && ms >= EARLIEST_TIMESTAMP_MS && ms < LATEST_TIMESTAMP_MS
  );
}

function blobLength(line: string, start: number, end: number): number {
  let left = start;
  let right = end;
  while (left > 0 && BLOB_CHAR.test(line[left - 1])) left -= 1;
  while (right < line.length && BLOB_CHAR.test(line[right])) right += 1;
  return right - left;
}

function hasNumericId(line: string): boolean {
  return [...line.matchAll(NUMERIC_ID)].some((m) => {
    const start = m.index as number;
    if (blobLength(line, start, start + m[0].length) >= MIN_BLOB_LENGTH) {
      return false;
    }
    return !isTimestamp(m[0]);
  });
}

function compare(a: Finding, b: Finding): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.line !== b.line) return a.line - b.line;
  return a.layer < b.layer ? -1 : a.layer > b.layer ? 1 : 0;
}

/** The shape layers a line trips; `ignored` paths skip the ID and deployment layers. */
function shapeLayers(text: string, ignored = false): Layer[] {
  const layers: Layer[] = [];
  if (hasEmail(text)) layers.push("email");
  if (hasPublicIpv4(text)) layers.push("ipv4");
  if (hasGlobalIpv6(text)) layers.push("ipv6");
  if (hasPhone(text)) layers.push("phone");
  if (!ignored && hasConvexId(text)) layers.push("convex-id");
  if (!ignored && hasDeployment(text)) layers.push("deployment");
  if (hasCapabilityUrl(text)) layers.push("url");
  if (!ignored && hasNumericId(text)) layers.push("numeric-id");
  return layers;
}

/** True when a shape layer already catches this text, so the denylist need not hold it. */
export function isShapeCovered(text: string): boolean {
  return shapeLayers(text).length > 0;
}

function scanFile(entry: Entry, isDenied: DenyCheck): Finding[] {
  const findings: Finding[] = [];
  const add = (layer: Layer, line: number) =>
    findings.push({ layer, file: entry.path, line });
  if (isDenied(entry.path)) add("denylist", 0);
  if (entry.symlink || isForbiddenFile(entry.path)) {
    add("file", 0);
    return findings;
  }
  const content = readFileSync(entry.full);
  if (isBinary(entry.path, content)) {
    if (!isApprovedBinary(entry.path, content)) add("file", 0);
    return findings;
  }
  const ignored = isIgnored(entry.path);
  content
    .toString("utf8")
    .split("\n")
    .forEach((text, index) => {
      const line = index + 1;
      if (isDenied(text)) add("denylist", line);
      if (text.includes(GITLEAKS_ALLOW)) add("file", line);
      for (const layer of shapeLayers(text, ignored)) add(layer, line);
    });
  return findings;
}

export async function scan(dir: string, opts: GateOptions): Promise<Finding[]> {
  if (opts.denylist.size === 0) throw new Error("The denylist is empty.");
  const isDenied = denyCheck(opts.denylist);
  const findings = walk(dir).flatMap((entry) => scanFile(entry, isDenied));
  for (const leak of await opts.gitleaks(dir)) {
    findings.push({ layer: "gitleaks", file: leak.file, line: leak.line });
  }
  return findings.sort(compare);
}

const AWS_KEY = `AKI${"A"}QWERTZUIOPLKJHGF`;

// Planted values are assembled at runtime so this file passes its own gate.
export const PLANTED = {
  name: ["Zyx", "wv Test", "person"].join(""),
  email: ["someone", "gmail.com"].join("@"),
  ipv4: [8, 8, 4, 4].join("."),
  ipv6: `${["2a01", "4f8", "1", "2"].join(":")}::1`,
  phone: ["+41", "79", "555", "12", "34"].join(" "),
  convexId: `k57${"x9".repeat(14)}q`,
  deployment: ["happy", "otter", "123"].join("-"),
  region: ["mars", "north", "7"].join("-"),
  url: `https://${["chat", "whatsapp", "com"].join(".")}/${"Qw".repeat(11)}`,
  numericId: ["4815", "16234", "2"].join(""),
  awsKey: AWS_KEY,
  secret: ["Pa$$", "w0rd!", "#9"].join(""),
} as const;

// One hash per kind, so each planted denylist file proves its own kind.
const PLANTED_DENYLIST = [
  nameHash(PLANTED.name) as string,
  emailHash(PLANTED.email),
  hashKey("raw", PLANTED.secret),
];

type Planted = {
  layer: Layer;
  file: string;
  content: string | Uint8Array | { symlink: string };
};

const SAMPLE_TREE: Planted[] = [
  {
    layer: "denylist",
    file: "denylist.txt",
    content: `Signed, ${PLANTED.name}\n`,
  },
  {
    layer: "denylist",
    file: "denylist-email.txt",
    content: `mailto:${PLANTED.email.toUpperCase()}\n`,
  },
  {
    layer: "denylist",
    file: "denylist-raw.txt",
    content: `fetch("http://router.lan/${PLANTED.secret}/join")\n`,
  },
  { layer: "email", file: "email.txt", content: `${PLANTED.email}\n` },
  { layer: "ipv4", file: "ipv4.txt", content: `${PLANTED.ipv4}\n` },
  { layer: "ipv6", file: "ipv6.txt", content: `${PLANTED.ipv6}\n` },
  { layer: "phone", file: "phone.txt", content: `${PLANTED.phone}\n` },
  {
    layer: "convex-id",
    file: "convex-id.txt",
    content: `${PLANTED.convexId}\n`,
  },
  {
    layer: "deployment",
    file: "deployment.txt",
    content: `${PLANTED.deployment}.convex.cloud\n`,
  },
  {
    layer: "deployment",
    file: "deployment-regional.txt",
    content: `https://${PLANTED.deployment}.${PLANTED.region}.convex.site\n`,
  },
  { layer: "url", file: "url.txt", content: `${PLANTED.url}\n` },
  {
    layer: "numeric-id",
    file: "numeric-id.txt",
    content: `lock ${PLANTED.numericId}\n`,
  },
  { layer: "file", file: "unlisted.png", content: "planted\n" },
  { layer: "file", file: "blob.dat", content: new Uint8Array([1, 2, 0, 3]) },
  { layer: "file", file: "link.txt", content: { symlink: "email.txt" } },
  { layer: "file", file: ".env", content: "PLANTED=1\n" },
  { layer: "file", file: ".gitleaks.toml", content: 'title = "planted"\n' },
  {
    layer: "gitleaks",
    file: "gitleaks.txt",
    content: `aws_access_key_id = ${PLANTED.awsKey} # ${GITLEAKS_ALLOW}\n`,
  },
];

async function selfTest(opts: GateOptions): Promise<Layer[]> {
  const dir = mkdtempSync(join(tmpdir(), "mirror-self-test-"));
  try {
    for (const { file, content } of SAMPLE_TREE) {
      const full = join(dir, file);
      mkdirSync(dirname(full), { recursive: true });
      if (content instanceof Uint8Array || typeof content === "string") {
        writeFileSync(full, content);
      } else {
        symlinkSync(content.symlink, full);
      }
    }
    const found = await scan(dir, {
      ...opts,
      denylist: new Set([...opts.denylist, ...PLANTED_DENYLIST]),
    });
    const missed = SAMPLE_TREE.filter(
      ({ layer, file }) =>
        !found.some((f) => f.layer === layer && f.file === file),
    ).map(({ layer }) => layer);
    return [...new Set(missed)];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function gate(dir: string, opts: GateOptions): Promise<Finding[]> {
  const misses = await selfTest(opts);
  if (misses.length > 0) {
    return misses.map((layer) => ({
      layer: "self-test",
      file: layer,
      line: 0,
    }));
  }
  return scan(dir, opts);
}

type GitleaksRecord = { File?: unknown; StartLine?: unknown };

function readReport(path: string, dir: string, cwd: string): Finding[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("The gitleaks report is missing or not valid JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("The gitleaks report is not a list.");
  }
  return parsed.map((record: GitleaksRecord) => {
    const line = record.StartLine;
    if (typeof record.File !== "string" || !Number.isInteger(line)) {
      throw new Error("The gitleaks report has an unexpected shape.");
    }
    const file = toPosix(relative(dir, resolve(cwd, record.File)));
    return { layer: "gitleaks", file, line: line as number };
  });
}

function gitleaksEnv(): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GITLEAKS_")),
  );
}

export function runGitleaks(
  binary = "gitleaks",
): (dir: string) => Promise<Finding[]> {
  return async (target) => {
    const dir = resolve(target);
    const work = mkdtempSync(join(tmpdir(), "mirror-gitleaks-"));
    const ignoreDir = join(work, "ignore");
    const report = join(work, "report.json");
    mkdirSync(ignoreDir);
    try {
      let exitCode: number;
      try {
        const child = Bun.spawn(
          [
            binary,
            "dir",
            dir,
            "--config",
            GITLEAKS_CONFIG,
            "--ignore-gitleaks-allow",
            "--gitleaks-ignore-path",
            ignoreDir,
            "--no-banner",
            "--redact",
            "--report-format",
            "json",
            "--report-path",
            report,
            "--exit-code",
            "0",
          ],
          {
            cwd: work,
            env: gitleaksEnv(),
            stdin: "ignore",
            stdout: "ignore",
            stderr: "ignore",
          },
        );
        exitCode = await child.exited;
      } catch {
        throw new Error("gitleaks could not be started; is it installed?");
      }
      if (exitCode !== 0) {
        throw new Error(`gitleaks exited with code ${exitCode}.`);
      }
      return readReport(report, dir, work);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  };
}
