import { v } from "convex/values";

import { boardDoorAlert } from "../../emails/generated/boardDoorAlert.ts";
import {
	doorDiagnosticsUrl,
	emailUrls,
	manageNotificationsUrl,
} from "../../emails/urls.ts";
import { boardIds } from "../audience.ts";
import { defineKind } from "../types.ts";

/**
 * The door fault the board hears about: a lock offline or back online (the
 * 10-minute poll). Whether to send at all is decided by `opsAlerts.claim` at the caller;
 * this only says it. `tag` is the opsAlerts key, so a newer alert of the same
 * fault replaces the older one on the device.
 */
export const doorAlert = defineKind({
	category: "doors",
	payload: v.object({
		headline: v.string(),
		detail: v.string(),
		consequence: v.string(),
		tag: v.string(),
	}),
	audience: (ctx) => boardIds(ctx),
	push: ({ headline, consequence, tag }) => ({
		title: headline,
		body: consequence,
		url: doorDiagnosticsUrl(),
		tag,
	}),
	email: ({ headline, detail, consequence }) => {
		const { html, text } = boardDoorAlert({
			headline,
			detail,
			consequence,
			diagnosticsUrl: doorDiagnosticsUrl(),
			manageUrl: manageNotificationsUrl(),
			logoUrl: emailUrls().logoUrl,
		});
		return { subject: "J floor door access needs attention", html, text };
	},
});
