import {
	setEmailProviderForTests,
	type EmailProvider,
	type OutgoingEmail,
	type ProviderLimits,
} from "../convex/lib/emailProvider.ts";

/** A recording email provider. Set `limits` to change the quota between
 *  sends; `failFor` makes the send to that address reject. */
export type FakeEmailProvider = EmailProvider & {
	sent: OutgoingEmail[];
	failFor: string | undefined;
};

/** Install a fake provider for this test; reset it with
 *  `setEmailProviderForTests(undefined)` in `afterEach`. */
export function installFakeEmailProvider(
	limits: ProviderLimits = { daily: null, monthly: null }
): FakeEmailProvider {
	const provider: FakeEmailProvider = {
		limits,
		billing: "perRecipient",
		sent: [],
		failFor: undefined,
		send: (message) => {
			if (message.to === provider.failFor) {
				return Promise.reject(new Error("provider down"));
			}
			provider.sent.push(message);
			return Promise.resolve({ kind: "sent" });
		},
	};
	setEmailProviderForTests(provider);
	return provider;
}
