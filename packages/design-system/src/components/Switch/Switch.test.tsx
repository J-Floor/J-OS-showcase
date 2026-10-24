import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { expectTypeOf } from "vitest";

import { TOOLTIP_OPEN_DELAY_MS } from "../Tooltip/Tooltip.tsx";

import { Switch, type SwitchProps } from "./Switch.tsx";

test("is a switch named by its label and described by its description", () => {
	render(() => <Switch label="Push" description="Off." />);
	const toggle = screen.getByRole("switch", { name: "Push" });
	expect(toggle).toHaveAccessibleDescription("Off.");
	expect(screen.getByText("Off.")).toBeInTheDocument();
});

test("has no description without one", () => {
	render(() => <Switch label="Push" />);
	expect(screen.getByRole("switch", { name: "Push" })).not.toHaveAttribute(
		"aria-describedby"
	);
});

test("has no description when the description is empty", () => {
	render(() => <Switch label="Push" description="" />);
	expect(screen.getByRole("switch", { name: "Push" })).not.toHaveAttribute(
		"aria-describedby"
	);
});

describe("disabled", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	test("a disabled switch shows its reason on hover", async () => {
		render(() => (
			<Switch label="Push" disabled disabledReason="Set up push first" />
		));
		const wrapper = document.querySelector<HTMLElement>(
			'[data-scope="tooltip"][data-part="trigger"]'
		);
		expect(wrapper).not.toBeNull();
		fireEvent.pointerMove(wrapper!);
		await vi.advanceTimersByTimeAsync(TOOLTIP_OPEN_DELAY_MS);
		expect(screen.getByText("Set up push first")).toBeInTheDocument();
	});

	test("disabled reaches the switch itself", () => {
		render(() => (
			<Switch label="Push" disabled shamefullyOmitDisabledReason />
		));
		expect(screen.getByRole("switch", { name: "Push" })).toBeDisabled();
	});

	test("disabled without a reason is a type error", () => {
		expectTypeOf<{
			label: string;
			disabled: true;
		}>().not.toExtend<SwitchProps>();
	});
});

test("a controlled switch whose owner keeps it off stays off after a click", async () => {
	let calls = 0;
	render(() => (
		<Switch
			label="Push"
			checked={false}
			onCheckedChange={() => {
				calls += 1;
			}}
		/>
	));
	const toggle = screen.getByRole("switch", { name: "Push" });
	fireEvent.click(toggle);
	await vi.waitFor(() => {
		expect(calls).toBe(1);
	});
	await vi.waitFor(() => {
		expect(toggle).not.toBeChecked();
	});
});

test("a controlled switch whose owner accepts the click ends on", async () => {
	const [checked, setChecked] = createSignal(false);
	render(() => (
		<Switch
			label="Push"
			checked={checked()}
			onCheckedChange={(details) => {
				setChecked(details.checked);
			}}
		/>
	));
	const toggle = screen.getByRole("switch", { name: "Push" });
	fireEvent.click(toggle);
	await vi.waitFor(() => {
		expect(toggle).toBeChecked();
	});
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(toggle).toBeChecked();
});
