// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import { OccupancyGauge } from "./OccupancyGauge.tsx";

afterEach(cleanup);

test("renders two rows of three person icons and a left fill width", () => {
	const { container } = render(() => <OccupancyGauge fill={0.5} />);
	// 3 base + 3 fill = 6 person ligatures.
	expect(screen.getAllByText("person")).toHaveLength(6);
	const fill = container.querySelector<HTMLElement>("[data-fill-layer]");
	expect(fill?.style.width).toBe("50%");
});
