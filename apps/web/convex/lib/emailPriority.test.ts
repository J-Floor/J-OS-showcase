// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/** Each sender's calls in source order, as [devLog tag, priority class]. The
 *  provider never sees the class, so this pins it on every call itself.
 *  "dynamic" is a call whose devLog is a variable. */
const EXPECTED: Record<string, [string, string][]> = {
	"notifications.ts": [
		["rejection", "critical"],
		["approval-guest", "critical"],
		["approval-guest", "critical"],
		["approval-member", "critical"],
		["member-upgrade", "critical"],
		["application-received", "critical"],
	],
	"agreements.ts": [["signed-agreement", "critical"]],
	"people.ts": [
		["email-change", "critical"],
		["email-changed", "critical"],
	],
	"auth.ts": [
		["no-account", "anonymous"],
		["magic-link", "critical"],
	],
	"applications.ts": [
		["dynamic", "anonymous"],
		["verify-application", "anonymous"],
	],
	"notify/digest.ts": [["digest", "digest"]],
	"visitors.ts": [
		["verify-visitor", "anonymous"],
		["event-invite", "anonymous"],
	],
};

const CALL = /\bsendEmail(?:Limited)?\(context, \{/g;
const CLASSED_CALL =
	/\bsendEmail(?:Limited)?\(context, \{[\s\S]*?priority: "(\w+)",\s*devLog(?:: `\[([\w-]+)\]|,)/g;

describe("email priority per sender", () => {
	it.each(Object.entries(EXPECTED))("%s", (file, expected) => {
		const source = readFileSync(
			new URL(`../${file}`, import.meta.url),
			"utf8"
		);
		const calls = source.match(CALL) ?? [];
		const found = [...source.matchAll(CLASSED_CALL)].map((match) => [
			match.at(2) ?? "dynamic",
			match[1],
		]);
		expect(calls).toHaveLength(expected.length);
		expect(found).toEqual(expected);
	});
});
