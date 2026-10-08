// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import { afterEach, expect, test } from "vitest";

import type { ApplicationRow } from "./applicationColumns.tsx";
import { guestColumns } from "./guestColumns.tsx";
import { memberColumns } from "./memberColumns.tsx";
import { ventureColumns } from "./ventureColumns.tsx";

afterEach(cleanup);

type Link = { label?: string; url: string };

/** Render the Links column's cell for a row carrying `links`. The column defs
 *  are plain data, so the cell can be exercised without mounting the table (and
 *  without the Convex client the neighbouring editable cells need). */
function renderLinks(links: Link[]): void {
	const column = ventureColumns<ApplicationRow>().find(
		(c) => c.id === "links"
	);
	if (!column?.cell || typeof column.cell !== "function") {
		throw new Error("links column has no cell renderer");
	}
	const cell = column.cell;
	const info = {
		row: { original: { venture: { links } } as unknown as ApplicationRow },
	};
	render(() => cell(info as never) as JSX.Element);
}

test("shows the first link only, and counts the rest", () => {
	renderLinks([
		{ label: "GitHub", url: "https://github.com/acme" },
		{ label: "Site", url: "https://acme.com" },
		{ label: "Deck", url: "https://acme.com/deck" },
	]);

	// One anchor, not three. Stacking every link is what made a row several
	// times the height of its neighbours — and a table row is as tall as its
	// tallest cell, so one such applicant stretched the whole row with it.
	expect(screen.getAllByRole("link")).toHaveLength(1);
	expect(screen.getByRole("link")).toHaveTextContent("GitHub");
	expect(screen.queryByText("Site")).not.toBeInTheDocument();
	// The count is what says there is more to see in the drawer.
	expect(screen.getByText("+2")).toBeInTheDocument();
});

test("shows no count when the applicant gave exactly one link", () => {
	renderLinks([{ label: "GitHub", url: "https://github.com/acme" }]);
	expect(screen.getAllByRole("link")).toHaveLength(1);
	// "+0" would be noise on the majority of rows.
	expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
});

test("a flagged link renders as text with a warning, never as an anchor", () => {
	renderLinks([
		{ label: "", url: "https://evil.example/", threat: "MALWARE" } as Link,
	]);
	expect(screen.queryByRole("link")).not.toBeInTheDocument();
	expect(screen.getByText(/https:\/\/evil\.example\//)).toBeInTheDocument();
});

test("an unflagged link still renders as an anchor", () => {
	renderLinks([{ label: "", url: "https://good.example/" }]);
	expect(screen.getByRole("link")).toHaveAttribute(
		"href",
		"https://good.example/"
	);
});

test("renders nothing when there are no links", () => {
	renderLinks([]);
	expect(screen.queryByRole("link")).not.toBeInTheDocument();
	expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
});

test("falls back to the URL when a link has no label", () => {
	renderLinks([{ url: "https://acme.com/very/long/path" }]);
	expect(screen.getByRole("link")).toHaveTextContent(
		"https://acme.com/very/long/path"
	);
});

/**
 * The venture columns exist because they used to live on the Applications tab
 * only: the moment somebody was approved, the board could no longer scan for
 * who was building what, or read back why anyone joined, without opening a
 * drawer per row. They are one shared definition now — which is also what keeps
 * the clamp and the one-link treatment identical, and a missing clamp is not
 * cosmetic: a table row is as tall as its tallest cell.
 */
test("members and guests carry the same venture columns as applications", () => {
	const wanted = [
		"description",
		"pastBuilt",
		"whyJoin",
		"productStage",
		"fundingStage",
		"teamSize",
		"referral",
		"links",
		"vertical",
	];
	const memberIds = memberColumns().map((c) => c.id);
	const guestIds = guestColumns([]).map((c) => c.id);
	for (const id of wanted) {
		expect(memberIds).toContain(id);
		expect(guestIds).toContain(id);
	}
});

test("hosted-by filters on an enum of the board, not free text", () => {
	// Free text meant filtering to a host required typing their name exactly,
	// and a surname returned nothing.
	const column = guestColumns([{ value: "b1", label: "Sara" }]).find(
		(c) => c.id === "hostedById"
	);
	expect(column?.dataType).toBe("enum");
	expect(column?.enumOptions).toEqual([{ value: "b1", label: "Sara" }]);
});
