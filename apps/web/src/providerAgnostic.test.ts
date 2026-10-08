import { expect, it } from "vitest";

/**
 * Only the lock vendor's adapter files may name it.
 * Everything else under src/ and convex/ talks about "the lock", "the door
 * provider" or "the occupancy provider".
 *
 * Read through Vite (`?raw`), not `fs`, so it runs in any test environment.
 * `convex/_generated/` is skipped: it is codegen output that lists every
 * module by path, the adapters included.
 */
const files = import.meta.glob<string>(
	["./**/*.{ts,tsx}", "../convex/**/*.ts", "!../convex/_generated/**"],
	{ query: "?raw", import: "default", eager: true }
);

/** Whole files that may name the vendor: its door and occupancy adapters,
 *  their tests, and the security invariants that inspect the door adapter.
 *  (This file is never in the glob: Vite leaves the importing module out.) */
const VENDOR_FILES = new Set([
	"../convex/lib/nukiClient.ts",
	"../convex/lib/nukiClient.test.ts",
	"../convex/security.invariants.test.ts",
	"../convex/lib/occupancy/providers/nukiDoorOpens.ts",
	"../convex/lib/occupancy/providers/nukiDoorOpens.test.ts",
]);

/** Per file: the exact vendor text it may still contain, stripped before the
 *  check. Keep every entry as narrow as the text it exists for. */
const ALLOWED: Partial<Record<string, RegExp[]>> = {
	// The one module that picks the door adapter.
	"../convex/lib/doorProviderEnv.ts": [
		/^import \{[\w,\s]+\} from "\.\/nukiClient\.ts";$/gm,
	],
};

const VENDOR = /nuki/i;

it("names no lock vendor outside the provider adapters", () => {
	const offenders: string[] = [];
	for (const [path, source] of Object.entries(files)) {
		if (VENDOR_FILES.has(path)) continue;
		const stripped = (ALLOWED[path] ?? []).reduce(
			(s, re) => s.replace(re, ""),
			source
		);
		stripped.split("\n").forEach((line, i) => {
			if (VENDOR.test(line))
				offenders.push(`${path}:${String(i + 1)}: ${line.trim()}`);
		});
	}
	expect(
		offenders,
		"Name the lock vendor only in its adapter files; say 'the lock' / 'the door provider' elsewhere"
	).toEqual([]);
});

it("scans the backend as well as the frontend", () => {
	// A glob that silently matched nothing would make the check above vacuous.
	expect(files["../convex/doorActions.ts"]).toBeDefined();
	expect(files["./modules/space/UnlockCard.tsx"]).toBeDefined();
	expect(files["../convex/_generated/api.d.ts"]).toBeUndefined();
});

it("keeps every allowlist entry pointing at a real file", () => {
	for (const path of [...VENDOR_FILES, ...Object.keys(ALLOWED)])
		expect(files[path], path).toBeDefined();
});
