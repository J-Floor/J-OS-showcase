import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { actionsDisabled, publish, type PublishOptions } from "./publish.ts";
import { git } from "./test-helpers.ts";

let root: string;
let bare: string;
let tree: string;
let workN = 0;

function put(rel: string, content: string) {
  const p = join(tree, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

function opts(over: Partial<PublishOptions> = {}): PublishOptions {
  workN += 1;
  const workDir = join(root, `work-${workN}`);
  mkdirSync(workDir);
  return {
    tree,
    remote: bare,
    workDir,
    dryRun: false,
    now: new Date("2026-10-08T23:59:59Z"),
    actionsDisabled: async () => true,
    ...over,
  };
}

function bareHead(): string | null {
  const res = Bun.spawnSync([
    "git",
    "-C",
    bare,
    "rev-parse",
    "--verify",
    "main",
  ]);
  return res.exitCode === 0 ? res.stdout.toString().trim() : null;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mirror-publish-"));
  bare = join(root, "remote.git");
  tree = join(root, "tree");
  mkdirSync(tree);
  Bun.spawnSync(["git", "init", "--bare", "--initial-branch=main", bare]);
  put("a.txt", "alpha\n");
  put("sub/b.txt", "bravo\n");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("publish", () => {
  test("first live run creates one commit equal to the tree", async () => {
    const result = await publish(opts());
    expect(result.pushed).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.files).toBe(2);
    expect(result.diffStat).toBe("empty repository");
    expect(git(bare, "rev-list", "--count", "main")).toBe("1");
    expect(
      git(bare, "ls-tree", "-r", "--name-only", "main").split("\n"),
    ).toEqual(["a.txt", "sub/b.txt"]);
    expect(git(bare, "log", "-1", "--format=%an|%ae|%cn|%ce|%s", "main")).toBe(
      "J-OS mirror|mirror@thejfloor.com|J-OS mirror|mirror@thejfloor.com|Sync from main, 2026-10-08",
    );
    expect(git(bare, "show", "main:sub/b.txt")).toBe("bravo");
  });

  test("an unchanged tree changes nothing", async () => {
    await publish(opts());
    const head = bareHead();
    const result = await publish(opts());
    expect(result.changed).toBe(false);
    expect(result.pushed).toBe(false);
    expect(bareHead()).toBe(head);
  });

  test("dry run leaves the remote untouched", async () => {
    const result = await publish(opts({ dryRun: true }));
    expect(result.changed).toBe(true);
    expect(result.pushed).toBe(false);
    expect(bareHead()).toBeNull();
  });

  test("refuses before cloning when actions are not confirmed disabled", async () => {
    const o = opts({ actionsDisabled: async () => false });
    await expect(publish(o)).rejects.toThrow(/Actions/);
    expect(bareHead()).toBeNull();
    expect(existsSync(join(o.workDir, ".git"))).toBe(false);
  });

  test("deleted files disappear from the next commit", async () => {
    await publish(opts());
    rmSync(join(tree, "sub"), { recursive: true });
    put("a.txt", "alpha two\n");
    const result = await publish(
      opts({ now: new Date("2026-10-09T00:00:00Z") }),
    );
    expect(result.pushed).toBe(true);
    expect(result.diffStat).toContain("sub/b.txt");
    expect(git(bare, "ls-tree", "-r", "--name-only", "main")).toBe("a.txt");
    expect(git(bare, "rev-list", "--count", "main")).toBe("2");
    expect(git(bare, "log", "-1", "--format=%s", "main")).toBe(
      "Sync from main, 2026-10-09",
    );
  });

  test("a git failure throws without leaking the remote", async () => {
    const missing = join(root, "missing.git");
    const error = await publish(opts({ remote: missing })).catch(
      (e: Error) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(missing);
  });
});

describe("actionsDisabled", () => {
  const reply = (status: number, body: unknown) =>
    (async () =>
      new Response(JSON.stringify(body), {
        status,
      })) as unknown as typeof fetch;

  test("true only for 200 with enabled false", async () => {
    const check = actionsDisabled("o/r", "t", reply(200, { enabled: false }));
    expect(await check()).toBe(true);
  });

  test("false when enabled", async () => {
    const check = actionsDisabled("o/r", "t", reply(200, { enabled: true }));
    expect(await check()).toBe(false);
  });

  test("false on 404", async () => {
    expect(await actionsDisabled("o/r", "t", reply(404, {}))()).toBe(false);
  });

  test("false on network error", async () => {
    const failing = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await actionsDisabled("o/r", "t", failing)()).toBe(false);
  });

  test("sends bearer token to the permissions endpoint", async () => {
    let seen: { url: string; auth: string | null } | undefined;
    const spy = (async (url: string, init: RequestInit) => {
      seen = { url, auth: new Headers(init.headers).get("Authorization") };
      return new Response(JSON.stringify({ enabled: false }), { status: 200 });
    }) as unknown as typeof fetch;
    await actionsDisabled("o/r", "tok", spy)();
    expect(seen).toEqual({
      url: "https://api.github.com/repos/o/r/actions/permissions",
      auth: "Bearer tok",
    });
  });
});
