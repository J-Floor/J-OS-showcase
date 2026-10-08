import { httpRouter } from "convex/server";

import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth.ts";
import { PRESENCE_PATH, presenceHttpResponse } from "./lib/doorPresence.ts";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });

/**
 * App-unlock presence oracle. Unauthenticated on purpose: it proves WHERE the
 * request comes from, not WHO sent it (`doorActions.unlockDoor` checks who).
 *
 * A thin wrapper over `presenceHttpResponse` (see `lib/doorPresence.ts`),
 * which is exercised directly in tests — this route just supplies the real
 * request and env.
 */
http.route({
	path: PRESENCE_PATH,
	method: "GET",
	handler: httpAction((_ctx, req) =>
		presenceHttpResponse(
			req,
			{
				buildingIp: process.env.DOOR_BUILDING_IP,
				secret: process.env.DOOR_PRESENCE_SECRET,
				siteUrl: process.env.SITE_URL,
				ipCheck: process.env.DOOR_PRESENCE_IP_CHECK,
			},
			Date.now()
		)
	),
});

export default http;
