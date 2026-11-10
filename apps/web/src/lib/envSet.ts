// Pure parts of `bun run env:set` (apps/web/scripts/env-set.ts): argument
// parsing, target selection and NAME validation. Process spawning lives in
// the script; it is injected here as a `Runner`.

const TARGETS = {
	dev: [],
	prod: ["--prod"],
	staging: ["--deployment", "j-os-staging:prod"],
} as const;

export type TargetName = keyof typeof TARGETS;

const TARGET_ORDER: readonly TargetName[] = ["dev", "prod", "staging"];

const NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export const USAGE = "usage: bun run env:set <NAME> [--only dev,prod,staging]";

export type ParsedArgs = { name: string; targets: TargetName[] };

function isTargetName(value: string): value is TargetName {
	return TARGET_ORDER.some((target) => target === value);
}

type Scanned = { names: string[]; only: string | undefined; error?: string };

function scan(argv: readonly string[]): Scanned {
	const names: string[] = [];
	let only: string | undefined;
	let isAwaitingOnly = false;
	for (const argument of argv) {
		if (isAwaitingOnly) {
			only = argument;
			isAwaitingOnly = false;
		} else if (argument === "--only") {
			isAwaitingOnly = true;
		} else if (argument.startsWith("--only=")) {
			only = argument.slice("--only=".length);
		} else if (argument.startsWith("-")) {
			return { names, only, error: `unknown option ${argument}` };
		} else {
			names.push(argument);
		}
	}
	return isAwaitingOnly
		? { names, only, error: "--only needs a value" }
		: { names, only };
}

function selectTargets(
	only: string
): { targets: TargetName[] } | { error: string } {
	const wanted = only.split(",").map((part) => part.trim());
	const unknown = wanted.find((part) => !isTargetName(part));
	if (unknown !== undefined) {
		return {
			error: `unknown target "${unknown}" (use dev, prod, staging)`,
		};
	}
	return {
		targets: TARGET_ORDER.filter((target) => wanted.includes(target)),
	};
}

export function parseArgs(
	argv: readonly string[]
): ParsedArgs | { error: string } {
	const { names, only, error } = scan(argv);
	if (error !== undefined) return { error };
	const [name = ""] = names;
	if (names.length === 0) return { error: "missing NAME" };
	if (names.length > 1) {
		return {
			error: "the value is never taken as an argument; it is asked for",
		};
	}
	if (!NAME_PATTERN.test(name)) {
		return { error: `NAME must match ${NAME_PATTERN.source}` };
	}
	if (only === undefined) return { name, targets: [...TARGET_ORDER] };
	const selected = selectTargets(only);
	return "error" in selected ? selected : { name, targets: selected.targets };
}

/** Arguments after `bunx` for one target. The value is never among them. */
export function convexArgs(name: string, target: TargetName): string[] {
	return ["convex", "env", "set", name, ...TARGETS[target]];
}

type RunResult = { ok: true } | { ok: false; message: string };
/** Runs `bunx <args>` with `value` on stdin. */
export type Runner = (args: string[], value: string) => RunResult;

/** Sets the value on each target and returns one output line per target. */
export function setEverywhere(
	{ name, targets }: ParsedArgs,
	value: string,
	run: Runner
): { lines: string[]; hasFailed: boolean } {
	let hasFailed = false;
	const lines = targets.map((target) => {
		const result = run(convexArgs(name, target), value);
		if (result.ok) return `${target}: ok`;
		hasFailed = true;
		return `${target}: ${result.message}`;
	});
	return { lines, hasFailed };
}
