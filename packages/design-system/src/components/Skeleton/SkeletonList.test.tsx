import { render, screen } from "@solidjs/testing-library";
import { expect, test } from "vitest";

import { SkeletonList } from "./SkeletonList.tsx";

test("renders three bars by default as a labelled status", () => {
	render(() => <SkeletonList />);
	const list = screen.getByRole("status", { name: "Loading" });
	expect(list.querySelectorAll("[data-width]")).toHaveLength(3);
	expect(list).toHaveAttribute("data-skeleton-list");
});

test("renders the requested number of rows, cycling widths", () => {
	render(() => <SkeletonList rows={5} />);
	const widths = Array.from(
		screen.getByRole("status").querySelectorAll("[data-width]")
	).map((el) => el.getAttribute("data-width"));
	expect(widths).toEqual(["long", "medium", "short", "long", "medium"]);
});
