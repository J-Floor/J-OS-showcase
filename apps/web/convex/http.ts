import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth.ts";
import { PRESENCE_PATH, presenceHttpResponse } from "./lib/doorPresence.ts";
import {
	HTTP_OK,
	OCCUPANCY_WEBHOOK_PATH,
	readWebhook,
} from "./lib/occupancy/webhook.ts";
import { occupancyProvider } from "./lib/occupancyProviderEnv.ts";
import { rateLimiter } from "./lib/rateLimit.ts";
import { TV_PATHS } from "./lib/tv/constants.ts";
import {
	type DeviceDeps,
	manifestResponse,
	packResponse,
	type PairDeps,
	pollPairingResponse,
	preflightResponse,
	slideResponse,
	startPairingResponse,
} from "./lib/tv/http.ts";

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

type HttpContext = Parameters<Parameters<typeof httpAction>[0]>[0];

/** The TV rate limiters, bound to one request's Convex context. */
function limiter(context: HttpContext) {
	return (
		name: "tvPairStart" | "tvPairPoll" | "tvDevice",
		key: string
	): Promise<boolean> =>
		rateLimiter.limit(context, name, { key }).then(({ ok }) => ok);
}

/** The pairing handlers' dependencies, bound to one request's Convex context. */
function pairDeps(context: HttpContext): PairDeps {
	return {
		limit: limiter(context),
		start: (hashes, now) =>
			context.runMutation(internal.tvInternal.startPairing, {
				...hashes,
				now,
			}),
		claim: (args, now) =>
			context.runMutation(internal.tvInternal.claimPairing, {
				...args,
				now,
			}),
		now: Date.now,
	};
}

/**
 * TV pairing. Unauthenticated on purpose: a TV has no identity yet. Start
 * returns two random secrets (IP rate-limited, live rows capped) and grants
 * nothing until a signed-in board member approves; poll is authorised by the
 * 256-bit poll secret and hands the device token over once.
 */
http.route({
	path: TV_PATHS.pairStart,
	method: "POST",
	handler: httpAction((context, request) =>
		startPairingResponse(request, pairDeps(context))
	),
});
http.route({
	path: TV_PATHS.pairStart,
	method: "OPTIONS",
	handler: httpAction(() => Promise.resolve(preflightResponse())),
});
http.route({
	path: TV_PATHS.pairPoll,
	method: "POST",
	handler: httpAction((context, request) =>
		pollPairingResponse(request, pairDeps(context))
	),
});
http.route({
	path: TV_PATHS.pairPoll,
	method: "OPTIONS",
	handler: httpAction(() => Promise.resolve(preflightResponse())),
});

/** The device handlers' dependencies, bound to one request's Convex context. */
function deviceDeps(context: HttpContext): DeviceDeps {
	return {
		authenticate: (tokenHash) =>
			context.runMutation(internal.tvInternal.authenticateDevice, {
				tokenHash,
				now: Date.now(),
			}),
		limit: limiter(context),
		manifest: () => context.runQuery(internal.tvInternal.manifest, {}),
		pack: () => context.runQuery(internal.tvInternal.packFile, {}),
		content: (id) =>
			context.runQuery(internal.tvInternal.slideContent, { id }),
		getBlob: (fileId) => context.storage.get(fileId as Id<"_storage">),
	};
}

/**
 * TV playback. Authorised by the hashed device token (an unknown, revoked or
 * missing token gets one identical 401); read-only. CORS is open because auth
 * is a header and no cookie is read.
 */
http.route({
	path: TV_PATHS.manifest,
	method: "GET",
	handler: httpAction((context, request) =>
		manifestResponse(request, deviceDeps(context))
	),
});
http.route({
	path: TV_PATHS.manifest,
	method: "OPTIONS",
	handler: httpAction(() => Promise.resolve(preflightResponse())),
});
http.route({
	path: TV_PATHS.slide,
	method: "GET",
	handler: httpAction((context, request) =>
		slideResponse(request, deviceDeps(context))
	),
});
http.route({
	path: TV_PATHS.slide,
	method: "OPTIONS",
	handler: httpAction(() => Promise.resolve(preflightResponse())),
});
http.route({
	path: TV_PATHS.pack,
	method: "GET",
	handler: httpAction((context, request) =>
		packResponse(request, deviceDeps(context))
	),
});
http.route({
	path: TV_PATHS.pack,
	method: "OPTIONS",
	handler: httpAction(() => Promise.resolve(preflightResponse())),
});

export default http;
