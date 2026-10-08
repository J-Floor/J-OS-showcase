// apps/web/convex/emails/escape.test.ts
import { describe, expect, it } from "vitest";

import { escapeHtml } from "./escape.ts";

describe("escapeHtml", () => {
	it("encodes all five sensitive characters", () => {
		expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
			"&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;"
		);
	});

	it("encodes ampersand first so entities aren't double-encoded wrong", () => {
		expect(escapeHtml("Tom & Jerry < 5")).toBe("Tom &amp; Jerry &lt; 5");
	});

	it("neutralises a script injection", () => {
		expect(escapeHtml("<script>alert(1)</script>")).toBe(
			"&lt;script&gt;alert(1)&lt;/script&gt;"
		);
	});

	it("leaves plain text untouched", () => {
		expect(escapeHtml("Ada Lovelace")).toBe("Ada Lovelace");
	});
});
