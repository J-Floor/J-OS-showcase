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

describe("website CSP", () => {
	it("allows the inline hydration script the prerender injects", () => {
		const scriptSource = /script-src ([^;]*)/.exec(HEADERS)?.[1] ?? "";
		expect(scriptSource).toContain(`'sha256-${hydrationScriptHash()}'`);
	});

	it("lets the Cloudflare Web Analytics beacon load and report", () => {
		const scriptSource = /script-src ([^;]*)/.exec(HEADERS)?.[1] ?? "";
		const connectSource = /connect-src ([^;]*)/.exec(HEADERS)?.[1] ?? "";
		expect(scriptSource).toContain("https://static.cloudflareinsights.com");
		expect(connectSource).toContain("https://cloudflareinsights.com");
	});
});
