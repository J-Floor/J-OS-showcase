import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAuth, trustedSiteOrigins } from "./auth.ts";
import { sendEmail } from "./lib/email.ts";
import { magicLinkDecision } from "./lib/rateLimit.ts";

vi.mock("./lib/email.ts", () => ({ sendEmail: vi.fn() }));
vi.mock("./lib/rateLimit.ts", () => ({ magicLinkDecision: vi.fn() }));

type MagicLinkPlugin = {
	id: string;
	options: {
		sendMagicLink: (data: {
			email: string;
			url: string;
			token: string;
		}) => Promise<void>;
	};
};

function magicLinkPlugin(context: unknown) {
	const auth = createAuth(context as never);
	return (auth.options.plugins as unknown as MagicLinkPlugin[]).find(
		(provider) => provider.id === "magic-link"
	)!;
}

const LINK = "https://app.example.com/verify?token=secret-token";

async function send(decision: Awaited<ReturnType<typeof magicLinkDecision>>) {
	vi.mocked(magicLinkDecision).mockResolvedValue(decision);
	const plugin = magicLinkPlugin({ runMutation: vi.fn(), runQuery: vi.fn() });
	// Better Auth answers the request the same whenever this resolves, so no
	// branch may throw: that would make the endpoint an email oracle.
	await expect(
		plugin.options.sendMagicLink({
			email: "a@example.com",
			url: LINK,
			token: "t",
		})
	).resolves.toBeUndefined();
}

describe("sendMagicLink", () => {
	beforeEach(() => {
		vi.mocked(sendEmail).mockReset();
	});

	it("refuses to send without an action context, so the caps cannot be skipped", async () => {
		const plugin = magicLinkPlugin({});
		await expect(
			plugin.options.sendMagicLink({
				email: "a@example.com",
				url: "https://app.example.com/x",
				token: "t",
			})
		).rejects.toThrow("sendMagicLink needs an action context");
	});

	it("sends a known person the sign-in link", async () => {
		await send("link");
		expect(sendEmail).toHaveBeenCalledTimes(1);
		const sent = vi.mocked(sendEmail).mock.calls[0][0];
		expect(sent.to).toBe("a@example.com");
		expect(sent.subject).toBe("Your J floor sign-in link");
		expect(sent.html).toContain("secret-token");
	});

	it("sends an unknown address the no-account email, without the link", async () => {
		await send("noAccount");
		expect(sendEmail).toHaveBeenCalledTimes(1);
		const sent = vi.mocked(sendEmail).mock.calls[0][0];
		expect(sent.subject).toBe("No J floor account for this email");
		expect(sent.html).not.toContain("secret-token");
		expect(sent.text).not.toContain("secret-token");
		expect(sent.devLog).toBe("[no-account] a@example.com");
	});

	it("sends nothing to a limited address", async () => {
		await send("limited");
		expect(sendEmail).not.toHaveBeenCalled();
	});
});

describe("trusted origins", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("trusts only SITE_URL when no staging site is set", () => {
		vi.stubEnv("SITE_URL", "https://app.example.com");
		vi.stubEnv("STAGING_SITE_URL", "");
		expect(trustedSiteOrigins()).toEqual(["https://app.example.com"]);
		expect(createAuth({} as never).options.trustedOrigins).toEqual([
			"https://app.example.com",
		]);
	});

	it("trusts the bare origin when SITE_URL carries a trailing slash", () => {
		vi.stubEnv("SITE_URL", "https://app.example.com/");
		vi.stubEnv("STAGING_SITE_URL", "");
		expect(trustedSiteOrigins()).toEqual(["https://app.example.com"]);
	});

	it("also trusts the staging site on a deployment that serves one", () => {
		vi.stubEnv("SITE_URL", "http://localhost:5173");
		vi.stubEnv("STAGING_SITE_URL", "https://staging.example.com");
		expect(createAuth({} as never).options.trustedOrigins).toEqual([
			"http://localhost:5173",
			"https://staging.example.com",
		]);
	});
});
