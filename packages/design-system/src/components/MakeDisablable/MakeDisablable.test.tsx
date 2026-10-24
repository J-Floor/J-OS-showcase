import { fireEvent, render, screen } from "@solidjs/testing-library";

import { TOOLTIP_OPEN_DELAY_MS } from "../Tooltip/Tooltip.tsx";

import { MakeDisablable } from "./MakeDisablable.tsx";

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

test("an enabled control is rendered as is, with no wrapper", () => {
	render(() => (
		<div data-testid="parent">
			<MakeDisablable>
				<button>Save</button>
			</MakeDisablable>
		</div>
	));
	expect(screen.getByRole("button").parentElement).toBe(
		screen.getByTestId("parent")
	);
});

test("a disabled control with a reason shows the reason on hover", async () => {
	render(() => (
		<MakeDisablable disabled disabledReason="Sign in first">
			<button>Save</button>
		</MakeDisablable>
	));
	const wrapper = screen.getByRole("button").parentElement!;
	expect(wrapper).toHaveAttribute("data-disabled");
	expect(wrapper).toHaveAttribute("tabindex", "0");
	fireEvent.pointerMove(wrapper);
	await vi.advanceTimersByTimeAsync(TOOLTIP_OPEN_DELAY_MS);
	expect(screen.getByText("Sign in first")).toBeInTheDocument();
});

test("a disabled control with no reason is dimmed without a tooltip", async () => {
	render(() => (
		<MakeDisablable disabled shamefullyOmitDisabledReason>
			<button>Save</button>
		</MakeDisablable>
	));
	const wrapper = screen.getByRole("button").parentElement!;
	expect(wrapper).toHaveAttribute("data-disabled");
	expect(wrapper).not.toHaveAttribute("tabindex");
	fireEvent.pointerMove(wrapper);
	await vi.advanceTimersByTimeAsync(TOOLTIP_OPEN_DELAY_MS);
	expect(
		document.querySelector('[data-scope="tooltip"][data-part="content"]')
	).toBeNull();
});

test("shamefullyOmitDisabledReason drops a reason that was passed anyway", () => {
	render(() => (
		<MakeDisablable
			disabled
			disabledReason="Sign in first"
			shamefullyOmitDisabledReason
		>
			<button>Save</button>
		</MakeDisablable>
	));
	expect(screen.getByRole("button").parentElement).not.toHaveAttribute(
		"tabindex"
	);
});

test("the reason tooltip takes the trigger id it is given", () => {
	render(() => (
		<MakeDisablable
			disabled
			disabledReason="Sign in first"
			disabledReasonTooltipId="shared-trigger"
		>
			<button>Save</button>
		</MakeDisablable>
	));
	expect(screen.getByRole("button").parentElement).toHaveAttribute(
		"id",
		"shared-trigger"
	);
});
