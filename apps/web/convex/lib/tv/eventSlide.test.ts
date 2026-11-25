import { rewriteAssetRefs } from "@j-os/tv-player";
import { describe, expect, it } from "vitest";

import { utcFromLocal } from "../time.ts";

import { TV_LIMITS } from "./constants.ts";
import {
	eventPhase,
	eventSlideHtml,
	eventWhen,
	qrSvg,
	type EventSlideContent,
} from "./eventSlide.ts";
import { eventSlidePaths } from "./eventSlideFiles.ts";
import { htmlBytes } from "./htmlBytes.ts";

const EVENT = "jdaxkmnpqrstvwxyzabcdefghjkmnpqr";
const PICTURE = "kgbcdfghjklmnpqrstvwxyzabcdfghjk";
const PATHS = eventSlidePaths(EVENT, { pictureId: PICTURE, extension: "jpg" });
/** Small enough that a regression (an inlined font or picture) shows. */
const PAGE_BYTES_MAX = TV_LIMITS.htmlMax / 10;
const STARTS_LOCAL = "2026-10-01T18:00:00+02:00[Europe/Zurich]";
const ENDS_LOCAL = "2026-10-01T22:00:00+02:00[Europe/Zurich]";
const STARTS_AT = utcFromLocal(STARTS_LOCAL);
const ENDS_AT = utcFromLocal(ENDS_LOCAL);
const BEFORE = STARTS_AT - 1;
const DURING = STARTS_AT + 1;
const AFTER = ENDS_AT + 1;

const CONTENT: EventSlideContent = {
	name: "Demo night",
	description: "Ten teams show what they built.\nDrinks after.",
	startsAt: STARTS_AT,
	endsAt: ENDS_AT,
	startsAtLocal: STARTS_LOCAL,
	endsAtLocal: ENDS_LOCAL,
	paths: PATHS,
	signUpUrl: `https://example.com/demo-night`,
};

describe("eventPhase", () => {
	it("is soon before the start, live from the start through the end, past after", () => {
		expect(eventPhase(STARTS_AT, ENDS_AT, BEFORE)).toBe("soon");
		expect(eventPhase(STARTS_AT, ENDS_AT, STARTS_AT)).toBe("live");
		// A live event is still on at exactly endsAt (`eventLive`).
		expect(eventPhase(STARTS_AT, ENDS_AT, ENDS_AT)).toBe("live");
		expect(eventPhase(STARTS_AT, ENDS_AT, AFTER)).toBe("past");
	});
});

function nameSize(name: string): string | undefined {
	return /class="name (name-\w+)"/.exec(
		eventSlideHtml({ ...CONTENT, name }, BEFORE)
	)?.[1];
}

describe("eventSlideHtml states", () => {
	it("before the start: Coming up, with the QR", async () => {
		const page = eventSlideHtml(CONTENT, BEFORE);
		expect(page).toContain("Coming up at J floor");
		expect(page).toContain('<div class="qr"><svg');
		await expect(page).toMatchFileSnapshot(
			"./__snapshots__/event-slide.html"
		);
	});

	it("while it runs: Happening now, with the QR", async () => {
		const page = eventSlideHtml(CONTENT, DURING);
		expect(page).toContain("Happening now at J floor");
		expect(page).not.toContain("Coming up");
		expect(page).toContain('<div class="qr"><svg');
		await expect(page).toMatchFileSnapshot(
			"./__snapshots__/event-slide-live.html"
		);
	});

	it("after the end: Past event, and no QR", async () => {
		const page = eventSlideHtml(CONTENT, AFTER);
		expect(page).toContain("Past event at J floor");
		expect(page).not.toContain('class="qr"');
		expect(page).not.toContain("Sign up");
		await expect(page).toMatchFileSnapshot(
			"./__snapshots__/event-slide-past.html"
		);
	});

	it("is the same page for any moment inside one state", () => {
		expect(eventSlideHtml(CONTENT, DURING)).toBe(
			eventSlideHtml(CONTENT, ENDS_AT)
		);
	});
});

describe("eventWhen", () => {
	it("writes a one-day event as its day and two times", () => {
		expect(eventWhen(CONTENT.startsAtLocal, CONTENT.endsAtLocal)).toBe(
			"Thu 1 Oct, 18:00 to 22:00"
		);
	});

	it("names both days when the event runs past midnight", () => {
		expect(
			eventWhen(
				"2026-10-01T22:00:00+02:00[Europe/Zurich]",
				"2026-10-02T02:00:00+02:00[Europe/Zurich]"
			)
		).toBe("Thu 1 Oct, 22:00 to Fri 2 Oct, 02:00");
	});

	it("uses the Zurich wall clock in winter too", () => {
		expect(
			eventWhen(
				"2026-12-03T18:30:00+01:00[Europe/Zurich]",
				"2026-12-03T21:00:00+01:00[Europe/Zurich]"
			)
		).toBe("Thu 3 Dec, 18:30 to 21:00");
	});

	it("names the next day for an event ending at midnight", () => {
		expect(
			eventWhen(
				"2026-10-01T20:00:00+02:00[Europe/Zurich]",
				"2026-10-02T00:00:00+02:00[Europe/Zurich]"
			)
		).toBe("Thu 1 Oct, 20:00 to Fri 2 Oct, 00:00");
	});
});

describe("eventSlideHtml", () => {
	const html = eventSlideHtml(CONTENT, BEFORE);

	it("is a 3840x2160 page on true black with no gradient", () => {
		expect(html).toContain("width:3840px;height:2160px");
		expect(html).toContain("background:#000");
		expect(html).not.toMatch(/gradient|opacity/i);
	});

	it("shows the facts and the brand as written", () => {
		expect(html).toContain(">Demo night</h1>");
		expect(html).toContain("Thu 1 Oct, 18:00 to 22:00");
		expect(html).toContain(
			"Ten teams show what they built.\nDrinks after."
		);
		expect(html).toContain("Coming up at J floor");
		expect(html).not.toMatch(/J Floor|J FLOOR|—/);
	});

	it("escapes board-written text", () => {
		const page = eventSlideHtml(
			{
				...CONTENT,
				name: '<script>alert("x")</script> & co',
				description: "<img src=x onerror=alert(1)>",
			},
			BEFORE
		);
		expect(page).not.toContain("<script>");
		expect(page).not.toContain("<img src=x");
		expect(page).toContain(
			"&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co"
		);
	});

	it("cannot be broken out of by quotes, a closing style tag or line separators", () => {
		const page = eventSlideHtml(
			{
				...CONTENT,
				name: 'a" onload="x</style><b>\u2028end',
				description: "'><svg onload=1></style>\u2028x",
			},
			BEFORE
		);
		// The only style element is the page's own.
		expect(page.match(/<\/style>/g)).toHaveLength(1);
		expect(page).not.toContain("<b>");
		expect(page).not.toContain("<svg onload");
		expect(page).not.toContain('" onload=');
		expect(page).toContain("a&quot; onload=&quot;x&lt;/style&gt;&lt;b&gt;");
		expect(page).toContain("&#39;&gt;&lt;svg onload=1&gt;&lt;/style&gt;");
	});

	it("escapes a picture path used as an attribute", () => {
		const page = eventSlideHtml(
			{
				...CONTENT,
				paths: { ...PATHS, picture: 'x.jpg" onerror="alert(1)' },
			},
			BEFORE
		);
		expect(page).not.toContain('" onerror=');
		expect(page).toContain("x.jpg&quot; onerror=&quot;alert(1)");
	});

	it("loads every file from the pack, which the TV can resolve", () => {
		const known = new Set([
			PATHS.fonts.body,
			PATHS.fonts.display,
			PATHS.picture ?? "",
		]);
		const resolved = rewriteAssetRefs(html, (path) =>
			known.has(path) ? "data:x" : undefined
		);
		expect(resolved).not.toContain("assets/");
		expect(html).not.toMatch(
			/src="(?:https?|blob):|url\("?(?:https?|blob):/
		);
	});

	it("draws the sign-up QR as an inline SVG on white, for exactly the sign-up URL", () => {
		expect(html).toContain(
			`<div class="qr">${qrSvg(CONTENT.signUpUrl ?? "")}</div>`
		);
		expect(html).toContain('fill="white"');
		expect(html).toContain("Sign up");
	});

	it("encodes the URL it is given", () => {
		const other = "https://example.com/other";
		expect(qrSvg(other)).not.toBe(qrSvg(CONTENT.signUpUrl ?? ""));
		expect(
			eventSlideHtml({ ...CONTENT, signUpUrl: other }, BEFORE)
		).toContain(qrSvg(other));
	});

	it("leaves the QR out without a sign-up URL", () => {
		const page = eventSlideHtml(
			{ ...CONTENT, signUpUrl: undefined },
			BEFORE
		);
		expect(page).not.toContain('class="qr"');
		expect(page).not.toContain("Sign up");
	});

	it("shows the wordmark panel without a picture", () => {
		const page = eventSlideHtml(
			{
				...CONTENT,
				paths: eventSlidePaths(EVENT),
			},
			BEFORE
		);
		expect(page).toContain('class="visual logo"');
		expect(page).toContain('aria-label="J floor"');
		expect(page).not.toContain("<img");
	});

	it("gives a long name the smaller size", () => {
		const page = eventSlideHtml(
			{
				...CONTENT,
				name: "Founders breakfast with the climate tech investors of Zurich",
			},
			BEFORE
		);
		expect(page).toContain('class="name name-long"');
		expect(html).toContain('class="name name-short"');
	});

	it("keeps the large size to names of 14 characters or fewer: a longer one with a long word would be cut at two lines", () => {
		expect(nameSize("x".repeat(14))).toBe("name-short");
		expect(nameSize("Product management night")).toBe("name-long");
	});

	it("stays small: fonts and picture are pack files, not inlined", () => {
		expect(htmlBytes(html)).toBeLessThan(PAGE_BYTES_MAX);
	});
});
