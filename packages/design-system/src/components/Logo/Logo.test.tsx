import { render, screen } from "@solidjs/testing-library";

import { Logo, logoFrameMetrics } from "./Logo.tsx";

function parts(container: HTMLElement): (string | undefined)[] {
	return [...container.querySelectorAll<HTMLElement>("[data-logo-part]")].map(
		(part) => part.dataset.logoPart
	);
}

test("the full logo renders the frame and the J as separate parts", () => {
	const { container } = render(() => <Logo />);
	expect(parts(container)).toEqual(["frame", "mark"]);
});

test("the monogram renders the J as the mark part", () => {
	const { container } = render(() => <Logo variant="monogram" />);
	expect(parts(container)).toEqual(["mark"]);
});

test("with a title, the split logo is one accessible image", () => {
	render(() => <Logo title="J floor" />);
	const images = screen.getAllByRole("img");
	expect(images).toHaveLength(1);
	expect(images[0]).toHaveAccessibleName("J floor");
	expect(images[0]).not.toHaveAttribute("aria-hidden");
});

test("without a title, the split logo stays decorative", () => {
	const { container } = render(() => <Logo animated />);
	const root = container.firstElementChild;
	expect(root).toHaveAttribute("aria-hidden", "true");
	expect(screen.queryAllByRole("img", { hidden: true })).toHaveLength(0);
});

test("logoFrameMetrics scales the frame's stroke and corner to its rendered size", () => {
	const frame = document.createElement("span");
	vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({
		height: 592,
	} as DOMRect);
	expect(logoFrameMetrics(frame)).toEqual({ stroke: 19.36, corner: 12.9 });
});

test("animated: each part masks itself with its own clip", () => {
	const { container } = render(() => <Logo animated />);
	const ids = [...container.querySelectorAll("clipPath")].map(
		(clip) => clip.id
	);
	expect(ids).toHaveLength(2);
	expect(new Set(ids).size).toBe(2);
	for (const id of ids) {
		expect(
			container.querySelector(`[clip-path="url(#${id})"]`)
		).not.toBeNull();
	}
});
