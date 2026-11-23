import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";

import { CountUp } from "./CountUp.tsx";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

it("counts once on entry, reaches the target, and keeps the accessible value stable", () => {
	let intersect!: (isVisible: boolean) => void;
	let tick!: FrameRequestCallback;
	vi.stubGlobal("matchMedia", () => ({
		matches: false,
		addEventListener() {},
		removeEventListener() {},
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
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		tick = callback;
		return 1;
	});
	vi.stubGlobal("cancelAnimationFrame", vi.fn());
	const view = render(() => <CountUp value={60} prefix="$" suffix="M" />);
	const number = view.getByRole("img", { name: "$60M" });
	expect(number.textContent).toBe("$60M");
	intersect(false);
	expect(number.textContent).toBe("$60M");
	intersect(true);
	expect(number.textContent).toBe("$0M");
	tick(performance.now() + 1200);
	expect(Number(number.textContent.replaceAll(/\D/g, ""))).toBeGreaterThan(0);
	expect(number.getAttribute("aria-label")).toBe("$60M");
	tick(performance.now() + 2400);
	expect(number.textContent).toBe("$60M");
	intersect(true);
	expect(number.textContent).toBe("$60M");
});

it("shows final values immediately for reduced motion", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: true }));
	const view = render(() => <CountUp value={150} prefix="" suffix="+" />);
	expect(view.getByRole("img", { name: "150+" }).textContent).toBe("150+");
});
