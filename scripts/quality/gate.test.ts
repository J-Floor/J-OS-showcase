import { describe, expect, test } from "bun:test";

import {
	checkCrap,
	checkDry,
	isDryFile,
	parseCrapEdn,
	parseDryEdn,
	type CrapEntry,
} from "./gate.ts";

function entry(name: string, namespace: string, crap: number): CrapEntry {
	return { name, namespace, crap };
}

describe("parseCrapEdn", () => {
	test("reads scores, including nil", () => {
		const text = `{:entries [
  {:name "a", :namespace "m.one", :complexity 3, :coverage 75.0, :crap 3.1}
  {:name "b", :namespace "m.two", :complexity 2, :coverage nil, :crap nil}
]}`;
		expect(parseCrapEdn(text)).toEqual([
			{ name: "a", namespace: "m.one", crap: 3.1 },
			{ name: "b", namespace: "m.two", crap: null },
		]);
	});

	test("throws on no entries, so an empty or truncated file cannot pass", () => {
		expect(() => parseCrapEdn("")).toThrow("no entries");
		expect(() => parseCrapEdn("{:entries [")).toThrow("no entries");
	});

	test("throws on an entry it cannot read, so a format change cannot pass silently", () => {
		const text = `{:entries [{:name "a", :renamed "m"}]}`;
		expect(() => parseCrapEdn(text)).toThrow("crap.edn");
	});
});

describe("parseDryEdn", () => {
	test("reads both sides of a pair", () => {
		const text = `{:candidates [
 {:score 1.0
  :language "typescript"
  :left {:file "a.ts", :start-line 15, :end-line 28}
  :right {:file "b.ts", :start-line 3, :end-line 16}
  :left-nodes 236
  :right-nodes 236}
]}`;
		expect(parseDryEdn(text)).toEqual([
			{
				left: { file: "a.ts", startLine: 15 },
				right: { file: "b.ts", startLine: 3 },
			},
		]);
	});

	test("throws on a pair it cannot read", () => {
		expect(() => parseDryEdn(`{:candidates [{:score 1.0}]}`)).toThrow(
			"dry.edn"
		);
	});
});

describe("checkCrap", () => {
	const THRESHOLD = 30;

	test("passes a score at the threshold and fails one above it", () => {
		const sources = [
			{ path: "src/m/a.ts", text: "export function ok() {}\nexport function bad() {}\n" },
		];
		expect(
			checkCrap([entry("ok", "m.a", 30)], sources, THRESHOLD)
		).toEqual([]);
		const problems = checkCrap([entry("bad", "m.a", 30.1)], sources, THRESHOLD);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain("bad");
		expect(problems[0]).toContain("src/m/a.ts");
	});

	test("ignores a nil score", () => {
		const sources = [{ path: "src/m/a.ts", text: "function a() {}\n" }];
		expect(
			checkCrap([{ name: "a", namespace: "m.a", crap: null }], sources, THRESHOLD)
		).toEqual([]);
	});

	test("skips a function containing JSX, but not a generic that looks like a tag", () => {
		const sources = [
			{
				path: "src/m/view.tsx",
				text: `export function View() { return <div />; }
export function logic() { return new Map<string, number>(); }
export const Frag = () => <></>;
`,
			},
		];
		expect(checkCrap([entry("View", "m.view", 99)], sources, THRESHOLD)).toEqual([]);
		expect(checkCrap([entry("Frag", "m.view", 99)], sources, THRESHOLD)).toEqual([]);
		expect(checkCrap([entry("logic", "m.view", 99)], sources, THRESHOLD)).toHaveLength(1);
	});

	test("skips demo and generated files", () => {
		const sources = [
			{ path: "src/m/a.demo.tsx", text: "export function a() {}\n" },
			{ path: "src/generated/b.ts", text: "export function b() {}\n" },
		];
		expect(checkCrap([entry("a", "m.a.demo", 99)], sources, THRESHOLD)).toEqual([]);
		expect(checkCrap([entry("b", "generated.b", 99)], sources, THRESHOLD)).toEqual([]);
	});

	test("maps convex namespaces and resolves a class method through its module", () => {
		const sources = [
			{ path: "convex/door.ts", text: "export function open() {}\n" },
			{ path: "src/m/box.ts", text: "export class Box { pack() {} }\n" },
		];
		expect(checkCrap([entry("open", "convex.door", 99)], sources, THRESHOLD)[0]).toContain("convex/door.ts");
		expect(checkCrap([entry("pack", "m.box.Box", 99)], sources, THRESHOLD)[0]).toContain("src/m/box.ts");
	});

	test("scores a class constructor", () => {
		const sources = [
			{ path: "src/m/box.ts", text: "export class Box { constructor() {} }\n" },
		];
		const problems = checkCrap([entry("constructor", "m.box.Box", 99)], sources, THRESHOLD);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain("src/m/box.ts:1");
	});

	test("matches a method to its own class when two classes share a method name", () => {
		const sources = [
			{
				path: "src/m/views.ts",
				text: "export class First {\n\trender() {}\n}\nexport class Second {\n\trender() {}\n}\n",
			},
		];
		const first = checkCrap([entry("render", "m.views.First", 99)], sources, THRESHOLD);
		const second = checkCrap([entry("render", "m.views.Second", 99)], sources, THRESHOLD);
		expect(first[0]).toContain("src/m/views.ts:2");
		expect(second[0]).toContain("src/m/views.ts:5");
	});

	test("does not match a plain function to a class method of the same name", () => {
		const sources = [
			{ path: "src/m/a.ts", text: "export class Box { pack() {} }\n" },
		];
		expect(checkCrap([entry("pack", "m.a", 99)], sources, THRESHOLD)[0]).toContain("cannot resolve function");
	});

	test("a crap-ignore above a JSX function is stale, because JSX is skipped anyway", () => {
		const sources = [
			{
				path: "src/m/view.tsx",
				text: "// crap-ignore -- not needed\nexport function View() { return <div />; }\n",
			},
		];
		const problems = checkCrap([entry("View", "m.view", 99)], sources, THRESHOLD);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain("stale");
	});

	test("reports a namespace or function it cannot resolve, never skips it", () => {
		const sources = [{ path: "src/m/a.ts", text: "function a() {}\n" }];
		expect(checkCrap([entry("a", "m.gone", 1)], sources, THRESHOLD)[0]).toContain("cannot resolve");
		expect(checkCrap([entry("gone", "m.a", 99)], sources, THRESHOLD)[0]).toContain("cannot resolve");
	});

	test("reports an ambiguous namespace", () => {
		const sources = [
			{ path: "src/m/a.ts", text: "function a() {}\n" },
			{ path: "src/m/a.tsx", text: "function a() {}\n" },
		];
		expect(checkCrap([entry("a", "m.a", 1)], sources, THRESHOLD)[0]).toContain("cannot resolve");
	});

	test("crap-ignore with a reason exempts the function below it", () => {
		const sources = [
			{
				path: "src/m/a.ts",
				text: "// crap-ignore -- pointer drag\nexport function drag() {}\n",
			},
		];
		expect(checkCrap([entry("drag", "m.a", 99)], sources, THRESHOLD)).toEqual([]);
	});

	test("crap-ignore without a reason is a problem", () => {
		const sources = [
			{ path: "src/m/a.ts", text: "// crap-ignore\nexport function drag() {}\n" },
		];
		const problems = checkCrap([entry("drag", "m.a", 99)], sources, THRESHOLD);
		expect(problems.some((problem) => problem.includes("reason"))).toBe(true);
	});

	test("a crap-ignore the function no longer needs is a problem", () => {
		const sources = [
			{
				path: "src/m/a.ts",
				text: "// crap-ignore -- pointer drag\nexport function drag() {}\n",
			},
		];
		const problems = checkCrap([entry("drag", "m.a", 2)], sources, THRESHOLD);
		expect(problems[0]).toContain("stale");
	});

	test("a crap-ignore not directly above a function is a problem", () => {
		const sources = [
			{
				path: "src/m/a.ts",
				text: "// crap-ignore -- pointer drag\n\nexport function drag() {}\n",
			},
		];
		const problems = checkCrap([entry("drag", "m.a", 2)], sources, THRESHOLD);
		expect(problems[0]).toContain("stale");
	});
});

describe("checkDry", () => {
	const pair = {
		left: { file: "a.ts", startLine: 2 },
		right: { file: "b.ts", startLine: 1 },
	};

	test("fails on a pair with no comment", () => {
		const sources = [
			{ path: "a.ts", text: "\nfunction a() {}\n" },
			{ path: "b.ts", text: "function b() {}\n" },
		];
		const problems = checkDry([pair], sources);
		expect(problems[0]).toContain("a.ts:2");
		expect(problems[0]).toContain("b.ts:1");
	});

	test("dry-ignore on either side exempts the pair", () => {
		const sources = [
			{ path: "a.ts", text: "// dry-ignore -- different tables\nfunction a() {}\n" },
			{ path: "b.ts", text: "function b() {}\n" },
		];
		expect(checkDry([pair], sources)).toEqual([]);
	});

	test("dry-ignore with no reason or no pair is a problem", () => {
		const unreasoned = [
			{ path: "a.ts", text: "// dry-ignore\nfunction a() {}\n" },
			{ path: "b.ts", text: "function b() {}\n" },
		];
		expect(checkDry([pair], unreasoned).some((problem) => problem.includes("reason"))).toBe(true);
		const stale = [{ path: "a.ts", text: "// dry-ignore -- old\nfunction a() {}\n" }];
		expect(checkDry([], stale)[0]).toContain("stale");
	});

	test("reports a pair whose file it cannot find", () => {
		expect(checkDry([pair], [])[0]).toContain("cannot resolve");
	});
});

describe("isDryFile", () => {
	test("keeps .ts source and drops tests, generated code, declarations and .tsx", () => {
		expect(isDryFile("apps/web/convex/door.ts")).toBe(true);
		expect(isDryFile("apps/web/src/lib/time.ts")).toBe(true);
		expect(isDryFile("packages/design-system/src/utils/swipe.ts")).toBe(true);
		expect(isDryFile("apps/web/convex/door.test.ts")).toBe(false);
		expect(isDryFile("apps/web/convex/emails/generated/a.ts")).toBe(false);
		expect(isDryFile("apps/web/convex/_generated/api.ts")).toBe(false);
		expect(isDryFile("apps/web/src/types.d.ts")).toBe(false);
		expect(isDryFile("apps/web/src/view.tsx")).toBe(false);
		expect(isDryFile("scripts/leaks.ts")).toBe(false);
		expect(isDryFile("apps/landing-page/src/lib/format.ts")).toBe(true);
		expect(isDryFile("scripts/quality/gate.ts")).toBe(false);
	});
});
