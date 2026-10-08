import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { rawEntryHashes } from "./denyHash.ts";
import type { Finding } from "./gate.ts";

const AWS_KEY_PATTERN = new RegExp(`AKI${"A"}[A-Z2-7]{16}`);
const ALL_FILES = new Bun.Glob("**");

/** The hashed denylist for plaintext test entries, built as `--raw` lines are. */
export function hashedDenylist(...entries: string[]): Set<string> {
  return new Set(entries.flatMap(rawEntryHashes));
}

export async function fakeGitleaks(dir: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const file of ALL_FILES.scanSync({ cwd: dir, dot: true })) {
    const full = join(dir, file);
    if (!lstatSync(full).isFile()) continue;
    readFileSync(full, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (AWS_KEY_PATTERN.test(line)) {
          findings.push({ layer: "gitleaks", file, line: index + 1 });
        }
      });
  }
  return findings;
}

export function git(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync([
    "git",
    "-C",
    cwd,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "-c",
    "commit.gpgsign=false",
    ...args,
  ]);
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

export function writeTree(
  dir: string,
  files: Record<string, string | Uint8Array>,
): void {
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

export function commitAll(
  cwd: string,
  files: Record<string, string | Uint8Array>,
): void {
  writeTree(cwd, files);
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", "init");
}
