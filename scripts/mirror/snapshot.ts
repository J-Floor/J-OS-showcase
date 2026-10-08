import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SUPERPOWERS_DIR = "docs/superpowers";
const EXCLUDED_PATHS: readonly string[] = [
  ".claude",
  ".codex",
  ".github/workflows/superpowers-evidence.yml",
  "AGENTS.md",
  "docs/DEPLOYMENT.md",
  "scripts/agent-guard.test.ts",
  "scripts/agent-guard.ts",
];

export function isSuperpowersPath(path: string): boolean {
  return `/${path.toLowerCase()}/`.includes(`/${SUPERPOWERS_DIR}/`);
}

export function isExcludedPath(path: string): boolean {
  return (
    EXCLUDED_PATHS.some(
      (entry) => path === entry || path.startsWith(`${entry}/`),
    ) || isSuperpowersPath(path)
  );
}

type SnapshotOptions = { repoDir: string; ref: string; outDir: string };

function assertEmpty(outDir: string): void {
  let isDirectory: boolean;
  try {
    isDirectory = statSync(outDir).isDirectory();
  } catch {
    return;
  }
  if (!isDirectory) throw new Error(`outDir is not a directory: ${outDir}`);
  if (readdirSync(outDir).length > 0) {
    throw new Error(`outDir is not empty: ${outDir}`);
  }
}

async function extract({
  repoDir,
  ref,
  outDir,
}: SnapshotOptions): Promise<void> {
  const archive = Bun.spawn(
    ["git", "-C", repoDir, "archive", "--format=tar", ref],
    { stdout: "pipe", stderr: "pipe" },
  );
  const tar = Bun.spawn(["tar", "-x", "-C", outDir], {
    stdin: archive.stdout,
    stdout: "ignore",
    stderr: "pipe",
  });
  const [archiveCode, tarCode, archiveErr, tarErr] = await Promise.all([
    archive.exited,
    tar.exited,
    new Response(archive.stderr).text(),
    new Response(tar.stderr).text(),
  ]);
  if (archiveCode !== 0) {
    throw new Error(
      `git archive failed (${archiveCode}): ${archiveErr.trim()}`,
    );
  }
  if (tarCode !== 0) {
    throw new Error(`tar failed (${tarCode}): ${tarErr.trim()}`);
  }
}

function findSuperpowersDirs(root: string, dir: string, found: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    const rel = relative(root, full).split(sep).join("/");
    if (isSuperpowersPath(rel)) {
      found.push(rel);
      continue;
    }
    findSuperpowersDirs(root, full, found);
  }
}

export async function snapshot(
  opts: SnapshotOptions,
): Promise<{ removed: string[] }> {
  assertEmpty(opts.outDir);
  mkdirSync(opts.outDir, { recursive: true });
  await extract(opts);
  const removed: string[] = [];
  findSuperpowersDirs(opts.outDir, opts.outDir, removed);
  removed.push(
    ...EXCLUDED_PATHS.filter((rel) => existsSync(join(opts.outDir, rel))),
  );
  removed.sort();
  for (const rel of removed) {
    rmSync(join(opts.outDir, rel), { recursive: true });
  }
  return { removed };
}
