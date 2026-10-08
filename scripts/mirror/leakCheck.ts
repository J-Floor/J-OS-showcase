/**
 * The pre-push leak check shared by `bun run leaks` and the agent guard's
 * push gate: the mirror gate's real-tree test, then gitleaks over the whole
 * working tree (design docs included) when a gitleaks binary is available.
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const GATE_FILE = join("scripts", "mirror", "gate.test.ts");
export const GATE_SUITE = "real tree";
const GITLEAKS_CONFIG = join("scripts", "mirror", "gitleaks.toml");
const GITLEAKS_FOUND_LEAKS = 1;
const ERROR_LINES = 5;

export const GITLEAKS_MISSING_NOTICE =
  "gitleaks not installed; skipped the secret scan.";

export type LeakCheck =
  | { status: "pass"; output: string; notices: string[] }
  | { status: "missing" }
  | { status: "leak"; output: string }
  | { status: "error"; output: string; cause: string };

/** `GITLEAKS_BIN` when set, else a `gitleaks` on PATH. */
export function gitleaksBinary(): string | undefined {
  return process.env.GITLEAKS_BIN || Bun.which("gitleaks") || undefined;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Tracked plus untracked-not-ignored files that are regular files on disk
 *  (deleted files, directories, submodules and dangling links are skipped). */
export function listWorkingTree(repo: string): string[] {
  const result = spawnSync(
    "git",
    [
      "-C",
      repo,
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error("git ls-files failed");
  return result.stdout
    .split("\0")
    .filter((path) => path !== "" && isFile(join(repo, path)));
}

export function copyWorkingTree(
  repo: string,
  dest: string,
  files: string[] = listWorkingTree(repo),
): void {
  for (const path of files) {
    mkdirSync(dirname(join(dest, path)), { recursive: true });
    copyFileSync(join(repo, path), join(dest, path));
  }
}

function firstLines(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line !== "")
    .slice(0, ERROR_LINES)
    .join("\n");
}

type Run = { status: number | null; output: string; cause?: string };

function run(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv = process.env,
): Run {
  const result = spawnSync(command, args, {
    cwd,
    env,
    timeout: timeoutMs,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error)
    return { status: null, output, cause: result.error.message };
  if (result.status === null)
    return {
      status: null,
      output,
      cause: `${command} was stopped (${result.signal ?? "timeout"})`,
    };
  return {
    status: result.status,
    output,
    cause: firstLines(result.stderr ?? "") || undefined,
  };
}

/** A failed assertion in the real-tree suite is a finding; anything else that
 *  stops the test (an import error, no matching test, a throw) is not. */
function gateFoundLeaks(junit: string): boolean {
  return junit.includes('<failure type="AssertionError"');
}

function runGate(
  repo: string,
  gitleaks: string | undefined,
  timeoutMs: number,
): LeakCheck {
  const work = mkdtempSync(join(tmpdir(), "leak-gate-"));
  const report = join(work, "junit.xml");
  const env = { ...process.env };
  if (gitleaks === undefined) delete env.GITLEAKS_BIN;
  else env.GITLEAKS_BIN = gitleaks;
  try {
    const result = run(
      process.execPath,
      [
        "test",
        GATE_FILE,
        "-t",
        `^${GATE_SUITE} `,
        "--reporter=junit",
        "--reporter-outfile",
        report,
      ],
      repo,
      timeoutMs,
      env,
    );
    if (result.status === 0)
      return { status: "pass", output: result.output, notices: [] };
    const junit = existsSync(report) ? readFileSync(report, "utf8") : "";
    if (result.status !== null && gateFoundLeaks(junit))
      return { status: "leak", output: result.output };
    return {
      status: "error",
      output: result.output,
      cause: result.cause ?? `the gate exited with ${String(result.status)}`,
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function runGitleaksDir(
  repo: string,
  gitleaks: string,
  timeoutMs: number,
): LeakCheck {
  const scratch = mkdtempSync(join(tmpdir(), "leaks-"));
  try {
    copyWorkingTree(repo, scratch);
    const result = run(
      gitleaks,
      [
        "dir",
        ".",
        "--config",
        join(repo, GITLEAKS_CONFIG),
        "--ignore-gitleaks-allow",
        "--redact",
        "--no-banner",
      ],
      scratch,
      timeoutMs,
    );
    if (result.status === 0)
      return { status: "pass", output: result.output, notices: [] };
    if (result.status === GITLEAKS_FOUND_LEAKS)
      return { status: "leak", output: result.output };
    return {
      status: "error",
      output: result.output,
      cause: result.cause ?? `gitleaks exited with ${String(result.status)}`,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Runs the leak check on the checkout at `repo`. "missing" when that
 *  checkout has no gate (a branch from before it existed). */
export function checkLeaks(
  repo: string,
  timeoutMs: number,
  gitleaks: string | undefined = gitleaksBinary(),
): LeakCheck {
  if (!existsSync(join(repo, GATE_FILE))) return { status: "missing" };
  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(1, deadline - Date.now());
  const gate = runGate(repo, gitleaks, remaining());
  if (gate.status !== "pass") return gate;
  if (gitleaks === undefined)
    return { ...gate, notices: [GITLEAKS_MISSING_NOTICE] };
  const scan = runGitleaksDir(repo, gitleaks, remaining());
  return scan.status === "pass"
    ? { ...scan, output: gate.output + scan.output }
    : scan;
}
