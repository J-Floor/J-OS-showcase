// @vitest-environment happy-dom
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ConfirmProvider } from "../../../shared/confirm.tsx";

import { TvTab } from "./TvTab.tsx";

// `convex-solidjs` is stubbed: queries answer from signals the test sets by
// function name, mutations record their (name, args). `api` references are
// proxies that are not `===`-stable, so everything routes by function name.
const convexMock = vi.hoisted(() => ({
	set: vi.fn<(name: string, value: unknown) => void>(),
	mutate: vi.fn<(name: string, args: unknown) => Promise<unknown>>(() =>
		Promise.resolve(null)
	),
}));

vi.mock("convex-solidjs", async () => {
	const { getFunctionName } = await import("convex/server");
	const { createSignal } = await import("solid-js");
	const signals = new Map<string, ReturnType<typeof createSignal<unknown>>>();
	function signalFor(name: string) {
		const existing = signals.get(name);
		if (existing) return existing;
		const created = createSignal<unknown>(undefined);
		signals.set(name, created);
		return created;
	}
	convexMock.set.mockImplementation((name, value) => {
		signalFor(name)[1](() => value);
	});
	function runner(reference: Parameters<typeof getFunctionName>[0]) {
		return {
			mutateAsync: (args: unknown) =>
				convexMock.mutate(getFunctionName(reference), args),
		};
	}
	return {
		useQuery: (reference: Parameters<typeof getFunctionName>[0]) => ({
			data: signalFor(getFunctionName(reference))[0],
			error: () => {},
			isLoading: () => false,
		}),
		useMutation: runner,
		useAction: runner,
	};
});

const EVENT_ID = "event-abc";

function row(id: string, isFromEvent: boolean) {
	return {
		_id: id,
		title: id,
		kind: "html",
		durationSec: 20,
		enabled: true,
		fromEvent: isFromEvent,
		eventName: isFromEvent ? "Demo night" : undefined,
		isMissing: false,
	};
}

beforeEach(() => {
	convexMock.set("tvContent:listConfigSlides", [
		row("welcome", false),
		row(EVENT_ID, true),
	]);
	convexMock.set("tvContent:getConfigSlide", undefined);
	convexMock.set("tv:getConfig", { transition: "fade", version: 1 });
	convexMock.set("tv:listDevices", []);
	convexMock.set("tvContent:getPackState", {
		xml: "<tv/>",
		version: 1,
		packVersion: 1,
		packUrl: null,
		isAwaitingMigration: false,
	});
});

afterEach(cleanup);

function renderAt(slideId: string) {
	const history = createMemoryHistory();
	history.set({ value: `/space?tab=tv&slide=${slideId}` });
	return render(() => (
		<MemoryRouter history={history}>
			<Route
				path="*"
				component={() => (
					<ConfirmProvider>
						<TvTab />
					</ConfirmProvider>
				)}
			/>
		</MemoryRouter>
	));
}

test("a ?slide link to a slide of the TV's own opens the edit sheet", async () => {
	convexMock.set("tvContent:getConfigSlide", {
		...row("welcome", false),
		url: null,
	});
	renderAt("welcome");
	expect(await screen.findByLabelText("Slide file")).toBeInTheDocument();
});

test("a ?slide link to an event's slide does not open an editable sheet", async () => {
	// Its record IS served: only the tab's own filter can keep the sheet shut.
	convexMock.set("tvContent:getConfigSlide", {
		...row(EVENT_ID, true),
		url: null,
	});
	renderAt(EVENT_ID);
	await new Promise((resolve) => {
		setTimeout(resolve, 50);
	});
	await waitFor(() => {
		expect(screen.queryByLabelText("Slide file")).toBeNull();
	});
	expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
});

test("a cold ?slide link to an event's slide, opened before the list loads, closes once it has", async () => {
	convexMock.set("tvContent:listConfigSlides", undefined);
	convexMock.set("tvContent:getConfigSlide", {
		...row(EVENT_ID, true),
		url: null,
	});
	renderAt(EVENT_ID);
	// Opened optimistically: the list that could refuse it is not here yet.
	expect(await screen.findByRole("dialog")).toBeInTheDocument();
	convexMock.set("tvContent:listConfigSlides", [
		row("welcome", false),
		row(EVENT_ID, true),
	]);
	await waitFor(() => {
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});
