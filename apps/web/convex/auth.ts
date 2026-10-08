import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";

import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config.ts";
import { magicLink as magicLinkEmail } from "./emails/generated/magicLink.ts";
import { emailUrls } from "./emails/urls.ts";
import { sendEmail } from "./lib/email.ts";
import { mayMagicLink } from "./lib/rateLimit.ts";

const siteUrl = process.env.SITE_URL!;

const THIRTY_DAYS = 60 * 60 * 24 * 30;

export const authComponent = createClient<DataModel>(components.betterAuth);

export function createAuth(ctx: GenericCtx<DataModel>) {
	return betterAuth({
		baseURL: process.env.CONVEX_SITE_URL,
		trustedOrigins: [siteUrl],
		database: authComponent.adapter(ctx),
		session: { expiresIn: THIRTY_DAYS },
		plugins: [
			crossDomain({ siteUrl }),
			convex({ authConfig }),
			magicLink({
				storeToken: "hashed",
				sendMagicLink: async ({ email, url }) => {
					if (!("runMutation" in ctx)) {
						throw new Error(
							"sendMagicLink needs an action context"
						);
					}
					// Exhausted → send nothing; Better Auth still answers
					// success, so the endpoint stays non-enumerable.
					if (!(await mayMagicLink(ctx, email))) return;
					const { logoUrl } = emailUrls();
					const { html, text } = magicLinkEmail({ url, logoUrl });
					await sendEmail({
						to: email,
						subject: "Your J floor sign-in link",
						html,
						text,
						devLog: `[magic-link] ${email}: ${url}`,
					});
				},
			}),
		],
	});
}

export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => authComponent.getAuthUser(ctx),
});
