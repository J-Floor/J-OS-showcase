import { v } from "convex/values";

import { insightsUrl } from "../../emails/urls.ts";
import { boardIds } from "../audience.ts";
import { defineKind } from "../types.ts";

/**
 * The occupancy counter went quiet past its normal reporting gap, or came
 * back. Whether to send is decided by `opsAlerts.claim` at the caller. Push
 * only. `tag` is the opsAlerts key, so a newer alert replaces the older one.
 */
export const occupancyAlert = defineKind({
	category: "doors",
	payload: v.object({ title: v.string(), body: v.string(), tag: v.string() }),
	audience: (context) => boardIds(context),
	push: ({ title, body, tag }) => ({ title, body, url: insightsUrl(), tag }),
});
