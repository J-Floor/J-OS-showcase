// apps/web/convex/emails/generated.escape.test.ts
import { describe, expect, it } from "vitest";

import { TEMPLATES } from "../../emails/registry.ts";

const HOSTILE = `<script>alert(1)</script>"'&`;
const ESCAPED = "&lt;script&gt;alert(1)&lt;/script&gt;&quot;&#39;&amp;";

type Template = (props: Record<string, unknown>) => {
	html: string;
	text: string;
};

const modules = import.meta.glob<Record<string, unknown>>("./generated/*.ts", {
	eager: true,
});

/** Each template's `listFields` in the emails/registry.ts registry: they
 *  take records, not a string. A name is a list in one template only. */
const LIST_FIELDS = new Map(
	TEMPLATES.map((entry) => [
		entry.name,
		new Set<string | symbol>(Object.keys(entry.listFields ?? {})),
	])
);

function listFieldsOf(name: string): ReadonlySet<string | symbol> {
	const fields = LIST_FIELDS.get(name);
	if (!fields) throw new Error(`${name} has no entry in emails/registry.ts`);
	return fields;
}

/** Hostile props for one template: two hostile records for each of its list
 *  fields, a hostile string for anything else. */
function hostileProps(
	listFields: ReadonlySet<string | symbol>
): Record<string, unknown> {
	const item = new Proxy({}, { get: () => HOSTILE });
	return new Proxy(
		{},
		{ get: (_, key) => (listFields.has(key) ? [item, item] : HOSTILE) }
	);
}

describe("every generated email template escapes hostile values", () => {
	const templates = Object.entries(modules).map(([path, module_]) => {
		const name = path.replace(/^.*\//, "").replace(/\.ts$/, "");
		return [name, module_[name] as Template] as const;
	});

	it("finds the templates", () => {
		expect(templates.length).toBeGreaterThan(15);
	});

	it("feeds each template the list fields its own entry declares", () => {
		// `note` is perkRequested's list field: another template's `note`
		// would be a plain string, and is fed one.
		expect(hostileProps(listFieldsOf("perkRequested")).note).toHaveLength(
			2
		);
		expect(hostileProps(listFieldsOf("notice")).note).toBe(HOSTILE);
		expect(hostileProps(listFieldsOf("boardLifecycleAlert")).note).toBe(
			HOSTILE
		);
	});

	it.each(templates)("%s", (name, template) => {
		const { html, text } = template(hostileProps(listFieldsOf(name)));
		expect(html).not.toContain("<script>");
		expect(html).not.toContain(`"'&`);
		expect(html).toContain(ESCAPED);
		const tags = html.match(/<[a-zA-Z][^>]*>/g) ?? [];
		for (const tag of tags) {
			expect(tag.split('"').length % 2).toBe(1);
		}
		expect(text).not.toContain("&lt;");
	});
});
