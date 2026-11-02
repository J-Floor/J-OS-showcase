import { render, screen } from "@solidjs/testing-library";

import { ProgressBar } from "./ProgressBar.tsx";

test("exposes value, max and name as a progressbar", () => {
	render(() => <ProgressBar value={3} max={8} label="Downloading" />);
	const bar = screen.getByRole("progressbar", { name: "Downloading" });
	expect(bar).toHaveAttribute("aria-valuenow", "3");
	expect(bar).toHaveAttribute("aria-valuemax", "8");
});

test("a max of 0 shows a full bar", () => {
	render(() => <ProgressBar value={0} max={0} label="Downloading" />);
	const bar = screen.getByRole("progressbar", { name: "Downloading" });
	expect(bar).toHaveAttribute("aria-valuenow", "1");
	expect(bar).toHaveAttribute("aria-valuemax", "1");
});

test("a value above max is clamped to max", () => {
	render(() => <ProgressBar value={12} max={8} label="Downloading" />);
	const bar = screen.getByRole("progressbar", { name: "Downloading" });
	expect(bar).toHaveAttribute("aria-valuenow", "8");
});
