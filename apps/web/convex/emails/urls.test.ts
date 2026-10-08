// @vitest-environment edge-runtime
import { afterEach, expect, test, vi } from "vitest";

import {
	confirmUrl,
	doorDiagnosticsUrl,
	emailUrls,
	eventUrl,
	homeUrl,
	manageNotificationsUrl,
	personUrl,
	projectUrl,
	spaceUrl,
	taskUrl,
} from "./urls.ts";

afterEach(() => {
	vi.unstubAllEnvs();
});

test("emailUrls derives the logo, sign-in and privacy URLs from SITE_URL", () => {
	vi.stubEnv("SITE_URL", "https://j.floor");
	expect(emailUrls()).toEqual({
		siteUrl: "https://j.floor",
		logoUrl: "https://j.floor/email/logo.png",
		signinUrl: "https://j.floor/signin",
		privacyUrl: "https://j.floor/privacy",
	});
});

test("deep links point at one thing, on the page that owns it", () => {
	vi.stubEnv("SITE_URL", "https://j.floor");
	expect(personUrl("p1")).toBe("https://j.floor/community?person=p1");
	expect(taskUrl("t1")).toBe("https://j.floor/tasks?task=t1");
	expect(projectUrl("pr1")).toBe("https://j.floor/tasks?project=pr1");
});

test("a deep link names WHAT to open and never which tab", () => {
	vi.stubEnv("SITE_URL", "https://j.floor");
	// Both pages derive the tab from the id (`CommunityPage.tabOf`,
	// `TasksPage`). A `tab=` in the link is a second copy of that fact, and it
	// is the copy that goes stale — a guest promoted to member still carries
	// `tab=guests` in every mail already sent.
	for (const url of [personUrl("p1"), taskUrl("t1"), projectUrl("pr1")]) {
		expect(url).not.toContain("tab=");
	}
});

test("notification links: the event, the settings drawer, the door diagnostics, the space", () => {
	vi.stubEnv("SITE_URL", "https://j.floor");
	expect(eventUrl("e1")).toBe("https://j.floor/events?event=e1");
	expect(manageNotificationsUrl()).toBe(
		"https://j.floor/?notifications=open"
	);
	expect(doorDiagnosticsUrl()).toBe("https://j.floor/space?tab=diagnostics");
	expect(spaceUrl()).toBe("https://j.floor/space");
});

test("homeUrl is the site origin with a trailing slash", () => {
	vi.stubEnv("SITE_URL", "https://j.floor");
	expect(homeUrl()).toBe("https://j.floor/");
});

test("confirmUrl carries the encoded token on the purpose's confirm path", () => {
	vi.stubEnv("SITE_URL", "https://j.floor");
	expect(confirmUrl("visitor", "ab c")).toBe(
		"https://j.floor/visitor/confirm?token=ab%20c"
	);
	expect(confirmUrl("application", "t")).toBe(
		"https://j.floor/apply/confirm?token=t"
	);
});
