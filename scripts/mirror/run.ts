import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Finding, gate, parseDenylist, runGitleaks } from "./gate.ts";
import { actionsDisabled, publish } from "./publish.ts";
import { snapshot } from "./snapshot.ts";

const DEFAULT_REF = "origin/main";
const SHOWCASE_REPOSITORY = "J-Floor/J-OS-showcase";
const REDACTED_PATH = "<path redacted>";

type RunDeps = { gitleaks?: (dir: string) => Promise<Finding[]> };

type Args = {
  dryRun: boolean;
  ref: string;
  denylistFile: string | undefined;
  repoDir: string;
};

function valueOf(argv: string[], index: number, flag: string): string {
  const value = argv[index] ?? "";
  if (value === "") throw new Error(`${flag} needs a value`);
  return value;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: false,
    ref: DEFAULT_REF,
    denylistFile: undefined,
    repoDir: process.cwd(),
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--dry-run") args.dryRun = true;
    else if (flag === "--ref") args.ref = valueOf(argv, ++i, flag);
    else if (flag === "--denylist-file") {
      args.denylistFile = valueOf(argv, ++i, flag);
    } else if (flag === "--repo") args.repoDir = valueOf(argv, ++i, flag);
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return args;
}

function report(findings: Finding[]): void {
  const deniedPaths = new Set(
    findings
      .filter((f) => f.layer === "denylist" && f.line === 0)
      .map((f) => f.file),
  );
  for (const f of findings) {
    if (f.layer === "self-test") {
      console.log(`Self-test missed: ${f.file}`);
      continue;
    }
    const file = deniedPaths.has(f.file) ? REDACTED_PATH : f.file;
    console.log(`${f.layer} ${file}:${f.line}`);
  }
  console.log(`Gate failed with ${findings.length} finding(s).`);
}

export async function main(
  argv: string[],
  env: Record<string, string | undefined>,
  deps: RunDeps = {},
): Promise<number> {
  const token = env.MIRROR_TOKEN ?? "";
  const work = mkdtempSync(join(tmpdir(), "mirror-run-"));
  try {
    const args = parseArgs(argv);
    const denylist = parseDenylist(
      args.denylistFile
        ? readFileSync(args.denylistFile, "utf8")
        : env.MIRROR_DENYLIST,
    );
    const tree = join(work, "tree");
    const { removed } = await snapshot({
      repoDir: args.repoDir,
      ref: args.ref,
      outDir: tree,
    });
    const findings = await gate(tree, {
      denylist,
      gitleaks: deps.gitleaks ?? runGitleaks(),
    });
    if (findings.length > 0) {
      report(findings);
      return 1;
    }
    console.log(`Removed paths: ${removed.join(", ") || "none"}`);
    console.log("Gate: clean");
    if (token === "") {
      if (!args.dryRun) throw new Error("MIRROR_TOKEN is empty.");
      console.log("Dry run without MIRROR_TOKEN: publish skipped.");
      return 0;
    }
    const result = await publish({
      tree,
      remote: `https://x-access-token:${token}@github.com/${SHOWCASE_REPOSITORY}.git`,
      workDir: join(work, "publish"),
      dryRun: args.dryRun,
      now: new Date(),
      actionsDisabled: actionsDisabled(SHOWCASE_REPOSITORY, token),
    });
    console.log(`Files: ${result.files}`);
    console.log(`Changed: ${result.changed}`);
    console.log(`Diff stat: ${result.diffStat || "none"}`);
    console.log(`Pushed: ${result.pushed}`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      token === "" ? message : message.split(token).join("<token>"),
    );
    return 1;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2), process.env));
}
