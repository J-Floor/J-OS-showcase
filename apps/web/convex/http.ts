import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth.ts";
import { PRESENCE_PATH, presenceHttpResponse } from "./lib/doorPresence.ts";
import {
	HTTP_OK,
	OCCUPANCY_WEBHOOK_PATH,
	readWebhook,
} from "./lib/occupancy/webhook.ts";
import { occupancyProvider } from "./lib/occupancyProviderEnv.ts";

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
	handler: httpAction((_context, request) =>
		presenceHttpResponse(
			request,
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

/**
 * Counter webhook. Unauthenticated as a user on purpose: the counter is not a
 * person. It must carry the shared secret (`lib/occupancy/webhook.ts`); with
 * no push-capable counter installed it answers 404.
 */
http.route({
	path: OCCUPANCY_WEBHOOK_PATH,
	method: "POST",
	handler: httpAction(async (context, request) => {
		const outcome = await readWebhook(request, {
			provider: occupancyProvider(),
			secret: process.env.OCCUPANCY_WEBHOOK_SECRET,
		});
		if (outcome.status === HTTP_OK)
			await context.runMutation(internal.occupancy.applyUpdates, {
				updates: outcome.updates,
				at: Date.now(),
			});
		return new Response(null, { status: outcome.status });
	}),
});

export default http;
