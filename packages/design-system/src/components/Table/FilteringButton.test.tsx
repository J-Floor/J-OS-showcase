import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";

import { firstValueField } from "./FilteringButton.tsx";
import { Table } from "./Table.tsx";
import type { JfColumnDef } from "./types.ts";

// jsdom workarounds for ark/zag (Popover/Tooltip).
if (!(Element.prototype as { scrollTo?: unknown }).scrollTo) {
	Element.prototype.scrollTo = () => {};
}
if (!(Element.prototype as { hasPointerCapture?: unknown }).hasPointerCapture) {
	Element.prototype.hasPointerCapture = () => false;
}
if (!("ResizeObserver" in globalThis)) {
	(globalThis as Record<string, unknown>).ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

const columns = [
	{ accessorKey: "name", header: "Name", dataType: "string" },
] as const;

test("text filter narrows rows", async () => {
	render(() => (
		<Table.Root
			columns={columns as never}
			data={[{ name: "Alpha" }, { name: "Beta" }]}
		/>
	));
	fireEvent.click(screen.getByLabelText("Filter Name"));
	const input = await screen.findByRole("textbox");
	fireEvent.input(input, { target: { value: "Alp" } });
	await waitFor(() => {
		expect(screen.queryByText("Beta")).not.toBeInTheDocument();
	});
	expect(screen.getByText("Alpha")).toBeInTheDocument();
});

test("clearing the text filter removes it instead of leaving it active", async () => {
	render(() => (
		<Table.Root
			columns={columns as never}
			data={[{ name: "Alpha" }, { name: "Beta" }]}
		/>
	));
	const trigger = screen.getByLabelText("Filter Name");
	fireEvent.click(trigger);
	const input = await screen.findByRole("textbox");
	fireEvent.input(input, { target: { value: "Alp" } });
	await waitFor(() => {
		expect(trigger).toHaveAttribute("data-active", "true");
	});
	fireEvent.input(input, { target: { value: "" } });
	await waitFor(() => {
		expect(trigger).not.toHaveAttribute("data-active");
	});
	expect(screen.getByText("Beta")).toBeInTheDocument();
});

type Scored = { name: string; score: number };
const scored: JfColumnDef<Scored>[] = [
	{ accessorKey: "name", header: "Name", dataType: "string" },
	{ accessorKey: "score", header: "Score", dataType: "number" },
];
const scores: Scored[] = [
	{ name: "Low", score: 1 },
	{ name: "High", score: 5 },
];

test("an empty number range filters nothing and is not active", () => {
	render(() => (
		<Table.Root
			columns={scored}
			data={scores}
			initialColumnFilters={[
				{
					id: "score",
					value: { mode: "range", from: undefined, to: undefined },
				},
			]}
		/>
	));
	expect(screen.getByLabelText("Filter Score")).not.toHaveAttribute(
		"data-active"
	);
	expect(screen.getByText("Low")).toBeInTheDocument();
	expect(screen.getByText("High")).toBeInTheDocument();
});

test("a number range with one bound filters and is active", () => {
	render(() => (
		<Table.Root
			columns={scored}
			data={scores}
			initialColumnFilters={[
				{
					id: "score",
					value: { mode: "range", from: "2", to: undefined },
				},
			]}
		/>
	));
	expect(screen.getByLabelText("Filter Score")).toHaveAttribute(
		"data-active",
		"true"
	);
	expect(screen.queryByText("Low")).not.toBeInTheDocument();
	expect(screen.getByText("High")).toBeInTheDocument();
});

type Logged = { who: string; op: string; ok: boolean };
const logged: JfColumnDef<Logged>[] = [
	{ accessorKey: "who", header: "Who", dataType: "string" },
	{
		accessorKey: "op",
		header: "Operation",
		dataType: "enum",
		enumOptions: [
			{ value: ["grant", "revoke"], label: "Access" },
			{ value: "unlock", label: "Unlock" },
		],
	},
	{ accessorKey: "ok", header: "Ok", dataType: "boolean" },
];
const log: Logged[] = [
	{ who: "Gail", op: "grant", ok: true },
	{ who: "Rob", op: "revoke", ok: false },
	{ who: "Uma", op: "unlock", ok: true },
];

test("an enum option covering several values filters on all of them", async () => {
	render(() => <Table.Root columns={logged} data={log} />);
	fireEvent.click(screen.getByLabelText("Filter Operation"));
	fireEvent.click(await screen.findByRole("checkbox", { name: "Unlock" }));
	await waitFor(() => {
		expect(screen.queryByText("Uma")).not.toBeInTheDocument();
	});
	expect(screen.getByText("Gail")).toBeInTheDocument();
	expect(screen.getByText("Rob")).toBeInTheDocument();
});

test("a boolean filter keeps the rows with that value", () => {
	render(() => (
		<Table.Root
			columns={logged}
			data={log}
			initialColumnFilters={[{ id: "ok", value: false }]}
		/>
	));
	expect(screen.getByText("Rob")).toBeInTheDocument();
	expect(screen.queryByText("Gail")).not.toBeInTheDocument();
	expect(screen.getByLabelText("Filter Ok")).toHaveAttribute(
		"data-active",
		"true"
	);
});

test("switching a number filter to range carries the value to its upper bound", async () => {
	render(() => (
		<Table.Root
			columns={scored}
			data={scores}
			initialColumnFilters={[
				{ id: "score", value: { mode: "exact", value: "5" } },
			]}
		/>
	));
	fireEvent.click(screen.getByLabelText("Filter Score"));
	fireEvent.click(await screen.findByText("Range"));
	expect(await screen.findByRole("spinbutton", { name: "Max" })).toHaveValue(
		"5"
	);
	expect(screen.getByRole("spinbutton", { name: "Min" })).toHaveValue("");
	expect(screen.getByText("Low")).toBeInTheDocument();
	expect(screen.queryByText("High")).toBeInTheDocument();
});

type Dated = { name: string; at: number; time: string };
const datedColumns: JfColumnDef<Dated>[] = [
	{ accessorKey: "name", header: "Name", dataType: "string" },
	{ accessorKey: "at", header: "At", dataType: "date" },
	{ accessorKey: "time", header: "Time", dataType: "time" },
];
const dated: Dated[] = [
	{ name: "Early", at: new Date(2026, 9, 1, 12).getTime(), time: "08:00" },
	{ name: "Late", at: new Date(2026, 9, 9, 12).getTime(), time: "18:00" },
];

test("a date range filters by local day and shows its bounds", async () => {
	render(() => (
		<Table.Root
			columns={datedColumns}
			data={dated}
			initialColumnFilters={[
				{
					id: "at",
					value: { mode: "range", from: "2026-10-05", to: undefined },
				},
			]}
		/>
	));
	expect(screen.queryByText("Early")).not.toBeInTheDocument();
	expect(screen.getByText("Late")).toBeInTheDocument();
	const trigger = screen.getByLabelText("Filter At");
	expect(trigger).toHaveAttribute("data-active", "true");
	fireEvent.click(trigger);
	expect(await screen.findByText("From")).toBeInTheDocument();
	expect(screen.getByText("To")).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Reset" }));
	await waitFor(() => {
		expect(screen.getByText("Early")).toBeInTheDocument();
	});
	expect(trigger).not.toHaveAttribute("data-active");
});

test("a time range filters inclusively and an open bound passes", () => {
	render(() => (
		<Table.Root
			columns={datedColumns}
			data={dated}
			initialColumnFilters={[
				{
					id: "time",
					value: { mode: "range", from: undefined, to: "08:00" },
				},
			]}
		/>
	));
	expect(screen.getByText("Early")).toBeInTheDocument();
	expect(screen.queryByText("Late")).not.toBeInTheDocument();
	expect(screen.getByLabelText("Filter Time")).toHaveAttribute(
		"data-active",
		"true"
	);
});

test("deselecting every enum option hides every row", async () => {
	render(() => <Table.Root columns={logged} data={log} />);
	const trigger = screen.getByLabelText("Filter Operation");
	fireEvent.click(trigger);
	fireEvent.click(await screen.findByRole("checkbox", { name: "Unlock" }));
	fireEvent.click(screen.getByRole("checkbox", { name: "Access" }));
	expect(await screen.findByText("No results.")).toBeInTheDocument();
	expect(screen.queryByText("Uma")).not.toBeInTheDocument();
	expect(trigger).toHaveAttribute("data-active", "true");
});

test("the popover focuses the first value input, past the mode toggle", () => {
	const root = document.createElement("div");
	root.innerHTML = `
		<div role="radiogroup"><input type="radio" /><input type="radio" /></div>
		<input data-value-field />
		<button type="button">Reset</button>`;
	expect(firstValueField(root)).toBe(
		root.querySelector("[data-value-field]")
	);
	expect(firstValueField(undefined)).toBeNull();
});
