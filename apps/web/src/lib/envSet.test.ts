import { describe, expect, it } from "vitest";

import { convexArgs, parseArgs, setEverywhere, type Runner } from "./envSet.ts";

describe("parseArgs", () => {
	it("defaults to every target in order", () => {
		expect(parseArgs(["FOO_BAR"])).toEqual({
			name: "FOO_BAR",
			targets: ["dev", "prod", "staging"],
		});
	});

	it("narrows with --only, keeping the canonical order", () => {
		expect(parseArgs(["FOO", "--only", "staging,dev"])).toEqual({
			name: "FOO",
			targets: ["dev", "staging"],
		});
		expect(parseArgs(["--only=prod", "FOO"])).toEqual({
			name: "FOO",
			targets: ["prod"],
		});
	});

	it("rejects bad names, unknown targets and a value argument", () => {
		expect(parseArgs([])).toHaveProperty("error");
		expect(parseArgs(["foo"])).toHaveProperty("error");
		expect(parseArgs(["1FOO"])).toHaveProperty("error");
		expect(parseArgs(["FOO-BAR"])).toHaveProperty("error");
		expect(parseArgs(["FOO", "--only", "qa"])).toHaveProperty("error");
		expect(parseArgs(["FOO", "--only"])).toHaveProperty("error");
		expect(parseArgs(["FOO", "s3cret"])).toHaveProperty("error");
		expect(parseArgs(["FOO", "--bar"])).toHaveProperty("error");
	});
});

describe("convexArgs", () => {
	it("maps each target to its convex flags and never includes a value", () => {
		expect(convexArgs("FOO", "dev")).toEqual([
			"convex",
			"env",
			"set",
			"FOO",
		]);
		expect(convexArgs("FOO", "prod")).toEqual([
			"convex",
			"env",
			"set",
			"FOO",
			"--prod",
		]);
		expect(convexArgs("FOO", "staging")).toEqual([
			"convex",
			"env",
			"set",
			"FOO",
			"--deployment",
			"j-os-staging:prod",
		]);
	});
});

describe("setEverywhere", () => {
	it("pipes the value via the runner, reports per target and flags failures", () => {
		const calls: { args: string[]; value: string }[] = [];
		function run(...[args, value]: Parameters<Runner>): ReturnType<Runner> {
			calls.push({ args, value });
			return args.includes("--prod")
				? { ok: false, message: "boom" }
				: { ok: true };
		}
		const result = setEverywhere(
			{ name: "FOO", targets: ["dev", "prod", "staging"] },
			"s3cret",
			run
		);
		expect(result).toEqual({
			lines: ["dev: ok", "prod: boom", "staging: ok"],
			hasFailed: true,
		});
		expect(calls.map((call) => call.value)).toEqual([
			"s3cret",
			"s3cret",
			"s3cret",
		]);
		expect(calls.flatMap((call) => call.args)).not.toContain("s3cret");
	});
});
