// @vitest-environment jsdom
import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { FirstMonths } from "./FirstMonths.tsx";

describe("FirstMonths", () => {
	it("renders the stats and the photo caption", async () => {
		render(() => <FirstMonths />);

		// IntersectionObserver is unavailable in jsdom, so StatNumber falls
		// back to rendering the final counted-up value immediately.
		expect(await screen.findByText("115+")).toBeTruthy();
		expect(screen.getByText("55+")).toBeTruthy();
		expect(screen.getByText("27M+")).toBeTruthy();
		expect(screen.getByText("The original floor J (2025)")).toBeTruthy();
	});
});
