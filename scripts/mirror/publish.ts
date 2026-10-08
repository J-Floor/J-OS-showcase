import { cpSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export type PublishOptions = {
  tree: string;
  remote: string;
  workDir: string;
  dryRun: boolean;
  now: Date;
  actionsDisabled: () => Promise<boolean>;
};

type PublishResult = {
  pushed: boolean;
  changed: boolean;
  files: number;
  diffStat: string;
};

const GITHUB_REPOS_URL = "https://api.github.com/repos";
const MIRROR_NAME = "J-OS mirror";
const MIRROR_EMAIL = "mirror@thejfloor.com";
const EMPTY_REPOSITORY = "empty repository";
const DATE_LENGTH = 10;

async function runGit(
  args: string[],
  secret: string,
  step: string,
): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    const detail = stderr.split(secret).join("<remote>").trim();
    throw new Error(`git ${step} failed (exit ${code}): ${detail}`);
  }
  return stdout;
}

export async function publish(opts: PublishOptions): Promise<PublishResult> {
  if (!(await opts.actionsDisabled())) {
    throw new Error(
      "Refusing to publish: Actions are not confirmed disabled on the showcase repository",
    );
  }
  const run = (args: string[], step: string) =>
    runGit(["-C", opts.workDir, ...args], opts.remote, step);

  await runGit(
    ["clone", "--quiet", opts.remote, opts.workDir],
    opts.remote,
    "clone",
  );

  for (const entry of readdirSync(opts.workDir)) {
    if (entry === ".git") continue;
    rmSync(join(opts.workDir, entry), { recursive: true, force: true });
  }
  for (const entry of readdirSync(opts.tree)) {
    cpSync(join(opts.tree, entry), join(opts.workDir, entry), {
      recursive: true,
      verbatimSymlinks: true,
    });
  }

  await run(["add", "-A"], "add");
  const countFiles = async () =>
    (await run(["ls-files"], "ls-files")).split("\n").filter(Boolean).length;
  const status = await run(["status", "--porcelain"], "status");
  if (status.trim() === "") {
    return {
      pushed: false,
      changed: false,
      files: await countFiles(),
      diffStat: "",
    };
  }

  const date = opts.now.toISOString().slice(0, DATE_LENGTH);
  await run(
    [
      "-c",
      `user.name=${MIRROR_NAME}`,
      "-c",
      `user.email=${MIRROR_EMAIL}`,
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "--no-verify",
      "-m",
      `Sync from main, ${date}`,
    ],
    "commit",
  );

  const commitCount = Number(
    (await run(["rev-list", "--count", "HEAD"], "rev-list")).trim(),
  );
  const diffStat =
    commitCount > 1
      ? (await run(["diff", "--stat", "HEAD~1"], "diff")).trim()
      : EMPTY_REPOSITORY;
  const files = await countFiles();

  if (opts.dryRun) return { pushed: false, changed: true, files, diffStat };

  await run(["push", "--quiet", "origin", "HEAD:main"], "push");
  return { pushed: true, changed: true, files, diffStat };
}

export function actionsDisabled(
  repo: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): () => Promise<boolean> {
  return async () => {
    try {
      const res = await fetchImpl(
        `${GITHUB_REPOS_URL}/${repo}/actions/permissions`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
          },
        },
      );
      if (res.status !== 200) return false;
      const body = (await res.json()) as { enabled?: unknown };
      return body.enabled === false;
    } catch {
      return false;
    }
  };
}
