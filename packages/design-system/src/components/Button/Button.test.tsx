import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";

import { Icon } from "../Icon/Icon.tsx";
import { Kbd } from "../Kbd/Kbd.tsx";

import { Button } from "./Button.tsx";

test("fires onClick; shows spinner while async click resolves", () => {
	let clicked = false;
	render(() => (
		<Button
			onClick={() => {
				clicked = true;
			}}
		>
			Go
		</Button>
	));
	fireEvent.click(screen.getByRole("button"));
	expect(clicked).toBe(true);
});

test("defaults to the primary variant", () => {
	render(() => <Button>Go</Button>);
	expect(screen.getByRole("button")).toHaveAttribute(
		"data-variant",
		"primary"
	);
});

test("toggles data-loading while an async click is pending and clears it after", async () => {
	let resolve!: () => void;
	function onClick(): Promise<void> {
		return new Promise<void>((r) => {
			resolve = r;
		});
	}
	render(() => <Button onClick={onClick}>Go</Button>);
	const button = screen.getByRole("button");

	expect(button).toHaveAttribute("data-loading", "false");
	fireEvent.click(button);
	expect(button).toHaveAttribute("data-loading", "true");

	resolve();
	await Promise.resolve();
	await Promise.resolve();
	expect(button).toHaveAttribute("data-loading", "false");
});

test("respects the controlled isLoading prop", () => {
	render(() => <Button isLoading>Go</Button>);
	expect(screen.getByRole("button")).toHaveAttribute("data-loading", "true");
});

test("does not fire onClick while loading", () => {
	let clicked = false;
	render(() => (
		<Button
			isLoading
			onClick={() => {
				clicked = true;
			}}
		>
			Go
		</Button>
	));
	fireEvent.click(screen.getByRole("button"));
	expect(clicked).toBe(false);
});

test("forwards disabled to the underlying button", () => {
	render(() => (
		<Button disabled shamefullyOmitDisabledReason>
			Go
		</Button>
	));
	expect(screen.getByRole("button")).toBeDisabled();
});

test("a Kbd as last child counts as a suffix", () => {
	render(() => (
		<Button>
			<Icon>close</Icon>
			Turn down
			<Kbd shortcut="D" />
		</Button>
	));
	const button = screen.getByRole("button");
	expect(button.getAttribute("data-prefix")).toBe("true");
	expect(button.getAttribute("data-suffix")).toBe("true");
});

test("a bare text label has neither prefix nor suffix", () => {
	render(() => <Button>Save</Button>);
	const button = screen.getByRole("button");
	expect(button.getAttribute("data-prefix")).toBe("false");
	expect(button.getAttribute("data-suffix")).toBe("false");
});

test("the accessible name is just the label while not loading", () => {
	render(() => <Button>Got it</Button>);
	expect(screen.getByRole("button", { name: "Got it" })).toBeInTheDocument();
	expect(screen.queryByRole("status")).toBeNull();
});

test("still announces loading while loading", () => {
	render(() => <Button isLoading>Got it</Button>);
	expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
});

test("exposes the spinner again while an async click is pending", async () => {
	let resolve!: () => void;
	function onClick(): Promise<void> {
		return new Promise<void>((r) => {
			resolve = r;
		});
	}
	render(() => <Button onClick={onClick}>Got it</Button>);
	expect(screen.queryByRole("status")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Got it" }));
	expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();

	resolve();
	await waitFor(() => {
		expect(screen.queryByRole("status")).toBeNull();
	});
});

test("renders the pill variant, and as a link when given as/href", () => {
	render(() => (
		<Button variant="pill" as="a" href="https://app.thejfloor.com/sign-up">
			Apply to join
			<Icon>arrow_outward</Icon>
		</Button>
	));
	const link = screen.getByRole("link", { name: /apply to join/i });
	expect(link).toHaveAttribute("data-variant", "pill");
	expect(link).toHaveAttribute("href", "https://app.thejfloor.com/sign-up");
	expect(link.tagName).toBe("A");
});

test("renders the pill-light variant as a link", () => {
	render(() => (
		<Button variant="pill-light" as="a" href="/contact">
			Contact
		</Button>
	));
	const link = screen.getByRole("link", { name: /^contact/i });
	expect(link).toHaveAttribute("data-variant", "pill-light");
	expect(link).toHaveAttribute("href", "/contact");
});

test("an enabled button announces no disabled reason", () => {
	render(() => <Button disabledReason="Nothing to save">Save</Button>);
	expect(screen.getByRole("button")).not.toHaveAttribute("aria-description");
});

test("a disabled button announces its disabled reason", () => {
	render(() => (
		<Button disabled disabledReason="Nothing to save">
			Save
		</Button>
	));
	expect(screen.getByRole("button")).toHaveAttribute(
		"aria-description",
		"Nothing to save"
	);
});
