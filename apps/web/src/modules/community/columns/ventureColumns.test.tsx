// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import { afterEach, expect, test } from "vitest";

import {
	FREE_TEXT_SIZE,
	SHORT_TEXT_SIZE,
} from "../../../shared/columnSizes.ts";
import { formatDate } from "../../../shared/time.ts";

import {
	applicationColumns,
	submissionDateText,
	type ApplicationRow,
} from "./applicationColumns.tsx";
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

test("time remaining is measured again on every push, as it reads the clock", () => {
	const column = guestColumns([]).find((c) => c.id === "timeRemaining");
	expect(column?.measureVolatile).toBe(true);
});

type SizedColumn = {
	id?: string;
	size?: unknown;
	measureText?: unknown;
	dataType?: unknown;
};

function byId(columns: readonly SizedColumn[], id: string): SizedColumn {
	const column = columns.find((c) => c.id === id);
	if (!column) throw new Error(`no ${id} column`);
	return column;
}

function measured(column: SizedColumn, row: unknown): string {
	if (typeof column.measureText !== "function")
		throw new Error(`${String(column.id)} must measure its text`);
	return (column.measureText as (row: unknown) => string)(row);
}

test("the venture columns leave the vertical to the default enum cell and free text to wrap", () => {
	const columns = ventureColumns<ApplicationRow>();
	const vertical = byId(columns, "vertical");
	expect(vertical.size).toBe("content");
	expect(vertical.dataType).toBe("enum");
	expect(vertical).not.toHaveProperty("cell");
	expect(vertical).not.toHaveProperty("measureText");
	for (const id of ["description", "pastBuilt", "whyJoin"]) {
		expect(byId(columns, id)).toMatchObject({
			size: FREE_TEXT_SIZE,
			measureText: false,
		});
	}
	for (const id of ["referral"]) {
		expect(byId(columns, id)).toMatchObject({
			size: SHORT_TEXT_SIZE,
			measureText: false,
		});
	}
	const teamSize = byId(columns, "teamSize");
	expect(measured(teamSize, { venture: { teamSize: 3 } })).toBe("3");
	expect(measured(teamSize, { venture: {} })).toBe("—");
	for (const columns of [
		applicationColumns(),
		memberColumns(),
		guestColumns([]),
	]) {
		expect(byId(columns, "ventureName")).toMatchObject({
			size: SHORT_TEXT_SIZE,
			measureText: false,
		});
	}
	const links = byId(columns, "links");
	expect(typeof links.size).toBe("number");
	expect(links.measureText).toBe(false);
});

test("member and guest dates measure the date they show", () => {
	const row = { _creationTime: Date.UTC(2026, 9, 8) };
	for (const columns of [memberColumns(), guestColumns([])]) {
		const joined = byId(columns, "joinedAt");
		expect(joined.size).toBe("content");
		expect(measured(joined, row)).toBe(formatDate(row._creationTime));
	}
	const remaining = byId(guestColumns([]), "timeRemaining");
	expect(remaining.size).toBe("content");
	expect(measured(remaining, { accessUntil: undefined })).toBe("—");
});

test("notes wrap in a weighted share, and the date fits its text", () => {
	const guests = guestColumns([]);
	expect(byId(guests, "notes")).toMatchObject({
		size: { min: 240, weight: 2 },
		measureText: false,
	});
	const applications = applicationColumns();
	expect(byId(applications, "notes")).toMatchObject({
		size: FREE_TEXT_SIZE,
		measureText: false,
	});
	expect(byId(applications, "score").size).toBe(124);
	const date = byId(applications, "createdAt");
	expect(date.size).toBe("content");
	const row = { submittedAt: Date.UTC(2026, 9, 1), _creationTime: 0 };
	expect(measured(date, row)).toBe(submissionDateText(row as ApplicationRow));
	expect(submissionDateText(row as ApplicationRow)).toBe(
		formatDate(row.submittedAt)
	);
	expect(
		applications.find(
			(c) => (c as { accessorKey?: string }).accessorKey === "email"
		)?.size
	).toBeUndefined();
});

test("the roster actions columns are display columns with fixed widths", () => {
	for (const columns of [
		memberColumns(),
		guestColumns([]),
		applicationColumns(),
	]) {
		const actions = byId(columns, "actions");
		expect(typeof actions.size).toBe("number");
		expect(actions).not.toHaveProperty("dataType");
		expect(actions).not.toHaveProperty("enableSorting");
		expect(actions).not.toHaveProperty("enableColumnFilter");
	}
});
