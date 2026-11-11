import {
	type AuthFunctions,
	createClient,
	type GenericCtx,
} from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";

import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config.ts";
import { magicLink as magicLinkEmail } from "./emails/generated/magicLink.ts";
import { noAccount } from "./emails/generated/noAccount.ts";
import { emailUrls } from "./emails/urls.ts";
import { authUserById, linkLogin } from "./lib/authRecords.ts";
import { sendEmail } from "./lib/email.ts";
import { magicLinkDecision } from "./lib/rateLimit.ts";
import { invariant } from "./lib/result.ts";

const siteUrl = process.env.SITE_URL!;

const THIRTY_DAYS = 2_592_000;

const authFunctions: AuthFunctions = internal.auth;

/**
 * Each new session links its user to their person (`linkLogin`), so a person
 * is found by the login they signed in with.
 */
export const authComponent = createClient<DataModel>(components.betterAuth, {
	authFunctions,
	triggers: {
		session: {
			onCreate: async (context, session) => {
				const user = await authUserById(context, session.userId);
				if (user) await linkLogin(context, user);
			},
		},
	},
});

export const { onCreate } = authComponent.triggersApi();

/**
 * Origins the auth routes accept, for CORS and for callback URLs: the
 * deployment's own site. A bare origin, because Better Auth compares a
 * callback URL's origin to each entry as a string.
 */
export function trustedSiteOrigins(): string[] {
	const site = process.env.SITE_URL;
	return site ? [new URL(site).origin] : [];
}

export function createAuth(context: GenericCtx<DataModel>) {
	return betterAuth({
		baseURL: process.env.CONVEX_SITE_URL,
		trustedOrigins: trustedSiteOrigins(),
		database: authComponent.adapter(context),
		session: { expiresIn: THIRTY_DAYS },
		plugins: [
			crossDomain({ siteUrl }),
			convex({ authConfig }),
			magicLink({
				storeToken: "hashed",
				sendMagicLink: async ({ email, url }) => {
					invariant(
						"runMutation" in context,
						"sendMagicLink needs an action context"
					);
					// Every branch answers the same (Better Auth reports success),
					// so the endpoint stays non-enumerable: only the mailbox
					// owner can tell a link from "no account".
					const decision = await magicLinkDecision(context, email);
					if (decision === "limited") return;
					const { logoUrl, signinUrl, signUpUrl, privacyUrl } =
						emailUrls();
					if (decision === "noAccount") {
						const { html, text } = noAccount({
							signinUrl,
							signUpUrl,
							logoUrl,
							privacyUrl,
						});
						await sendEmail(context, {
							to: email,
							subject: "No J floor account for this email",
							html,
							text,
							priority: "anonymous",
							devLog: `[no-account] ${email}`,
						});
						return;
					}
					const { html, text } = magicLinkEmail({ url, logoUrl });
					await sendEmail(context, {
						to: email,
						subject: "Your J floor sign-in link",
						html,
						text,
						priority: "critical",
						devLog: `[magic-link] ${email}: ${url}`,
					});
				},
			}),
		],
	});
}

export const getCurrentUser = query({
	args: {},
	handler: async (context) => authComponent.getAuthUser(context),
});
