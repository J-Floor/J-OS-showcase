import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";

import { Switch } from "./Switch.tsx";

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

test("toggles and reports the new state", async () => {
	let checked: boolean | undefined;
	render(() => (
		<Switch
			label="Push"
			onCheckedChange={(details) => {
				checked = details.checked;
			}}
		/>
	));
	fireEvent.click(screen.getByRole("switch", { name: "Push" }));
	await vi.waitFor(() => {
		expect(checked).toBe(true);
	});
	expect(screen.getByRole("switch", { name: "Push" })).toBeChecked();
});

test("respects disabled", () => {
	let calls = 0;
	render(() => (
		<Switch
			label="Push"
			disabled
			onCheckedChange={() => {
				calls += 1;
			}}
		/>
	));
	const toggle = screen.getByRole("switch", { name: "Push" });
	expect(toggle).toBeDisabled();
	fireEvent.click(toggle);
	expect(calls).toBe(0);
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
