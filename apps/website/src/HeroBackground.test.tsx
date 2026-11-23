import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import {
	afterEach,
	beforeEach,
	expect,
	it,
	vi,
	type MockInstance,
} from "vitest";

import { HeroBackground } from "./HeroBackground.tsx";

let playSpy: MockInstance<() => Promise<void>>;
let pauseSpy: MockInstance<() => void>;
let isReduced = false;
let change: () => void;
let intersect: (isVisible: boolean) => void;
beforeEach(() => {
	isReduced = false;
	vi.stubGlobal("matchMedia", () => ({
		get matches() {
			return isReduced;
		},
		addEventListener: (_name: string, listener: () => void) => {
			change = listener;
		},
		removeEventListener: vi.fn(),
	}));
	vi.stubGlobal(
		"IntersectionObserver",
		class {
			constructor(
				callback: (entries: { isIntersecting: boolean }[]) => void
			) {
				intersect = (isVisible) => {
					callback([{ isIntersecting: isVisible }]);
				};
			}
			observe() {}
			disconnect() {}
		}
	);
	playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
	pauseSpy = vi
		.spyOn(HTMLMediaElement.prototype, "pause")
		.mockImplementation(() => {});
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});
it("does not load video bytes for reduced motion", () => {
	isReduced = true;
	const view = render(() => <HeroBackground />);
	intersect(true);
	expect(
		view.container.querySelector("video")!.getAttribute("src")
	).toBeNull();
	expect(playSpy).not.toHaveBeenCalled();
});
it("loops silently when visible and honors a manual pause across reentry", async () => {
	const view = render(() => <HeroBackground />);
	const video = view.container.querySelector("video")!;
	intersect(true);
	await waitFor(() => {
		expect(playSpy).toHaveBeenCalled();
	});
	expect(video.loop).toBe(true);
	expect(video.muted).toBe(true);
	fireEvent.playing(video);
	fireEvent.click(
		screen.getByRole("button", { name: "Pause background video" })
	);
	playSpy.mockClear();
	intersect(false);
	intersect(true);
	expect(playSpy).not.toHaveBeenCalled();
	fireEvent.click(
		screen.getByRole("button", { name: "Play background video" })
	);
	expect(playSpy).toHaveBeenCalledOnce();
	isReduced = true;
	change();
	expect(pauseSpy).toHaveBeenCalled();
});
it("keeps the poster available when autoplay is rejected", async () => {
	playSpy.mockRejectedValue(new Error("Autoplay unavailable"));
	const view = render(() => <HeroBackground />);
	intersect(true);
	await waitFor(() => {
		expect(playSpy).toHaveBeenCalled();
	});
	expect(view.container.querySelector("img")!.getAttribute("src")).toBe(
		"/assets/hero/poster.webp"
	);
	expect(
		screen.getByRole("button", { name: "Play background video" })
	).toBeTruthy();
});
