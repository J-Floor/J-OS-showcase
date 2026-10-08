// apps/web/convex/emails/generated.escape.test.ts
import { describe, expect, it } from "vitest";

const HOSTILE = `<script>alert(1)</script>"'&`;
const ESCAPED = "&lt;script&gt;alert(1)&lt;/script&gt;&quot;&#39;&amp;";

type Template = (props: Record<string, unknown>) => {
	html: string;
	text: string;
};

const modules = import.meta.glob<Record<string, unknown>>("./generated/*.ts", {
	eager: true,
});

function hostileProps(): Record<string, unknown> {
	const item = new Proxy({}, { get: () => HOSTILE });
	return new Proxy(
		{},
		{ get: (_, key) => (key === "rows" ? [item, item] : HOSTILE) }
	);
}

describe("every generated email template escapes hostile values", () => {
	const templates = Object.entries(modules).map(([path, mod]) => {
		const name = path.replace(/^.*\//, "").replace(/\.ts$/, "");
		return [name, mod[name] as Template] as const;
	});

	it("finds the templates", () => {
		expect(templates.length).toBeGreaterThan(15);
	});

	it.each(templates)("%s", (_name, template) => {
		const { html, text } = template(hostileProps());
		expect(html).not.toContain("<script>");
		expect(html).not.toContain(`"'&`);
		expect(html).toContain(ESCAPED);
		for (const tag of html.match(/<[a-zA-Z][^>]*>/g) ?? []) {
			expect(tag.split('"').length % 2).toBe(1);
		}
		expect(text).not.toContain("&lt;");
	});
});
