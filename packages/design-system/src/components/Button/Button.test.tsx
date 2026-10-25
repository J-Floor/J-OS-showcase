import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";

import { Icon } from "../Icon/Icon.tsx";
import { Kbd } from "../Kbd/Kbd.tsx";

import { Button } from "./Button.tsx";

function createPendingClick(): {
	onClick: () => Promise<void>;
	resolve: () => void;
} {
	let resolvePending!: () => void;
	function onClick(): Promise<void> {
		return new Promise<void>((resolve) => {
			resolvePending = resolve;
		});
	}
	return {
		onClick,
		resolve: () => {
			resolvePending();
		},
	};
}

test("fires onClick; shows spinner while async click resolves", () => {
	let isClicked = false;
	render(() => (
		<Button
			onClick={() => {
				isClicked = true;
			}}
		>
			Go
		</Button>
	));
	fireEvent.click(screen.getByRole("button"));
	expect(isClicked).toBe(true);
});

test("defaults to the primary variant", () => {
	render(() => <Button>Go</Button>);
	expect(screen.getByRole("button")).toHaveAttribute(
		"data-variant",
		"primary"
	);
});

test("toggles data-loading while an async click is pending and clears it after", async () => {
	const { onClick, resolve } = createPendingClick();
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
	let isClicked = false;
	render(() => (
		<Button
			isLoading
			onClick={() => {
				isClicked = true;
			}}
		>
			Go
		</Button>
	));
	fireEvent.click(screen.getByRole("button"));
	expect(isClicked).toBe(false);
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
});

test("while loading it is disabled and busy, so a submit cannot fire twice", () => {
	render(() => <Button isLoading>Save</Button>);
	const button = screen.getByRole("button");
	expect(button).toBeDisabled();
	expect(button).toHaveAttribute("aria-busy", "true");
});

test("while loading the accessible name stays the label, without the spinner's", () => {
	render(() => <Button isLoading>Save</Button>);
	expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
});

test("an async click is busy until it settles, then enabled again", async () => {
	const { onClick, resolve } = createPendingClick();
	render(() => <Button onClick={onClick}>Save</Button>);
	const button = screen.getByRole("button", { name: "Save" });
	expect(button).not.toHaveAttribute("aria-busy");
	fireEvent.click(button);
	expect(button).toHaveAttribute("aria-busy", "true");
	expect(button).toBeDisabled();
	expect(screen.getByRole("button", { name: "Save" })).toBe(button);

	resolve();
	await waitFor(() => {
		expect(button).not.toHaveAttribute("aria-busy");
	});
	expect(button).toBeEnabled();
});

test("a disabled button is not busy, even with isLoading", () => {
	render(() => (
		<Button isLoading disabled shamefullyOmitDisabledReason>
			Save
		</Button>
	));
	const button = screen.getByRole("button");
	expect(button).not.toHaveAttribute("aria-busy");
	expect(button).toHaveAttribute("data-loading", "false");
});

test("a single Icon child is a prefix, never also a suffix", () => {
	render(() => (
		<Button>
			<Icon>add</Icon>
		</Button>
	));
	const button = screen.getByRole("button");
	expect(button.getAttribute("data-prefix")).toBe("true");
	expect(button.getAttribute("data-suffix")).toBe("false");
});

test("renders the pill variant, and as a link when given as/href", () => {
	render(() => (
		<Button variant="pill" as="a" href="https://example.com/sign-up">
			Apply to join
			<Icon>arrow_outward</Icon>
		</Button>
	));
	const link = screen.getByRole("link", { name: /apply to join/i });
	expect(link).toHaveAttribute("data-variant", "pill");
	expect(link).toHaveAttribute("href", "https://example.com/sign-up");
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

test("a disabled trigger bag disables the Button", () => {
	render(() => <Button triggerProps={{ disabled: true }}>Open</Button>);
	expect(screen.getByRole("button", { name: "Open" })).toBeDisabled();
});

test("a leading Kbd is a prefix", () => {
	render(() => (
		<Button>
			<Kbd shortcut="D" />
			Turn down
		</Button>
	));
	expect(screen.getByRole("button")).toHaveAttribute("data-prefix", "true");
});

test("focus returns to the button when an async click settles with focus on the body", async () => {
	const { onClick, resolve } = createPendingClick();
	render(() => <Button onClick={onClick}>Save</Button>);
	const button = screen.getByRole("button", { name: "Save" });
	// A browser drops focus to the body when the focused button turns
	// disabled; jsdom does not, so start from the body.
	expect(document.activeElement).toBe(document.body);
	fireEvent.click(button);
	expect(button).toBeDisabled();

	resolve();
	await waitFor(() => {
		expect(document.activeElement).toBe(button);
	});
});

test("an async click that settles leaves focus alone once it has moved elsewhere", async () => {
	const { onClick, resolve } = createPendingClick();
	render(() => (
		<>
			<Button onClick={onClick}>Save</Button>
			<input aria-label="Other" />
		</>
	));
	const button = screen.getByRole("button", { name: "Save" });
	const other = screen.getByRole("textbox", { name: "Other" });
	fireEvent.click(button);
	other.focus();

	resolve();
	await waitFor(() => {
		expect(button).not.toHaveAttribute("aria-busy");
	});
	expect(document.activeElement).toBe(other);
});

/** The "Next" link, found by its text: a link without `href` has no
 *  `link` role. */
function nextLink(): HTMLAnchorElement {
	const link = screen.getByText("Next").closest("a");
	if (!link) throw new Error("No Next link");
	return link;
}

test("a loading link is aria-disabled and does not navigate", () => {
	render(() => (
		<Button as="a" href="/next" isLoading>
			Next
		</Button>
	));
	const link = nextLink();
	expect(link).toHaveAttribute("aria-disabled", "true");
	expect(fireEvent.click(link)).toBe(false);
});

test("a loading link drops its href, so a middle click or the context menu cannot open it", () => {
	render(() => (
		<Button as="a" href="/next" isLoading>
			Next
		</Button>
	));
	expect(nextLink()).not.toHaveAttribute("href");
});

test("a disabled link drops its href", () => {
	render(() => (
		<Button as="a" href="/next" disabled shamefullyOmitDisabledReason>
			Next
		</Button>
	));
	expect(nextLink()).not.toHaveAttribute("href");
});

test("a disabled link is aria-disabled and does not navigate", () => {
	render(() => (
		<Button as="a" href="/next" disabled shamefullyOmitDisabledReason>
			Next
		</Button>
	));
	const link = nextLink();
	expect(link).toHaveAttribute("aria-disabled", "true");
	expect(fireEvent.click(link)).toBe(false);
});

test("an enabled link navigates", () => {
	render(() => (
		<Button as="a" href="/next">
			Next
		</Button>
	));
	expect(fireEvent.click(screen.getByRole("link", { name: "Next" }))).toBe(
		true
	);
});

test("triggerProps keep the outer machine's handler and attributes beside the Button's own onClick", () => {
	const calls: string[] = [];
	render(() => (
		<Button
			triggerProps={{
				"aria-expanded": false,
				onClick: () => {
					calls.push("trigger");
				},
			}}
			onClick={() => {
				calls.push("own");
			}}
		>
			Open
		</Button>
	));
	const button = screen.getByRole("button", { name: "Open" });
	expect(button).toHaveAttribute("aria-expanded", "false");
	fireEvent.click(button);
	expect(calls).toEqual(["trigger", "own"]);
});

test("a shortcut names its key on the button", () => {
	render(() => <Button shortcut="Shift+D">Turn down</Button>);
	expect(screen.getByRole("button")).toHaveAttribute(
		"aria-keyshortcuts",
		"Shift+D"
	);
});

test("no shortcut, no aria-keyshortcuts", () => {
	render(() => <Button>Save</Button>);
	expect(screen.getByRole("button")).not.toHaveAttribute("aria-keyshortcuts");
});

test("without a shortcut, a caller's own aria-keyshortcuts is kept", () => {
	render(() => <Button aria-keyshortcuts="Control+S">Save</Button>);
	expect(screen.getByRole("button")).toHaveAttribute(
		"aria-keyshortcuts",
		"Control+S"
	);
});
