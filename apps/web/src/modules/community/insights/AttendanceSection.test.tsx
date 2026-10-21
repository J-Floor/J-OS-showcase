// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import { dayKey } from "../../../../convex/lib/occupancy/accrual.ts";
import type { AttendanceAnswer } from "../../../../convex/occupancy.ts";

if (!("ResizeObserver" in globalThis)) {
	(globalThis as Record<string, unknown>).ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

const [answer, setAnswer] = createSignal<AttendanceAnswer | undefined>();
const [error, setError] = createSignal<Error | undefined>();

vi.mock("../../../shared/data/useQuery.ts", () => ({
	useQuery: () => ({ data: answer, error }),
}));

import { AttendanceSection } from "./AttendanceSection.tsx";

afterEach(() => {
	cleanup();
	setAnswer(undefined);
	setError(undefined);
});

const CAPACITY = 40;
const PEAK = 12;
const HOURS_AS_MINUTES = 180;

function today(entries: number | undefined) {
	return {
		day: dayKey(Date.now()),
		peak: PEAK,
		peakAt: Date.now(),
		personMinutes: HOURS_AS_MINUTES,
		entries,
	};
}

function chooseMonths() {
	fireEvent.click(screen.getByRole("radio", { name: "12 months" }));
}

function tableRows(name: string): HTMLElement[] {
	const table = screen.getByRole("table", { name });
	return within(table).getAllByRole("row").slice(1);
}

test("renders nothing when the counter is not installed", () => {
	setAnswer({ enabled: false });
	const { container } = render(() => <AttendanceSection />);
	expect(container).toBeEmptyDOMElement();
});

test("renders nothing when the query fails", () => {
	setError(new Error("network"));
	const { container } = render(() => <AttendanceSection />);
	expect(container).toBeEmptyDOMElement();
});

test("renders nothing when a later read fails, even with an earlier answer", () => {
	setAnswer({ enabled: true, capacity: CAPACITY, days: [today(undefined)] });
	setError(new Error("network"));
	const { container } = render(() => <AttendanceSection />);
	expect(container).toBeEmptyDOMElement();
});

test("loading: heading and range switch show, values and charts are skeletons", () => {
	const { container } = render(() => <AttendanceSection />);
	expect(
		screen.getByRole("heading", { name: "Attendance" })
	).toBeInTheDocument();
	expect(screen.getByText("30 days")).toBeInTheDocument();
	const values = [...container.querySelectorAll("[data-metric-value]")];
	expect(values).toHaveLength(3);
	expect(
		values.every(
			(value) => value.querySelector("[aria-hidden='true']") !== null
		)
	).toBe(true);
	expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

test("daily data: both series, the busiest-day tile and the active-day tile", () => {
	setAnswer({ enabled: true, capacity: CAPACITY, days: [today(20)] });
	render(() => <AttendanceSection />);
	expect(screen.getByText("12 of 40")).toBeInTheDocument();
	expect(screen.getByText("30% of capacity")).toBeInTheDocument();
	expect(
		screen.getByText("Days with at least 5 people in at once.")
	).toBeInTheDocument();
	const table = screen.getByRole("table", {
		name: "People per day: most at once and walk-ins",
	});
	expect(table).toHaveTextContent("Most at once");
	expect(table).toHaveTextContent("Walk-ins");
	expect(
		screen.getByText(/everyone walks in at least once/)
	).toBeInTheDocument();
	expect(tableRows("People per day: most at once and walk-ins")).toHaveLength(
		30
	);
});

test("count-only data: no walk-ins series, the short hint", () => {
	setAnswer({ enabled: true, capacity: CAPACITY, days: [today(undefined)] });
	render(() => <AttendanceSection />);
	const table = screen.getByRole("table", {
		name: "People per day: most at once",
	});
	expect(table).toHaveTextContent("Most at once");
	expect(table).not.toHaveTextContent("Walk-ins");
	expect(
		screen.getByText("The most people in the space at the same time.")
	).toBeInTheDocument();
});

test("no one counted this month: dash and the empty line, usual time hidden", () => {
	setAnswer({ enabled: true, capacity: CAPACITY, days: [] });
	render(() => <AttendanceSection />);
	expect(screen.getByText("—")).toBeInTheDocument();
	expect(screen.getByText("Nobody in yet this month.")).toBeInTheDocument();
	expect(screen.queryByText("Usually busiest at")).not.toBeInTheDocument();
});

test("12 months switches the charts to one row per month", async () => {
	setAnswer({ enabled: true, capacity: CAPACITY, days: [today(20)] });
	render(() => <AttendanceSection />);
	chooseMonths();
	const name = "People per day: most at once and walk-ins";
	await waitFor(() => {
		expect(tableRows(name)).toHaveLength(12);
	});
	expect(
		screen.getByText(/Monthly bars are the average per open day\./)
	).toBeInTheDocument();
});

test("never calls people visits, members or unique", async () => {
	setAnswer({ enabled: true, capacity: CAPACITY, days: [today(20)] });
	const { container } = render(() => <AttendanceSection />);
	expect(container.textContent).not.toMatch(/visit|member|unique/i);
	chooseMonths();
	await waitFor(() => {
		expect(tableRows("Hours spent at J floor")).toHaveLength(12);
	});
	expect(container.textContent).not.toMatch(/visit|member|unique/i);
});
