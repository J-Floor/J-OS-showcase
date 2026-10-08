import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, test, vi } from "vitest";

import { setDeferredImmediate } from "../Deferred/Deferred.tsx";

import { Drawer } from "./Drawer.tsx";

// Only what this compound adds is worth asserting — Ark's dialog machine (open
// state, focus trap, Escape) is Ark's own coverage. Here: the parts render where
// they should, and the Close part is wired to Ark's close trigger.
describe("Drawer", () => {
	it("renders title, body and footer parts when open", () => {
		render(() => (
			<Drawer.Root open={true} onOpenChange={() => {}}>
				<Drawer.Header>
					<Drawer.Title>Details</Drawer.Title>
					<Drawer.HeaderActions>
						<Drawer.Close />
					</Drawer.HeaderActions>
				</Drawer.Header>
				<Drawer.Body>
					<p>Body content</p>
				</Drawer.Body>
				<Drawer.Footer>
					<span>FOOT</span>
				</Drawer.Footer>
			</Drawer.Root>
		));
		expect(screen.getByText("Details")).toBeInTheDocument();
		expect(screen.getByText("Body content")).toBeInTheDocument();
		expect(screen.getByText("FOOT")).toBeInTheDocument();
	});

	it("Drawer.Close activates Ark's close trigger", async () => {
		const onOpenChange = vi.fn();
		render(() => (
			<Drawer.Root open={true} onOpenChange={onOpenChange}>
				<Drawer.Header>
					<Drawer.Title>Details</Drawer.Title>
					<Drawer.HeaderActions>
						<Drawer.Close />
					</Drawer.HeaderActions>
				</Drawer.Header>
				<Drawer.Body>
					<p>Body</p>
				</Drawer.Body>
			</Drawer.Root>
		));
		fireEvent.click(screen.getByRole("button", { name: /close/i }));
		await waitFor(() => {
			expect(onOpenChange).toHaveBeenCalledWith(false);
		});
	});

	test("Body with loading shows the skeleton, not children", () => {
		render(() => (
			<Drawer.Root open onOpenChange={() => {}}>
				<Drawer.Header>
					<Drawer.Title>T</Drawer.Title>
				</Drawer.Header>
				<Drawer.Body loading>
					<p>fields</p>
				</Drawer.Body>
			</Drawer.Root>
		));
		expect(screen.queryByText("fields")).toBeNull();
		expect(
			document.querySelectorAll("[data-drawer-skeleton-row]").length
		).toBe(6);
		expect(
			document.querySelector("[data-drawer-skeleton]")
		).toBeInTheDocument();
	});

	test("Body with a skeleton prop shows the placeholder shape, not the generic bars or children", () => {
		render(() => (
			<Drawer.Root open onOpenChange={() => {}}>
				<Drawer.Header>
					<Drawer.Title>T</Drawer.Title>
				</Drawer.Header>
				<Drawer.Body loading skeleton={<p>placeholder shape</p>}>
					<p>real fields</p>
				</Drawer.Body>
			</Drawer.Root>
		));
		expect(screen.queryByText("real fields")).toBeNull();
		// jsdom has no layout, so the measured Skeleton falls back to
		// rendering its (hidden-in-a-browser) children as-is — assert the
		// container plus the placeholder content, per Skeleton's own test.
		expect(
			document.querySelector("[data-shimmer-container]")
		).toBeInTheDocument();
		expect(screen.getByText("placeholder shape")).toBeInTheDocument();
		expect(
			document.querySelector("[data-drawer-skeleton]")
		).toBeInTheDocument();
		expect(
			document.querySelectorAll("[data-drawer-skeleton-row]").length
		).toBe(0);
	});

	test("Title with loading shows a shimmer, not the text", () => {
		render(() => (
			<Drawer.Root open onOpenChange={() => {}}>
				<Drawer.Header>
					<Drawer.Title loading>Name</Drawer.Title>
				</Drawer.Header>
				<Drawer.Body>
					<p>fields</p>
				</Drawer.Body>
			</Drawer.Root>
		));
		expect(screen.queryByText("Name")).toBeNull();
	});

	test("Title loading still gives the dialog an accessible name", () => {
		render(() => (
			<Drawer.Root open onOpenChange={() => {}}>
				<Drawer.Header>
					<Drawer.Title loading>Name</Drawer.Title>
				</Drawer.Header>
				<Drawer.Body>
					<p>fields</p>
				</Drawer.Body>
			</Drawer.Root>
		));
		expect(
			screen.getByRole("dialog", { name: "Loading" })
		).toBeInTheDocument();
	});

	test("Body paints the skeleton first, then the children", async () => {
		setDeferredImmediate(false);
		vi.useFakeTimers();
		try {
			render(() => (
				<Drawer.Root open onOpenChange={() => {}}>
					<Drawer.Header>
						<Drawer.Title>T</Drawer.Title>
					</Drawer.Header>
					<Drawer.Body>
						<p>fields</p>
					</Drawer.Body>
				</Drawer.Root>
			));
			expect(screen.queryByText("fields")).toBeNull();
			await vi.runAllTimersAsync();
			expect(screen.getByText("fields")).toBeInTheDocument();
		} finally {
			vi.useRealTimers();
			setDeferredImmediate(true);
		}
	});

	test("initialFocusEl inside a deferred body receives focus once it mounts", async () => {
		setDeferredImmediate(false);
		vi.useFakeTimers();
		let input: HTMLInputElement | undefined;
		try {
			render(() => (
				<Drawer.Root
					open
					onOpenChange={() => {}}
					initialFocusEl={() => input ?? null}
				>
					<Drawer.Header>
						<Drawer.Title>T</Drawer.Title>
					</Drawer.Header>
					<Drawer.Body>
						<input ref={(el) => (input = el)} aria-label="title" />
					</Drawer.Body>
				</Drawer.Root>
			));
			await vi.runAllTimersAsync();
			expect(document.activeElement).toBe(input);
		} finally {
			vi.useRealTimers();
			setDeferredImmediate(true);
		}
	});
});
