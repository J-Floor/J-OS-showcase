import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { withAuthComponents } from "../test-stubs/authComponents.ts";
import { installFakeEmailProvider } from "../test-stubs/fakeEmailProvider.ts";

import { components } from "./_generated/api";
import { setEmailProviderForTests } from "./lib/emailProvider.ts";
import schema from "./schema.ts";

// `auth.ts` reads these at module load, so they are set before any import.
const { SITE } = vi.hoisted(() => {
	const SITE = "https://app.example.com";
	process.env.SITE_URL = SITE;
	process.env.CONVEX_SITE_URL = "https://backend.example.com";
	process.env.BETTER_AUTH_SECRET = "test-secret-at-least-32-characters-long";
	return { SITE };
});

const modules = import.meta.glob("./**/*.*s");

function setup() {
	return withAuthComponents(convexTest(schema, modules));
}

afterEach(() => {
	setEmailProviderForTests(undefined);
});

describe("magic-link sign-in through the auth component", () => {
	it("signs a known person in after two link requests", async () => {
		const backend = setup();
		const provider = installFakeEmailProvider();
		await backend.run((context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Person",
				tier: "member",
				stage: "active",
				stageSince: 1,
			})
		);

		// Two requests, so verify deletes the older verification row.
		// better-auth 1.7.25 does that with `ne` on `_id`, which adapter
		// 0.13.0 rejected.
		for (let attempt = 0; attempt < 2; attempt++) {
			const sent = await backend.fetch("/api/auth/sign-in/magic-link", {
				method: "POST",
				headers: { "content-type": "application/json", origin: SITE },
				body: JSON.stringify({
					email: "ada@example.com",
					callbackURL: SITE,
				}),
			});
			expect(sent.status).toBe(200);
		}
		const lastEmail = provider.sent.at(-1);
		expect(lastEmail?.subject).toBe("Your J floor sign-in link");
		const link = /https?:\/\/\S+verify\?token=[^\s"<]+/.exec(
			lastEmail?.text ?? ""
		)?.[0];
		expect(link).toBeDefined();
		const linkUrl = new URL(link ?? "");

		const verified = await backend.fetch(
			linkUrl.pathname + linkUrl.search,
			{
				headers: { origin: SITE },
				redirect: "manual",
			}
		);
		expect(verified.status).toBeLessThan(400);
		// better-auth redirects to `callbackURL?error=...` on a token failure.
		expect(verified.headers.get("location") ?? "").not.toContain("error=");

		const sessions = (await backend.query(
			components.betterAuth.adapter.findMany,
			{
				model: "session",
				paginationOpts: { cursor: null, numItems: 10 },
			}
		)) as { page: unknown[] };
		expect(sessions.page).toHaveLength(1);
	});
});
