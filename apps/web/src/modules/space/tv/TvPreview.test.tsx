// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { TvPreview } from "./TvPreview.tsx";

// `convex-solidjs` is stubbed: previewSlides answers from a signal the test
// sets; the player is a spy so the test sees how it is driven.
const previewMock = vi.hoisted(() => ({
	set: vi.fn<(value: unknown) => void>(),
	player: {
		setSlides: vi.fn(),
		setTransition: vi.fn(),
		destroy: vi.fn(),
	},
	createPlayer: vi.fn(),
}));

vi.mock("convex-solidjs", async () => {
	const { createSignal: signal } = await import("solid-js");
	const [data, setData] = signal<unknown>(undefined);
	previewMock.set.mockImplementation((value) => {
		setData(() => value);
	});
	return {
		useQuery: () => ({
			data,
			error: () => {},
			isLoading: () => false,
		}),
	};
});

vi.mock("@j-os/tv-player", () => ({
	createPlayer: (...args: unknown[]) => {
		previewMock.createPlayer(...args);
		return previewMock.player;
	},
}));

vi.mock("@j-os/tv-player/player.css", () => ({}));

const SLIDES = [
	{
		id: "a",
		title: "Welcome",
		kind: "html",
		durationSec: 15,
		html: "<script>document.title = 'x'</script><p>hi</p>",
		imageUrl: undefined,
	},
];

beforeEach(() => {
	previewMock.createPlayer.mockClear();
	previewMock.player.setSlides.mockClear();
	previewMock.player.setTransition.mockClear();
	previewMock.player.destroy.mockClear();
	previewMock.set({ transition: "slide", slides: SLIDES });
});

afterEach(cleanup);

function renderPreview() {
	const [open, setOpen] = createSignal(true);
	render(() => <TvPreview open={open()} onOpenChange={setOpen} />);
	return { setOpen };
}

test("the player draws into a stage inside the dialog, with the slides and transition", () => {
	renderPreview();
	expect(previewMock.createPlayer).toHaveBeenCalledTimes(1);
	const [stage, options] = previewMock.createPlayer.mock.calls[0] as [
		HTMLElement,
		{ slides: unknown; transition: string },
	];
	expect(screen.getByRole("dialog")).toContainElement(stage);
	expect(options).toEqual({ slides: SLIDES, transition: "slide" });
	// The slide's HTML is handed to the player as a string; it never reaches
	// the page's own DOM.
	expect(document.body.innerHTML).not.toContain("<script>document.title");
	expect(document.body.textContent).not.toContain("hi");
});

test("closing the preview destroys the player", async () => {
	const { setOpen } = renderPreview();
	expect(previewMock.player.destroy).not.toHaveBeenCalled();
	setOpen(false);
	await waitFor(() => {
		expect(previewMock.player.destroy).toHaveBeenCalledTimes(1);
	});
});

test("a change made elsewhere reaches the open player", async () => {
	renderPreview();
	previewMock.set({ transition: "none", slides: [] });
	await waitFor(() => {
		expect(previewMock.player.setSlides).toHaveBeenCalledWith([]);
	});
	expect(previewMock.player.setTransition).toHaveBeenCalledWith("none");
});
