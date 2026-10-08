import {
	convexClient,
	crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/solid";

export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_CONVEX_SITE_URL as string,
	plugins: [convexClient(), crossDomainClient(), magicLinkClient()],
});
