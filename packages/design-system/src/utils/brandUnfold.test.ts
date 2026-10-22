// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from "vitest";

import { LOGO_PART } from "../components/Logo/Logo.tsx";
import {
	fakeViewTransitions,
	installViewTransitions,
	restoreViewTransitions,
} from "../test/viewTransitionFakes.ts";

import { unfoldLogo } from "./brandUnfold.ts";

const RAIL = "rail-hook";

/** The element ids holding a transition name, keyed by name. */
function names(): Record<string, string> {
	const held: Record<string, string> = {};
	for (const element of document.querySelectorAll<HTMLElement>("[id]")) {
		const name = element.style.getPropertyValue("view-transition-name");
		if (name) held[name] = element.id;
	}
	return held;
}

/** The names held, and data-vt, at the old and the new snapshot. */
function recordSnapshots() {
	const seen: {
		old?: Record<string, string>;
		new?: Record<string, string>;
		kinds?: string;
		vars?: [string, string];
	} = {};
	const root = document.documentElement;
	fakeViewTransitions({
		onStart: () => {
			seen.old = names();
		},
		onSnapshot: () => {
			seen.new = names();
			seen.kinds = root.dataset.vt;
			seen.vars = [
				root.style.getPropertyValue("--jf-brand-stroke"),
				root.style.getPropertyValue("--jf-brand-corner"),
			];
		},
	});
	return seen;
}

/** Every element has a layout box, except the ones `isHidden` picks. */
function layOut(isHidden: (element: Element) => boolean = () => false): void {
	vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(
		function (this: HTMLElement) {
			return { length: isHidden(this) ? 0 : 1 } as DOMRectList;
		}
	);
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
		height: 296,
	} as DOMRect);
}

function mountLogo(): HTMLElement {
	const logo = document.createElement("div");
	logo.innerHTML = `
		<span id="logo-frame" ${LOGO_PART}="frame"></span>
		<span id="logo-mark" ${LOGO_PART}="mark"></span>`;
	document.body.append(logo);
	return logo;
}

/** The flip: the logo leaves, a rail with its monogram arrives. */
function flipFrom(logo: HTMLElement): () => void {
	return () => {
		logo.remove();
		const rail = document.createElement("nav");
		rail.id = "rail";
		rail.setAttribute(RAIL, "");
		rail.innerHTML = `<span id="monogram" ${LOGO_PART}="mark"></span>`;
		document.body.append(rail);
	};
}

function landing(): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[${RAIL}]`);
}

afterEach(() => {
	restoreViewTransitions();
	document.body.replaceChildren();
});

test("the logo's frame and J become the landing's frame and monogram", async () => {
	const seen = recordSnapshots();
	layOut();
	const logo = mountLogo();
	await unfoldLogo({ logo, landing, flip: flipFrom(logo) });
	expect(seen.old).toEqual({
		"jf-brand-frame": "logo-frame",
		"jf-brand-mark": "logo-mark",
	});
	expect(seen.new).toEqual({
		"jf-brand-frame": "rail",
		"jf-brand-mark": "monogram",
	});
	expect(seen.kinds).toBe("brand brand-unfold");
});

test("the logo's stroke and corner are set for the transition, cleared after", async () => {
	const seen = recordSnapshots();
	layOut();
	const logo = mountLogo();
	await unfoldLogo({ logo, landing, flip: flipFrom(logo) });
	const root = document.documentElement;
	expect(seen.vars).toEqual(["9.68px", "6.45px"]);
	expect(root.style.getPropertyValue("--jf-brand-stroke")).toBe("");
	expect(root.style.getPropertyValue("--jf-brand-corner")).toBe("");
	expect(root.dataset.vt).toBeUndefined();
});

test("a landing with no box is not named: the logo only fades", async () => {
	const seen = recordSnapshots();
	layOut((element) => element.closest(`[${RAIL}]`) !== null);
	const logo = mountLogo();
	await unfoldLogo({ logo, landing, flip: flipFrom(logo) });
	expect(seen.old).toEqual({
		"jf-brand-frame": "logo-frame",
		"jf-brand-mark": "logo-mark",
	});
	expect(seen.new).toEqual({});
	expect(seen.kinds).toBe("brand");
});

test("a landing without its monogram on screen is not named either", async () => {
	const seen = recordSnapshots();
	layOut((element) => element.id === "monogram");
	const logo = mountLogo();
	await unfoldLogo({ logo, landing, flip: flipFrom(logo) });
	expect(seen.new).toEqual({});
});

test("without View Transitions the flip is instant", () => {
	layOut();
	const logo = mountLogo();
	const flip = vi.fn(flipFrom(logo));
	void unfoldLogo({ logo, landing, flip });
	expect(flip).toHaveBeenCalledTimes(1);
	expect(names()).toEqual({});
	expect(
		document.documentElement.style.getPropertyValue("--jf-brand-stroke")
	).toBe("");
});

test("under reduced motion the flip is instant", () => {
	const start = vi.fn();
	installViewTransitions(start, { reducedMotion: true });
	layOut();
	const logo = mountLogo();
	const flip = vi.fn(flipFrom(logo));
	void unfoldLogo({ logo, landing, flip });
	expect(start).not.toHaveBeenCalled();
	expect(flip).toHaveBeenCalledTimes(1);
});
