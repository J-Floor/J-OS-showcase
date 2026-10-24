// @vitest-environment happy-dom
import { LOGO_PART } from "@j-os/design-system";
import { afterEach, expect, test, vi } from "vitest";

import { BRAND_FRAME, railLanding } from "./brandLanding.ts";

/** A rail holding its monogram. */
function mountRail(): { rail: HTMLElement; mark: HTMLElement } {
	const rail = document.createElement("nav");
	rail.setAttribute(BRAND_FRAME, "");
	const mark = document.createElement("span");
	mark.setAttribute(LOGO_PART, "mark");
	rail.append(mark);
	document.body.append(rail);
	return { rail, mark };
}

/** Every element has a layout box, except the ones `isHidden` picks. */
function layOut(isHidden: (element: Element) => boolean = () => false): void {
	vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(
		function (this: HTMLElement) {
			return { length: isHidden(this) ? 0 : 1 } as DOMRectList;
		}
	);
}

afterEach(() => {
	vi.restoreAllMocks();
	document.body.replaceChildren();
});

test("the logo lands on the rail, its J on the rail's monogram", () => {
	layOut();
	const { rail, mark } = mountRail();
	expect(railLanding()).toEqual({
		box: rail,
		mark,
		kind: "app-brand-unfold",
	});
});

test("no landing where the rail's monogram shows no box (a phone)", () => {
	const { mark } = mountRail();
	layOut((element) => element === mark);
	expect(railLanding()).toBeNull();
});

test("no landing without a rail (signed out, onboarding)", () => {
	layOut();
	expect(railLanding()).toBeNull();
});
