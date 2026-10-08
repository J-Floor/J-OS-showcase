// apps/web/convex/emails/urls.ts
import type { Purpose } from "../lib/confirmToken.ts";

/**
 * Absolute URLs for emails, derived from SITE_URL (the prod/dev frontend
 * origin). Emails need absolute URLs; the logo PNG is served by the SPA's
 * static host at /email/logo.png.
 */
function siteUrl(): string {
	return process.env.SITE_URL ?? "";
}

export function emailUrls(): {
	siteUrl: string;
	logoUrl: string;
	signinUrl: string;
	privacyUrl: string;
} {
	const site = siteUrl();
	return {
		siteUrl: site,
		logoUrl: `${site}/email/logo.png`,
		signinUrl: `${site}/signin`,
		privacyUrl: `${site}/privacy`,
	};
}

/**
 * Deep links, for the button in a notification about one specific thing.
 *
 * A mail that says "Ada applied" and then lands the board on a roster of two
 * hundred rows has made them do the finding twice. Each of these names WHAT to
 * open and nothing else: the page works out which tab holds it
 * (`CommunityPage.tabOf`, `TasksPage`), so none of them carry a `?tab=` —
 * that would be the same fact written twice, and the copy that goes stale is
 * the one that wins.
 */
export function personUrl(personId: string): string {
	return `${siteUrl()}/community?person=${encodeURIComponent(personId)}`;
}

export function taskUrl(taskId: string): string {
	return `${siteUrl()}/tasks?task=${encodeURIComponent(taskId)}`;
}

export function projectUrl(projectId: string): string {
	return `${siteUrl()}/tasks?project=${encodeURIComponent(projectId)}`;
}

export function eventUrl(eventId: string): string {
	return `${siteUrl()}/events?event=${encodeURIComponent(eventId)}`;
}

/** The community roster, with no person open. */
export function communityUrl(): string {
	return `${siteUrl()}/community`;
}

/** The app's front door. */
export function homeUrl(): string {
	return `${siteUrl()}/`;
}

/** The Notifications drawer (`NotificationsHost` opens it from this param). */
export function manageNotificationsUrl(): string {
	return `${siteUrl()}/?notifications=open`;
}

/**
 * The Diagnostics tab carries the lock-health tile, so a door alert lands on
 * it. The one link here that names a tab: Diagnostics holds no entity the page
 * could find a tab for, so the "no `?tab=`" rule above does not apply.
 */
export function doorDiagnosticsUrl(): string {
	return `${siteUrl()}/space?tab=diagnostics`;
}

/** The Space page on its default Access tab, where a guest sees their countdown. */
export function spaceUrl(): string {
	return `${siteUrl()}/space`;
}

const CONFIRM_PATHS: Record<Purpose, string> = {
	application: "/apply/confirm",
	visitor: "/visitor/confirm",
	eventInvite: "/event/confirm",
	emailChange: "/email/confirm",
};

/** The link a confirm email carries for a freshly issued token. */
export function confirmUrl(purpose: Purpose, token: string): string {
	return `${siteUrl()}${CONFIRM_PATHS[purpose]}?token=${encodeURIComponent(token)}`;
}
