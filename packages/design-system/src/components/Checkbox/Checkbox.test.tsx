import { fireEvent, render, screen } from "@solidjs/testing-library";
import { expectTypeOf } from "vitest";

import { TOOLTIP_OPEN_DELAY_MS } from "../Tooltip/Tooltip.tsx";

import { Checkbox, type CheckboxProps } from "./Checkbox.tsx";

test("disabled without a reason is a type error, as on every field", () => {
	expectTypeOf<{ disabled: true }>().not.toExtend<CheckboxProps>();
	expectTypeOf<{
		disabled: true;
		disabledReason: string;
	}>().toExtend<CheckboxProps>();
	expectTypeOf<{
		disabled: true;
		shamefullyOmitDisabledReason: true;
	}>().toExtend<CheckboxProps>();
});

describe("disabled", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	test("a disabled checkbox shows its reason on hover", async () => {
		render(() => (
			<Checkbox disabled disabledReason="Locked by an admin">
				Accept
			</Checkbox>
		));
		const wrapper = document.querySelector<HTMLElement>(
			'[data-scope="tooltip"][data-part="trigger"]'
		);
		expect(wrapper).not.toBeNull();
		fireEvent.pointerMove(wrapper!);
		await vi.advanceTimersByTimeAsync(TOOLTIP_OPEN_DELAY_MS);
		expect(screen.getByText("Locked by an admin")).toBeInTheDocument();
	});

	test("disabled reaches the checkbox itself", () => {
		render(() => (
			<Checkbox disabled shamefullyOmitDisabledReason>
				Accept
			</Checkbox>
		));
		expect(screen.getByRole("checkbox")).toBeDisabled();
	});
});

test("renders a label when children are provided", () => {
	render(() => <Checkbox>Accept</Checkbox>);
	expect(
		screen.getByRole("checkbox", { name: "Accept" })
	).toBeInTheDocument();
});

test("renders the indeterminate dash indicator", () => {
	render(() => <Checkbox checked="indeterminate" />);
	expect(screen.getByText("remove")).toBeInTheDocument();
});

test("classOverride restyles each part", () => {
	render(() => (
		<Checkbox
			classOverride={{
				controlClass: "custom-control",
				labelClass: "custom-label",
				indicatorClass: "custom-indicator",
			}}
		>
			Accept
		</Checkbox>
	));
	expect(
		document.querySelector('[data-scope="checkbox"][data-part="control"]')
	).toHaveClass("custom-control");
	expect(screen.getByText("Accept")).toHaveClass("custom-label");
	expect(
		document.querySelector('[data-scope="checkbox"][data-part="indicator"]')
	).toHaveClass("custom-indicator");
});
