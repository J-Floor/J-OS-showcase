import { describe, expect, it } from "vitest";

import { createAuth } from "./auth.ts";

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

describe("sendMagicLink", () => {
	it("refuses to send without an action context, so the caps cannot be skipped", async () => {
		const auth = createAuth({} as never);
		const plugin = (
			auth.options.plugins as unknown as MagicLinkPlugin[]
		).find((p) => p.id === "magic-link")!;
		await expect(
			plugin.options.sendMagicLink({
				email: "a@example.com",
				url: "https://app.example.com/x",
				token: "t",
			})
		).rejects.toThrow("sendMagicLink needs an action context");
	});
});
