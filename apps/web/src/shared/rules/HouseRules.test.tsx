// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import { HouseRules } from "./HouseRules.tsx";
import { RULES } from "./rulesContent.ts";

afterEach(cleanup);

test("renders every section heading and one card per rule", () => {
	render(() => <HouseRules query="" />);
	for (const s of RULES) {
		expect(
			screen.getByRole("heading", { name: s.heading })
		).toBeInTheDocument();
	}
	const total = RULES.reduce((n, s) => n + s.rules.length, 0);
	expect(screen.getAllByRole("listitem")).toHaveLength(total);
});

test("renders bold segments as <strong>", () => {
	render(() => <HouseRules query="" />);
	expect(
		screen.getByText("Label your food").closest("strong")
	).not.toBeNull();
});

test("a query narrows to matching cards and marks the match", () => {
	const { container } = render(() => <HouseRules query="dishwasher" />);
	expect(screen.getAllByRole("listitem")).toHaveLength(1);
	expect(
		screen.getByRole("heading", { name: "Kitchen" })
	).toBeInTheDocument();
	expect(screen.queryByRole("heading", { name: "Safety" })).toBeNull();
	expect(container.querySelector("mark")).toHaveTextContent(/^dishwasher$/i);
});

test("a query hitting a bold segment marks it inside the <strong>", () => {
	const { container } = render(() => <HouseRules query="label your" />);
	const mark = container.querySelector("mark");
	expect(mark).toHaveTextContent(/^label your$/i);
	expect(mark?.closest("strong")).not.toBeNull();
});

test("no match shows the empty state with the query", () => {
	render(() => <HouseRules query="  trampoline " />);
	expect(screen.getByText('No rules match "trampoline"')).toBeInTheDocument();
	expect(screen.queryAllByRole("listitem")).toHaveLength(0);
});
