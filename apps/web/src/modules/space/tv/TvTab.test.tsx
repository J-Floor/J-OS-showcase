// @vitest-environment happy-dom
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
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

// The real provider, with its drop handler kept so a test can fire a drop
// (happy-dom has no layout for a pointer drag to measure).
const dnd = vi.hoisted(() => ({
	onDragEnd: undefined as
		| ((event: {
				draggable: { id: string };
				droppable: { id: string } | null;
		  }) => void)
		| undefined,
}));

vi.mock("@thisbeyond/solid-dnd", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@thisbeyond/solid-dnd")>();
	return {
		...actual,
		DragDropProvider: (
			props: Parameters<typeof actual.DragDropProvider>[0]
		) => {
			// eslint-disable-next-line solid/reactivity -- a test double keeping the handler to call it
			dnd.onDragEnd = props.onDragEnd as typeof dnd.onDragEnd;
			return actual.DragDropProvider(props);
		},
	};
});

const SLIDES = [
	{
		_id: "welcome",
		title: "Welcome",
		kind: "html",
		durationSec: 15,
		enabled: true,
		fromEvent: false,
		eventName: undefined,
		isMissing: false,
	},
	{
		_id: "poster",
		title: "Poster",
		kind: "image",
		durationSec: 30,
		enabled: false,
		fromEvent: false,
		eventName: undefined,
		isMissing: false,
	},
];

beforeEach(() => {
	convexMock.mutate.mockClear();
	convexMock.set("tvContent:listConfigSlides", SLIDES);
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

function renderTab() {
	const history = createMemoryHistory();
	history.set({ value: "/space?tab=tv" });
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

test("lists the slides in the order the server gave them", () => {
	renderTab();
	const rows = screen.getAllByRole("listitem");
	const slideRows = rows.filter(
		(row) =>
			within(row).queryByText("HTML") ?? within(row).queryByText("Image")
	);
	expect(slideRows).toHaveLength(2);
	expect(within(slideRows[0]).getByText("Welcome")).toBeInTheDocument();
	expect(within(slideRows[1]).getByText("Poster")).toBeInTheDocument();
});

test("toggling a slide's switch updates that slide's enabled flag", async () => {
	renderTab();
	const [, posterSwitch] = screen.getAllByRole("switch");
	expect(posterSwitch).not.toBeChecked();
	fireEvent.click(posterSwitch);
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith(
			"tvContent:updateConfigSlide",
			{
				id: "poster",
				enabled: true,
			}
		);
	});
});

test("up and down move the slide, and the ends cannot move outward", async () => {
	renderTab();
	expect(
		screen.getByRole("button", { name: "Move Welcome up" })
	).toBeDisabled();
	expect(
		screen.getByRole("button", { name: "Move Poster down" })
	).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: "Move Poster up" }));
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith(
			"tvContent:moveConfigSlide",
			{
				id: "poster",
				direction: "up",
			}
		);
	});
	fireEvent.click(screen.getByRole("button", { name: "Move Welcome down" }));
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith(
			"tvContent:moveConfigSlide",
			{
				id: "welcome",
				direction: "down",
			}
		);
	});
});

test("delete asks first and removes the slide only once confirmed", async () => {
	renderTab();
	fireEvent.click(screen.getByRole("button", { name: "Delete Welcome" }));
	// Asked, not yet done.
	const confirm = await screen.findByRole("button", { name: "Delete" });
	expect(convexMock.mutate).not.toHaveBeenCalledWith(
		"tvContent:removeConfigSlide",
		expect.anything()
	);
	fireEvent.click(confirm);
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith(
			"tvContent:removeConfigSlide",
			{
				id: "welcome",
			}
		);
	});
});

test("cancelling the delete question keeps the slide", async () => {
	renderTab();
	fireEvent.click(screen.getByRole("button", { name: "Delete Welcome" }));
	fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
	await waitFor(() => {
		expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
	});
	expect(convexMock.mutate).not.toHaveBeenCalledWith(
		"tvContent:removeConfigSlide",
		expect.anything()
	);
});

test("choosing a transition saves it", async () => {
	renderTab();
	fireEvent.click(screen.getByRole("combobox", { name: /transition/i }));
	fireEvent.click(await screen.findByRole("option", { name: "Slide" }));
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith("tv:setTransition", {
			transition: "slide",
		});
	});
});

test("with no slides it says so and Preview is disabled", () => {
	convexMock.set("tvContent:listConfigSlides", []);
	renderTab();
	expect(screen.getByText("No slides yet")).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
});

test("Preview is enabled while at least one slide is shown", () => {
	renderTab();
	expect(screen.getByRole("button", { name: "Preview" })).toBeEnabled();
});

test("Preview stays disabled when every slide is switched off", () => {
	convexMock.set(
		"tvContent:listConfigSlides",
		SLIDES.map((slide) => ({ ...slide, enabled: false }))
	);
	renderTab();
	expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
});

function durationField(title: string): HTMLElement {
	return screen.getByRole("spinbutton", {
		name: `Seconds on screen for ${title}`,
	});
}

async function typeDuration(
	title: string,
	value: string
): Promise<HTMLElement> {
	const input = durationField(title);
	await waitFor(() => {
		input.focus();
		expect(input).toHaveFocus();
	});
	fireEvent.input(input, { target: { value } });
	await waitFor(() => {
		expect(input).toHaveValue(value);
	});
	return input;
}

test("a valid duration is saved when the field is left, and the field keeps it until the list shows it", async () => {
	renderTab();
	const input = await typeDuration("Welcome", "40");
	input.blur();
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith(
			"tvContent:updateConfigSlide",
			{
				id: "welcome",
				durationSec: 40,
			}
		);
	});
	// The list has not refetched: the old 15 must not flick back.
	expect(durationField("Welcome")).toHaveValue("40");
	convexMock.set(
		"tvContent:listConfigSlides",
		SLIDES.map((slide) =>
			slide._id === "welcome" ? { ...slide, durationSec: 40 } : slide
		)
	);
	await waitFor(() => {
		expect(durationField("Welcome")).toHaveValue("40");
	});
});

test("Enter saves a valid duration", async () => {
	renderTab();
	const input = await typeDuration("Welcome", "60");
	fireEvent.keyDown(input, { key: "Enter" });
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith(
			"tvContent:updateConfigSlide",
			{
				id: "welcome",
				durationSec: 60,
			}
		);
	});
});

test.each([
	["", "Enter the seconds"],
	["4", "whole number of seconds"],
	["301", "whole number of seconds"],
	["12.5", "whole number of seconds"],
])(
	"an invalid duration %j is explained and not saved",
	async (value, message) => {
		renderTab();
		const input = await typeDuration("Welcome", value);
		input.blur();
		expect(
			await screen.findByText(new RegExp(message))
		).toBeInTheDocument();
		expect(convexMock.mutate).not.toHaveBeenCalledWith(
			"tvContent:updateConfigSlide",
			expect.anything()
		);
		expect(input).toHaveValue(value);
	}
);

const EVENT_SLIDE = {
	_id: "event-abc",
	title: "event-abc",
	kind: "html",
	durationSec: 20,
	enabled: true,
	fromEvent: true,
	eventName: "Demo night",
	isMissing: false,
};

function withEventSlide(): void {
	convexMock.set("tvContent:listConfigSlides", [...SLIDES, EVENT_SLIDE]);
}

test("an event slide is labelled auto-generated, has a delay and moves, but cannot be edited, deleted or switched", () => {
	withEventSlide();
	renderTab();
	expect(screen.getByText("From event Demo night")).toBeInTheDocument();
	expect(screen.getAllByText("Auto-generated")).toHaveLength(1);
	expect(
		screen.queryByRole("button", { name: "Delete event-abc" })
	).toBeNull();
	expect(screen.queryByRole("button", { name: "Edit event-abc" })).toBeNull();
	expect(
		screen.getByRole("button", { name: "Move event-abc up" })
	).toBeEnabled();
	expect(
		screen.getByRole("button", { name: "Move event-abc down" })
	).toBeDisabled();
	expect(durationField("event-abc")).toHaveValue("20");
	// The switch is the own slides' only.
	expect(screen.getAllByRole("switch")).toHaveLength(SLIDES.length);
});

test("a manual slide is not labelled auto-generated", () => {
	renderTab();
	expect(screen.queryByText("Auto-generated")).toBeNull();
});

test("an event slide's delay is saved alone, with nothing else the server would refuse", async () => {
	withEventSlide();
	renderTab();
	const input = await typeDuration("event-abc", "45");
	input.blur();
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith(
			"tvContent:updateConfigSlide",
			{ id: "event-abc", durationSec: 45 }
		);
	});
});

test("the up button moves an event slide", async () => {
	withEventSlide();
	renderTab();
	fireEvent.click(screen.getByRole("button", { name: "Move event-abc up" }));
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith(
			"tvContent:moveConfigSlide",
			{ id: "event-abc", direction: "up" }
		);
	});
});

test("every row has a drag handle that leaves the row's own controls alone", () => {
	withEventSlide();
	renderTab();
	for (const title of ["Welcome", "Poster", "event-abc"]) {
		expect(
			screen.getByRole("button", { name: `Drag ${title} to reorder` })
		).toBeInTheDocument();
	}
});

test("pressing in a row's duration field or switch does not start a drag", () => {
	renderTab();
	const row = screen.getAllByRole("listitem")[0];
	for (const target of [
		durationField("Welcome"),
		within(row).getByRole("switch"),
	]) {
		fireEvent.pointerDown(target, { button: 0, clientX: 5, clientY: 5 });
		fireEvent.pointerMove(document, { clientX: 60, clientY: 60 });
		// A drag in progress marks the row; none started.
		expect(row.className).not.toMatch(/dragging/);
		fireEvent.pointerUp(document);
	}
});

test("pressing the grip and moving starts a drag of that row", () => {
	renderTab();
	const row = screen.getAllByRole("listitem")[0];
	const grip = screen.getByRole("button", {
		name: "Drag Welcome to reorder",
	});
	fireEvent.pointerDown(grip, { button: 0, clientX: 5, clientY: 5 });
	fireEvent.pointerMove(document, { clientX: 60, clientY: 60 });
	expect(row.className).toMatch(/dragging/);
	fireEvent.pointerUp(document);
});

test("a slide whose file is missing says so", () => {
	convexMock.set("tvContent:listConfigSlides", [
		{ ...SLIDES[0], isMissing: true },
	]);
	renderTab();
	expect(screen.getByText("File missing")).toBeInTheDocument();
});

test("mounts the pack actions and the config.xml editor", () => {
	renderTab();
	expect(
		screen.getByRole("button", { name: "Upload pack (.zip)" })
	).toBeInTheDocument();
	expect(
		screen.getByRole("textbox", { name: "config.xml" })
	).toBeInTheDocument();
});

test("while the legacy slides are being moved it says so and nothing can be edited", () => {
	convexMock.set("tvContent:listConfigSlides", []);
	convexMock.set("tvContent:getPackState", {
		xml: "<tv/>",
		version: 0,
		packVersion: null,
		packUrl: null,
		isAwaitingMigration: true,
	});
	renderTab();
	expect(screen.getByText("Moving the TV list")).toBeInTheDocument();
	expect(screen.queryByText("No slides yet")).not.toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Add slide" })).toBeDisabled();
	expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
	expect(
		screen.getByRole("button", { name: "Upload pack (.zip)" })
	).toBeDisabled();
	expect(screen.getByRole("textbox", { name: "config.xml" })).toBeDisabled();
});

function rowTitles(): string[] {
	return screen
		.getAllByRole("listitem")
		.flatMap((row) =>
			within(row).queryAllByText(/^(Welcome|Poster|event-abc)$/)
		)
		.map((node) => node.textContent);
}

test("dropping a row on another reorders at once and saves the new order", async () => {
	withEventSlide();
	renderTab();
	dnd.onDragEnd?.({
		draggable: { id: "event-abc" },
		droppable: { id: "welcome" },
	});
	await waitFor(() => {
		expect(rowTitles()).toEqual(["event-abc", "Welcome", "Poster"]);
	});
	expect(convexMock.mutate).toHaveBeenCalledWith(
		"tvContent:reorderConfigSlides",
		{ ids: ["event-abc", "welcome", "poster"] }
	);
});

test("a drop on nothing or on itself saves nothing", () => {
	renderTab();
	expect(dnd.onDragEnd).toBeDefined();
	dnd.onDragEnd?.({ draggable: { id: "welcome" }, droppable: null });
	dnd.onDragEnd?.({
		draggable: { id: "welcome" },
		droppable: { id: "welcome" },
	});
	expect(convexMock.mutate).not.toHaveBeenCalledWith(
		"tvContent:reorderConfigSlides",
		expect.anything()
	);
});

test("a refused reorder puts the rows back in the server's order", async () => {
	convexMock.mutate.mockRejectedValueOnce(new Error("refused"));
	renderTab();
	dnd.onDragEnd?.({
		draggable: { id: "poster" },
		droppable: { id: "welcome" },
	});
	await waitFor(() => {
		expect(rowTitles()).toEqual(["Welcome", "Poster"]);
	});
	expect(
		await screen.findByText("Could not update the TV. Try again.")
	).toBeInTheDocument();
});
