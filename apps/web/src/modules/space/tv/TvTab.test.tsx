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
	return {
		useQuery: (reference: Parameters<typeof getFunctionName>[0]) => ({
			data: signalFor(getFunctionName(reference))[0],
			error: () => {},
			isLoading: () => false,
		}),
		useMutation: (reference: Parameters<typeof getFunctionName>[0]) => ({
			mutateAsync: (args: unknown) =>
				convexMock.mutate(getFunctionName(reference), args),
		}),
	};
});

const SLIDES = [
	{
		_id: "slide-a",
		title: "Welcome",
		kind: "html",
		durationSec: 15,
		position: 0,
		enabled: true,
		hasFile: false,
		htmlLength: 20,
	},
	{
		_id: "slide-b",
		title: "Poster",
		kind: "image",
		durationSec: 30,
		position: 1,
		enabled: false,
		hasFile: true,
	},
];

beforeEach(() => {
	convexMock.mutate.mockClear();
	convexMock.set("tv:listSlides", SLIDES);
	convexMock.set("tv:getConfig", { transition: "fade", version: 1 });
	convexMock.set("tv:listDevices", []);
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
		expect(convexMock.mutate).toHaveBeenCalledWith("tv:updateSlide", {
			id: "slide-b",
			enabled: true,
		});
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
		expect(convexMock.mutate).toHaveBeenCalledWith("tv:moveSlide", {
			id: "slide-b",
			direction: "up",
		});
	});
	fireEvent.click(screen.getByRole("button", { name: "Move Welcome down" }));
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith("tv:moveSlide", {
			id: "slide-a",
			direction: "down",
		});
	});
});

test("delete asks first and removes the slide only once confirmed", async () => {
	renderTab();
	fireEvent.click(screen.getByRole("button", { name: "Delete Welcome" }));
	// Asked, not yet done.
	const confirm = await screen.findByRole("button", { name: "Delete" });
	expect(convexMock.mutate).not.toHaveBeenCalledWith(
		"tv:deleteSlide",
		expect.anything()
	);
	fireEvent.click(confirm);
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith("tv:deleteSlide", {
			id: "slide-a",
		});
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
		"tv:deleteSlide",
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
	convexMock.set("tv:listSlides", []);
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
		"tv:listSlides",
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

/** The number input's machine answers on a later tick, so each step waits. */
function settle(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 20);
	});
}

async function typeDuration(
	title: string,
	value: string
): Promise<HTMLElement> {
	const input = durationField(title);
	input.focus();
	await settle();
	fireEvent.input(input, { target: { value } });
	await settle();
	return input;
}

test("a valid duration is saved when the field is left, and the field keeps it until the list shows it", async () => {
	renderTab();
	const input = await typeDuration("Welcome", "40");
	input.blur();
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith("tv:updateSlide", {
			id: "slide-a",
			durationSec: 40,
		});
	});
	// The list has not refetched: the old 15 must not flick back.
	expect(durationField("Welcome")).toHaveValue("40");
	convexMock.set(
		"tv:listSlides",
		SLIDES.map((slide) =>
			slide._id === "slide-a" ? { ...slide, durationSec: 40 } : slide
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
		expect(convexMock.mutate).toHaveBeenCalledWith("tv:updateSlide", {
			id: "slide-a",
			durationSec: 60,
		});
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
		await settle();
		expect(screen.getByText(new RegExp(message))).toBeInTheDocument();
		expect(convexMock.mutate).not.toHaveBeenCalledWith(
			"tv:updateSlide",
			expect.anything()
		);
		expect(input).toHaveValue(value);
	}
);
