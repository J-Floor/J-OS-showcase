import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { Intro } from "./Intro.tsx";

let isReduced = false;
let changePreference: () => void;
let pendingFrame: FrameRequestCallback | undefined;
let scrollPosition = 0;
let scrollTo: { mock: unknown };

beforeEach(() => {
	isReduced = false;
	vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
	vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
	scrollPosition = 0;
	pendingFrame = undefined;
	const preferenceListeners = new Set<() => void>();
	changePreference = () => {
		preferenceListeners.forEach((listener) => {
			listener();
		});
	};
	vi.stubGlobal("matchMedia", () => ({
		get matches() {
			return isReduced;
		},
		addEventListener: (_event: string, callback: () => void) => {
			preferenceListeners.add(callback);
		},
		removeEventListener: (_event: string, callback: () => void) => {
			preferenceListeners.delete(callback);
		},
	}));
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		pendingFrame = callback;
		return 1;
	});
	vi.stubGlobal("cancelAnimationFrame", vi.fn());
	vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollPosition);
	scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
	vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
		function (this: HTMLElement) {
			return this.hasAttribute("data-enhanced") ? 4000 : 800;
		}
	);
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
		function (this: HTMLElement) {
			const height = this.offsetHeight;
			return {
				top: -scrollPosition,
				bottom: height - scrollPosition,
				left: 0,
				right: 320,
				width: 320,
				height,
				x: 0,
				y: -scrollPosition,
				toJSON() {},
			};
		}
	);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function advance(time: number) {
	const callback = pendingFrame;
	pendingFrame = undefined;
	callback?.(time);
}
function scroll(progress: number) {
	scrollPosition = progress * 800;
	fireEvent.scroll(window);
}

it("autoplays the sentences and final logo without scrolling", () => {
	const view = render(() => <Intro />);
	advance(0);
	advance(2800);
	expect(
		view.container.querySelector<HTMLElement>('[data-intro-word="Zurich"]')!
			.style.opacity
	).toBe("1");
	const floor =
		view.container.querySelector<HTMLElement>("[data-intro-floor]")!;
	expect(floor.style.getPropertyValue("--intro-floor-opacity")).toBe("0");
	advance(12500);
	expect(floor.style.getPropertyValue("--intro-floor-opacity")).toBe("1");
});
it("reveals controls on scroll while the independent story keeps playing", () => {
	const view = render(() => <Intro />);
	const root = screen.getByRole("region", { name: "Introducing J floor" });
	advance(0);
	scroll(0.2);
	advance(700);
	expect(root.style.getPropertyValue("--intro-nav-opacity")).toBe("1");
	expect(root.style.getPropertyValue("--intro-apply-opacity")).toBe("1");
	expect(root.style.getPropertyValue("--intro-events-opacity")).toBe("1");
	expect(root.style.getPropertyValue("--intro-tagline-opacity")).toBe("0");
	expect(
		view.container.querySelector<HTMLElement>('[data-intro-word="a"]')!
			.style.opacity
	).toBe("1");
	advance(2800);
	expect(
		view.container.querySelector<HTMLElement>('[data-intro-word="Zurich"]')!
			.style.opacity
	).toBe("1");
	scroll(0);
	advance(3000);
	expect(root.style.getPropertyValue("--intro-events-opacity")).toBe("1");
	expect(
		view.container.querySelector<HTMLElement>('[data-intro-word="Zurich"]')!
			.style.opacity
	).toBe("1");
});
it("keeps We are visible when scrolling and fades it only at the story ending", () => {
	render(() => <Intro />);
	const root = screen.getByRole("region", { name: "Introducing J floor" });
	advance(0);
	scroll(0.2);
	advance(700);
	expect(root.style.getPropertyValue("--intro-nav-opacity")).toBe("1");
	expect(root.style.getPropertyValue("--intro-heading-opacity")).toBe("1");
	advance(6000);
	expect(root.style.getPropertyValue("--intro-heading-opacity")).toBe("1");
	advance(10000);
	expect(
		Number(root.style.getPropertyValue("--intro-heading-opacity"))
	).toBeGreaterThan(0);
	expect(
		Number(root.style.getPropertyValue("--intro-heading-opacity"))
	).toBeLessThan(1);
	advance(10350);
	expect(root.style.getPropertyValue("--intro-heading-opacity")).toBe("0");
});
it("keeps punctuation throughout the autoplay sequence", () => {
	const view = render(() => <Intro />);
	const period = view.container.querySelector<HTMLElement>(
		'[data-intro-word="period"]'
	)!;
	for (const time of [
		0, 1000, 1500, 2000, 2800, 3800, 4500, 5500, 6600, 7600,
	]) {
		advance(time);
		expect(period.textContent).toBe(".");
		expect(period.style.opacity).toBe("1");
	}
});
it("supports reduced motion and live preference changes", () => {
	isReduced = true;
	render(() => <Intro />);
	const root = screen.getByRole("region", { name: "Introducing J floor" });
	expect(root.hasAttribute("data-enhanced")).toBe(false);
	expect(pendingFrame).toBeUndefined();
	isReduced = false;
	changePreference();
	expect(root.hasAttribute("data-enhanced")).toBe(true);
	advance(0);
	scroll(0.5);
	isReduced = true;
	changePreference();
	expect(root.hasAttribute("data-enhanced")).toBe(false);
	expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
});
it("keeps a stable accessible description and removes listeners on cleanup", () => {
	const view = render(() => <Intro />);
	expect(
		screen.getByText(/We are J floor, the space for innovation/)
	).toBeTruthy();
	expect(view.container.querySelector("[aria-live]")).toBeNull();
	view.unmount();
	pendingFrame = undefined;
	fireEvent.scroll(window);
	expect(pendingFrame).toBeUndefined();
});
it("allows keyboard skip to reveal links without ending the story", () => {
	const view = render(() => (
		<Intro>
			<a href="#events">Explore events</a>
		</Intro>
	));
	const root = screen.getByRole("region", { name: "Introducing J floor" });
	advance(0);
	fireEvent(root, new Event("intro-skip"));
	const hero =
		view.container.querySelector<HTMLElement>("[data-intro-hero]")!;
	expect(hero.inert).toBe(false);
	expect(
		view.container
			.querySelector<HTMLElement>("[data-intro-floor]")!
			.style.getPropertyValue("--intro-floor-opacity")
	).toBe("0");
});
