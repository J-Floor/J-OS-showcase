// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { generateHydrationScript } from "solid-js/web/dist/server.js";
import { describe, expect, it } from "vitest";

const HEADERS = readFileSync(
	new URL("../public/_headers", import.meta.url),
	"utf8"
);

function hydrationScriptHash(): string {
	const body = /<script>([\s\S]*)<\/script>/.exec(
		generateHydrationScript()
	)?.[1];
	if (body === undefined) throw new Error("hydration script has no body");
	return createHash("sha256").update(body).digest("base64");
}

describe("landing page CSP", () => {
	it("allows the inline hydration script the prerender injects", () => {
		const scriptSrc = /script-src ([^;]*)/.exec(HEADERS)?.[1] ?? "";
		expect(scriptSrc).toContain(`'sha256-${hydrationScriptHash()}'`);
	});
});
