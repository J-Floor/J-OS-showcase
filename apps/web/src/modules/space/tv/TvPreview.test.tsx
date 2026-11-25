// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
	rewriteAssetRefs: (html: string) => html,
}));

vi.mock("@j-os/tv-player/player.css", () => ({}));

const SLIDES = [
	{
		id: "a",
		kind: "html",
		durationSec: 15,
		url: "https://files.example.com/a",
	},
];

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn(() =>
			Promise.resolve(
				new Response("<script>document.title = 'x'</script><p>hi</p>")
			)
		)
	);
	previewMock.createPlayer.mockClear();
	previewMock.player.setSlides.mockClear();
	previewMock.player.setTransition.mockClear();
	previewMock.player.destroy.mockClear();
	previewMock.set({ transition: "slide", slides: SLIDES, assets: [] });
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function renderPreview() {
	const [open, setOpen] = createSignal(true);
	render(() => <TvPreview open={open()} onOpenChange={setOpen} />);
	return { setOpen };
}

test("the player draws into a stage inside the dialog, then gets the slides and transition", async () => {
	renderPreview();
	expect(previewMock.createPlayer).toHaveBeenCalledTimes(1);
	const [stage, options] = previewMock.createPlayer.mock.calls[0] as [
		HTMLElement,
		{ slides: unknown; transition: string },
	];
	expect(screen.getByRole("dialog")).toContainElement(stage);
	expect(options).toEqual({ slides: [], transition: "fade" });
	await waitFor(() => {
		expect(previewMock.player.setSlides).toHaveBeenCalledWith([
			{
				id: "a",
				kind: "html",
				durationSec: 15,
				html: "<script>document.title = 'x'</script><p>hi</p>",
			},
		]);
	});
	expect(previewMock.player.setTransition).toHaveBeenCalledWith("slide");
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
	previewMock.set({ transition: "none", slides: [], assets: [] });
	await waitFor(() => {
		expect(previewMock.player.setSlides).toHaveBeenCalledWith([]);
	});
	expect(previewMock.player.setTransition).toHaveBeenCalledWith("none");
});

test("says it is loading until the slides have gone to the player", async () => {
	let release: ((response: Response) => void) | undefined;
	vi.stubGlobal(
		"fetch",
		vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					release = resolve;
				})
		)
	);
	renderPreview();
	expect(screen.getByText("Loading the preview...")).toBeInTheDocument();
	await waitFor(() => {
		expect(release).toBeDefined();
	});
	release?.(new Response("<p>hi</p>"));
	await waitFor(() => {
		expect(previewMock.player.setSlides).toHaveBeenCalled();
	});
	expect(screen.queryByText("Loading the preview...")).toBeNull();
});

test("a slide whose file answers with an error is skipped and the others still show", async () => {
	previewMock.set({
		transition: "fade",
		slides: [
			{
				id: "gone",
				kind: "html",
				durationSec: 15,
				url: "https://files.example.com/gone",
			},
			...SLIDES,
		],
		assets: [],
	});
	vi.stubGlobal(
		"fetch",
		vi.fn((url: string) =>
			Promise.resolve(
				url.endsWith("/gone")
					? new Response("nope", { status: 404 })
					: new Response("<p>hi</p>")
			)
		)
	);
	renderPreview();
	await waitFor(() => {
		expect(previewMock.player.setSlides).toHaveBeenCalledWith([
			{ id: "a", kind: "html", durationSec: 15, html: "<p>hi</p>" },
		]);
	});
});

test("the stage sits in a measured frame inside the sized card", () => {
	renderPreview();
	const [stage] = previewMock.createPlayer.mock.calls[0] as [HTMLElement];
	expect(stage.className).toMatch(/stage/);
	expect(stage.parentElement?.className).toMatch(/frame/);
	expect(screen.getByRole("dialog").className).toMatch(/card/);
});

// Limits: a DOM without layout (happy-dom) computes no CSS cascade, sizes or
// container queries, and the player is a spy, so no test here can observe the
// stage's real size. The real defect (the dialog body sizing to its content,
// so the measured frame collapsed to zero height and the player's fit never
// ran) was checked in headless Chromium against the compiled CSS. This test
// pins the declarations that fix it, so dropping one fails loudly.
test("the stylesheet makes the dialog body fill the card and the stage fit the measured frame", () => {
	const css = readFileSync(
		resolve(process.cwd(), "src/modules/space/tv/TvPreview.module.scss"),
		"utf8"
	);
	function rule(selector: string): string {
		return new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
	}
	// The body is the card's last child; it must grow into the card's height.
	expect(css).toMatch(
		/> :last-child\s*\{[^}]*flex:\s*1 1 0;[^}]*min-block-size:\s*0;/
	);
	// The frame is measured, and the stage is sized from that measure.
	expect(rule("\\.frame")).toMatch(/container-type:\s*size/);
	expect(rule("\\.stage")).toMatch(
		/inline-size:\s*min\(100cqi, 100cqb \* 16 \/ 9\)/
	);
	// Beats the dialog's own single-class width cap.
	expect(css).toMatch(/\.card\.card\s*\{/);
});
