// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { createSignal, Show } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import {
	fakeViewTransitions,
	installViewTransitions,
	restoreViewTransitions,
} from "../../test/viewTransitionFakes.ts";
import { LOGO_PART } from "../Logo/Logo.tsx";

import {
	BRAND_SCREEN,
	BrandReveal,
	type BrandLanding,
} from "./BrandReveal.tsx";

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
	const start = fakeViewTransitions({
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
	return { seen, start };
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

/** A full logo's two parts. */
function Logo() {
	return (
		<span>
			<span id="logo-frame" {...{ [LOGO_PART]: "frame" }} />
			<span id="logo-mark" {...{ [LOGO_PART]: "mark" }} />
		</span>
	);
}

/** A landing box with its monogram, as the children render it. */
function Landing() {
	return (
		<nav id="landing">
			<span id="monogram" {...{ [LOGO_PART]: "mark" }} />
		</nav>
	);
}

function landing(): BrandLanding | null {
	const box = document.getElementById("landing");
	return box
		? {
				box,
				mark: document.getElementById("monogram"),
				kind: "app-landing",
			}
		: null;
}

/** A BrandReveal over a marked screen; `withLanding` adds a landing. */
function mount(options: { withLanding?: boolean; animate?: boolean } = {}) {
	const [isReady, setReady] = createSignal(false);
	render(() => (
		<BrandReveal
			ready={isReady()}
			animate={options.animate}
			splash={<Logo />}
			landing={landing}
		>
			<div id="screen" {...{ [BRAND_SCREEN]: "" }}>
				App
				<Show when={options.withLanding}>
					<Landing />
				</Show>
			</div>
		</BrandReveal>
	));
	return { setReady };
}

/** The splash wrapper: the element named as the backdrop. */
function splashId(): void {
	document
		.querySelector<HTMLElement>('[data-part="brand-splash"]')
		?.setAttribute("id", "splash");
}

afterEach(() => {
	cleanup();
	restoreViewTransitions();
	vi.restoreAllMocks();
});

test("the splash shows until ready, the children after, the splash again if no longer ready", () => {
	const page = mount();
	expect(screen.queryByText("App")).not.toBeInTheDocument();
	page.setReady(true);
	expect(screen.getByText("App")).toBeInTheDocument();
	page.setReady(false);
	expect(screen.queryByText("App")).not.toBeInTheDocument();
});

test("the logo's frame and J land on the landing and its monogram", async () => {
	const { seen } = recordSnapshots();
	layOut();
	const page = mount({ withLanding: true });
	splashId();
	page.setReady(true);
	await vi.waitFor(() => {
		expect(seen.new).toBeDefined();
	});
	expect(seen.old).toEqual({
		"jf-brand-backdrop": "splash",
		"jf-brand-frame": "logo-frame",
		"jf-brand-mark": "logo-mark",
	});
	expect(seen.new).toEqual({
		"jf-brand-frame": "landing",
		"jf-brand-mark": "monogram",
	});
	expect(seen.kinds).toBe("brand app-landing");
});

test("the logo's stroke and corner are set for the transition, cleared after", async () => {
	const { seen } = recordSnapshots();
	layOut();
	const page = mount({ withLanding: true });
	page.setReady(true);
	const root = document.documentElement;
	await vi.waitFor(() => {
		expect(root.dataset.vt).toBeUndefined();
	});
	expect(seen.vars).toEqual(["9.68px", "6.45px"]);
	expect(root.style.getPropertyValue("--jf-brand-stroke")).toBe("");
	expect(root.style.getPropertyValue("--jf-brand-corner")).toBe("");
});

test("with no landing, the logo's frame grows into the screen and the J fades", async () => {
	const { seen } = recordSnapshots();
	layOut();
	const page = mount();
	page.setReady(true);
	await vi.waitFor(() => {
		expect(seen.new).toBeDefined();
	});
	expect(seen.new).toEqual({ "jf-brand-frame": "screen" });
	expect(seen.kinds).toBe("brand brand-reveal");
});

test("with neither a landing nor a screen on screen, the logo only fades", async () => {
	const { seen } = recordSnapshots();
	layOut((element) => element.id === "screen");
	const page = mount();
	page.setReady(true);
	await vi.waitFor(() => {
		expect(seen.new).toBeDefined();
	});
	expect(seen.new).toEqual({});
	expect(seen.kinds).toBe("brand");
});

test("animate false swaps at once", () => {
	const { start } = recordSnapshots();
	layOut();
	const page = mount({ animate: false });
	page.setReady(true);
	expect(start).not.toHaveBeenCalled();
	expect(screen.getByText("App")).toBeInTheDocument();
});

test("under reduced motion the swap is instant", () => {
	const start = vi.fn();
	installViewTransitions(start, { reducedMotion: true });
	layOut();
	const page = mount();
	page.setReady(true);
	expect(start).not.toHaveBeenCalled();
	expect(screen.getByText("App")).toBeInTheDocument();
});
