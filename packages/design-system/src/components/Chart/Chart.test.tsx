import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { Chart } from "./Chart.tsx";
import { maxOf, niceScale, stackRows } from "./scale.ts";

const data = [
	{ month: "Jan", a: 2, b: 3 },
	{ month: "Feb", a: 4, b: 1 },
];

describe("niceScale", () => {
	it("rounds the top of the axis up to a readable step", () => {
		expect(niceScale(37).max).toBe(40);
		expect(niceScale(7).max).toBe(8);
	});

	it("gives an all-zero series an axis rather than a division by zero", () => {
		expect(niceScale(0)).toEqual({ max: 1, ticks: [0, 1] });
	});

	it("keeps ticks exact on a fractional step", () => {
		// Accumulating 2.5 repeatedly drifts; the ticks must stay round.
		const { ticks } = niceScale(9);
		expect(ticks).toEqual([0, 2.5, 5, 7.5, 10]);
	});
});

describe("stackRows", () => {
	it("leaves an unstacked series sitting on zero", () => {
		const rows = stackRows(data, [{ key: "a" }, { key: "b" }]);
		expect(rows[0]).toEqual([
			{ base: 0, top: 2 },
			{ base: 0, top: 3 },
		]);
	});

	it("stacks series that share a stack id, in declaration order", () => {
		const rows = stackRows(data, [
			{ key: "a", stack: "s" },
			{ key: "b", stack: "s" },
		]);
		expect(rows[0]).toEqual([
			{ base: 0, top: 2 },
			{ base: 2, top: 5 },
		]);
	});

	it("reads a missing or non-numeric cell as zero", () => {
		const rows = stackRows([{ month: "Jan", a: "n/a" }], [{ key: "a" }]);
		expect(rows[0]?.[0]).toEqual({ base: 0, top: 0 });
	});

	it("scales to the stacked total, not the largest single value", () => {
		const rows = stackRows(data, [
			{ key: "a", stack: "s" },
			{ key: "b", stack: "s" },
		]);
		expect(maxOf(rows)).toBe(5);
	});
});

describe("Chart", () => {
	it("names the plot for screen readers", () => {
		render(() => (
			<Chart
				data={data}
				xKey="month"
				series={[{ key: "a" }]}
				label="Orders"
			/>
		));
		expect(screen.getByRole("img", { name: "Orders" })).toBeInTheDocument();
	});

	it("mirrors every value in a table, so identity never rests on colour", () => {
		render(() => (
			<Chart
				data={data}
				xKey="month"
				series={[
					{ key: "a", label: "Apples" },
					{ key: "b", label: "Pears" },
				]}
				label="Fruit"
			/>
		));
		const table = screen.getByRole("table", { name: "Fruit" });
		expect(table).toHaveTextContent("Apples");
		expect(table).toHaveTextContent("Pears");
		// Both rows, both series.
		expect(screen.getAllByRole("row")).toHaveLength(3);
	});

	it("applies the caller's formatter to the accessible values", () => {
		render(() => (
			<Chart
				data={data}
				xKey="month"
				series={[{ key: "a" }]}
				label="Orders"
				format={(value) => `${String(value)} units`}
			/>
		));
		expect(screen.getByRole("table")).toHaveTextContent("2 units");
	});

	it("shows a Chart.Empty child instead of an axis with nothing on it", () => {
		render(() => (
			<Chart
				data={[]}
				xKey="month"
				series={[{ key: "a" }]}
				label="Orders"
			>
				<Chart.Empty>
					<button type="button">Add the first</button>
				</Chart.Empty>
			</Chart>
		));
		expect(
			screen.getByRole("button", { name: "Add the first" })
		).toBeInTheDocument();
		expect(screen.queryByText("Nothing to show yet.")).toBeNull();
		expect(screen.queryByRole("img")).not.toBeInTheDocument();
	});

	it("falls back to a default empty message without a Chart.Empty", () => {
		render(() => (
			<Chart
				data={[]}
				xKey="month"
				series={[{ key: "a" }]}
				label="Orders"
			/>
		));
		expect(screen.getByText("Nothing to show yet.")).toBeInTheDocument();
	});

	it("keeps Chart.Empty hidden while there is data", () => {
		render(() => (
			<Chart
				data={data}
				xKey="month"
				series={[{ key: "a" }]}
				label="Orders"
			>
				<Chart.Empty>none</Chart.Empty>
			</Chart>
		));
		expect(screen.queryByText("none")).toBeNull();
		expect(screen.getByRole("img")).toBeInTheDocument();
	});

	it("draws a legend for two series and none for one", () => {
		const { unmount } = render(() => (
			<Chart
				data={data}
				xKey="month"
				series={[{ key: "a" }, { key: "b" }]}
				label="Fruit"
			/>
		));
		expect(screen.getByRole("list")).toBeInTheDocument();
		unmount();
		render(() => (
			<Chart
				data={data}
				xKey="month"
				series={[{ key: "a" }]}
				label="Fruit"
			/>
		));
		expect(screen.queryByRole("list")).not.toBeInTheDocument();
	});
});
