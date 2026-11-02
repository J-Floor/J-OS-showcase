// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import { HistoryTimeline } from "./HistoryTimeline.tsx";

afterEach(cleanup);

test("says there is no history yet once an empty history has loaded", () => {
	render(() => <HistoryTimeline entries={[]} />);
	expect(screen.getByText("No history yet")).toBeInTheDocument();
});

test("shows a skeleton, not the empty state, while the history loads", () => {
	render(() => <HistoryTimeline entries={undefined} />);
	expect(screen.queryByText("No history yet")).toBeNull();
});
