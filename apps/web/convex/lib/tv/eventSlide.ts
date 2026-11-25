import qrcode from "qrcode-generator";

import { escapeHtml } from "../../emails/escape.ts";
import {
	LOCALE,
	SITE_TIMEZONE,
	utcFromLocal,
	zonedTime,
	zonedTimeZoneName,
} from "../time.ts";

import { EVENT_FONTS } from "./eventFonts.ts";
import { EVENT_FONT_KEYS, type EventSlidePaths } from "./eventSlideFiles.ts";

// The slide an event on the TV gets: the black TV look of the jfloor-tv-slides
// skill (the Coming up family), at 3840x2160. Self-contained: styles inline,
// fonts and picture as pack files (`assets/...`), the QR as inline SVG. Runs on
// the TV's Chrome 76 in a sandboxed frame: no flex gap, no inset, no scripts.
// Static, so the sync re-renders it at the event's start and end
// (lib/tv/eventSlideSource.ts).

/** What the slide shows. Text is raw: every string is escaped here. */
export type EventSlideContent = {
	name: string;
	description?: string;
	/** Epoch ms; with `now` they pick the state. */
	startsAt: number;
	endsAt: number;
	startsAtLocal: string;
	endsAtLocal: string;
	paths: EventSlidePaths;
	/** The event's registration page (its `link`); absent leaves the QR out. */
	signUpUrl?: string;
};

/** Names up to this long get the large size on two lines; longer ones three smaller lines. */
const SHORT_NAME_CHARS = 14;
/** The QR's quiet zone, in modules (the standard asks for 4). */
const QR_QUIET_MODULES = 4;

export type EventPhase = "soon" | "live" | "past";

const KICKERS: Record<EventPhase, string> = {
	soon: "Coming up at J floor",
	live: "Happening now at J floor",
	past: "Past event at J floor",
};

/** The event is on up to and including `endsAt` (`eventLive`): the past state starts this long after it. */
export const PAST_AFTER_MS = 1;

/** The first moment of the past state. */
export function pastFrom(endsAt: number): number {
	return endsAt + PAST_AFTER_MS;
}

/** Soon before the start; live up to and including the end (`eventLive`); past after. */
export function eventPhase(
	startsAt: number,
	endsAt: number,
	now: number
): EventPhase {
	if (now < startsAt) return "soon";
	return now < pastFrom(endsAt) ? "live" : "past";
}

/** The J floor wordmark (apps/website/public/assets/logos/j-floor-wordmark.svg), light ink for black. */
const WORDMARK =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 129 23" role="img" aria-label="J floor"><path fill="#E3DEDB" d="M17 15.948C17 20.528 14.337 23 9.01 23H0v-3.46h9.047c2.189 0 3.356-1.285 3.356-3.361V3.46H3.101V0H17zM81.362 5.312c5.284 0 8.49 3.348 8.49 8.844 0 5.466-3.206 8.844-8.49 8.844-5.314 0-8.52-3.378-8.52-8.844 0-5.496 3.206-8.843 8.52-8.844m19.865 0c5.283 0 8.49 3.348 8.49 8.844 0 5.466-3.207 8.844-8.49 8.844-5.315 0-8.522-3.378-8.522-8.844 0-5.496 3.207-8.844 8.522-8.844M49.728 2.98h-3.847c-1.71 0-3.055.43-3.055 2.487V7.37h4.887v2.979h-4.887v9.304h6.567v2.979H34v-2.979h5.192V10.35h-3.757V7.37h3.757V5.527C39.192 2.303 41.238 0 44.628 0h5.1zm13.603 16.674h6.017v2.979H53.71v-2.979h5.955V2.98H55.91V0h7.421v19.653Zm59.774-14.34c3.452 0 5.895 2.119 5.895 5.926v2.118h-3.635V11.24c0-1.689-1.038-2.825-2.901-2.825-1.924 0-3.573 1.136-4.825 3.654v10.564h-3.635V5.68h3.451l.153 2.61c1.344-1.965 3.207-2.978 5.497-2.979Zm-41.743 3.01c-3.023 0-4.855 2.18-4.855 5.833 0 3.624 1.832 5.834 4.855 5.834 2.993 0 4.827-2.21 4.827-5.834 0-3.654-1.834-5.834-4.827-5.834Zm19.865 0c-3.024 0-4.857 2.179-4.857 5.833 0 3.624 1.833 5.834 4.857 5.834 2.992 0 4.825-2.21 4.825-5.834 0-3.654-1.833-5.834-4.825-5.834Z"/></svg>';

/**
 * 200 px margins; a 1760 px square on the left, a 1480 px column on the
 * right: kicker, name, time and a short description on top, the QR (760 px,
 * about 24 cm on a 55 inch TV, so it scans from across the room) and "Sign up"
 * at the bottom. The QR's quiet zone is in the SVG, not in CSS padding. True black, light text, no gradient or opacity: on a TV, anything
 * lifted off #000 glows.
 */
const BASE_CSS = [
	"*{box-sizing:border-box;margin:0;padding:0}",
	"html,body{width:3840px;height:2160px;overflow:hidden;background:#000}",
	'body{color:#e3dedb;font-family:"Manrope",sans-serif;-webkit-font-smoothing:antialiased}',
	".slide{display:flex;align-items:center;width:3840px;height:2160px;padding:200px}",
	".visual{flex:none;width:1760px;height:1760px;overflow:hidden;border-radius:24px}",
	".visual img{display:block;width:100%;height:100%;object-fit:cover}",
	".logo{display:flex;align-items:center;justify-content:center;border:6px solid #e3dedb}",
	".logo svg{display:block;width:1200px;height:214px}",
	".text{display:flex;flex-direction:column;flex:1;min-width:0;height:1760px;margin-left:200px}",
	".kicker{font-size:64px;font-weight:600;line-height:1.5;color:#a8a29e}",
	'.name{margin-top:48px;font-family:"Azeret Mono",monospace;font-weight:500;line-height:1.1;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}',
	".name-short{font-size:160px;-webkit-line-clamp:2}",
	".name-long{font-size:112px;-webkit-line-clamp:3}",
	".when{margin-top:48px;font-size:80px;font-weight:700;line-height:1.3}",
	".description{margin-top:40px;font-size:52px;line-height:1.4;color:#cfc9c5;white-space:pre-line;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;word-break:break-word}",
	".signup{display:flex;align-items:center;margin-top:auto;padding-top:40px}",
	".qr{flex:none;width:760px;height:760px;background:#fff}",
	".qr svg{display:block;width:100%;height:100%;shape-rendering:crispEdges}",
	".signup-label{margin-left:80px;font-size:96px;font-weight:700}",
].join("");

function fontFaces(paths: EventSlidePaths): string {
	return EVENT_FONT_KEYS.map((key) => {
		const font = EVENT_FONTS[key];
		return `@font-face{font-family:"${font.family}";font-style:normal;font-weight:${font.weights};src:url("${paths.fonts[key]}") format("woff2")}`;
	}).join("");
}

/** "Thu 1 Oct" in the value's own zone (the site's). */
function dayLabel(local: string): string {
	return new Intl.DateTimeFormat(LOCALE, {
		weekday: "short",
		day: "numeric",
		month: "short",
		timeZone: zonedTimeZoneName(local).unwrapOr(SITE_TIMEZONE),
	}).format(utcFromLocal(local));
}

/** "Thu 1 Oct, 18:00 to 22:00", or both days when it runs past midnight. */
export function eventWhen(startsAtLocal: string, endsAtLocal: string): string {
	const startDay = dayLabel(startsAtLocal);
	const endDay = dayLabel(endsAtLocal);
	const start = zonedTime(startsAtLocal);
	const end = zonedTime(endsAtLocal);
	return startDay === endDay
		? `${startDay}, ${start} to ${end}`
		: `${startDay}, ${start} to ${endDay}, ${end}`;
}

/** The QR as SVG markup: the generator writes only its own shapes, never the payload. */
export function qrSvg(payload: string): string {
	const code = qrcode(0, "M");
	code.addData(payload);
	code.make();
	return code.createSvgTag({
		cellSize: 1,
		margin: QR_QUIET_MODULES,
		scalable: true,
	});
}

function visual(paths: EventSlidePaths): string {
	return paths.picture === undefined
		? `<div class="visual logo">${WORDMARK}</div>`
		: `<div class="visual"><img src="${escapeHtml(paths.picture)}" alt=""></div>`;
}

function signUp(url: string | undefined): string {
	return url === undefined
		? ""
		: `<div class="signup"><div class="qr">${qrSvg(url)}</div><p class="signup-label">Sign up</p></div>`;
}

/**
 * The event's slide page in its state at `now`. Pure: same content and
 * state, same bytes (the render skips an unchanged page). A past event has
 * no QR: signing up for it is over.
 */
export function eventSlideHtml(
	content: EventSlideContent,
	now: number
): string {
	const phase = eventPhase(content.startsAt, content.endsAt, now);
	const size =
		content.name.length <= SHORT_NAME_CHARS ? "name-short" : "name-long";
	const description =
		content.description === undefined
			? ""
			: `<p class="description">${escapeHtml(content.description)}</p>`;
	return [
		"<!doctype html>",
		'<html lang="en">',
		'<head><meta charset="utf-8">',
		`<style>${fontFaces(content.paths)}${BASE_CSS}</style>`,
		"</head>",
		'<body><main class="slide">',
		visual(content.paths),
		'<section class="text">',
		`<p class="kicker">${KICKERS[phase]}</p>`,
		`<h1 class="name ${size}">${escapeHtml(content.name)}</h1>`,
		`<p class="when">${escapeHtml(eventWhen(content.startsAtLocal, content.endsAtLocal))}</p>`,
		description,
		signUp(phase === "past" ? undefined : content.signUpUrl),
		"</section></main></body></html>",
		"",
	].join("\n");
}
