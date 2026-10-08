import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { Deferred, setDeferredImmediate } from "./Deferred.tsx";

beforeEach(() => {
	setDeferredImmediate(false);
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
	setDeferredImmediate(true);
});

test("renders the fallback first, then the children after a paint", async () => {
	render(() => (
		<Deferred fallback={<p>skeleton</p>}>
			<p>content</p>
		</Deferred>
	));
	expect(screen.getByText("skeleton")).toBeInTheDocument();
	expect(screen.queryByText("content")).toBeNull();
	await vi.runAllTimersAsync();
	expect(screen.getByText("content")).toBeInTheDocument();
	expect(screen.queryByText("skeleton")).toBeNull();
});

test("does not build the children before the paint", () => {
	const built = vi.fn();
	function Heavy() {
		built();
		return <p>content</p>;
	}
	render(() => (
		<Deferred fallback={<p>skeleton</p>}>
			<Heavy />
		</Deferred>
	));
	expect(built).not.toHaveBeenCalled();
});

test("immediate mode renders children synchronously", () => {
	setDeferredImmediate(true);
	render(() => (
		<Deferred fallback={<p>skeleton</p>}>
			<p>content</p>
		</Deferred>
	));
	expect(screen.getByText("content")).toBeInTheDocument();
});

test("hold keeps the fallback even after the paint wait elapses", async () => {
	render(() => (
		<Deferred fallback={<p>skeleton</p>} hold>
			<p>content</p>
		</Deferred>
	));
	await vi.runAllTimersAsync();
	expect(screen.getByText("skeleton")).toBeInTheDocument();
	expect(screen.queryByText("content")).toBeNull();
});

test("children mount once hold is released", async () => {
	const [hold, setHold] = createSignal(true);
	render(() => (
		<Deferred fallback={<p>skeleton</p>} hold={hold()}>
			<p>content</p>
		</Deferred>
	));
	// The paint wait has already elapsed while held.
	await vi.runAllTimersAsync();
	expect(screen.queryByText("content")).toBeNull();

	setHold(false);
	expect(screen.getByText("content")).toBeInTheDocument();
	expect(screen.queryByText("skeleton")).toBeNull();
});

test("children mount when the paint wait elapses after hold is released", async () => {
	const [hold, setHold] = createSignal(true);
	render(() => (
		<Deferred fallback={<p>skeleton</p>} hold={hold()}>
			<p>content</p>
		</Deferred>
	));
	setHold(false);
	// Not yet ready: the paint wait has not elapsed, so the fallback still shows.
	expect(screen.getByText("skeleton")).toBeInTheDocument();
	await vi.runAllTimersAsync();
	expect(screen.getByText("content")).toBeInTheDocument();
});

test("immediate mode still shows the fallback while held", () => {
	setDeferredImmediate(true);
	render(() => (
		<Deferred fallback={<p>skeleton</p>} hold>
			<p>content</p>
		</Deferred>
	));
	expect(screen.getByText("skeleton")).toBeInTheDocument();
	expect(screen.queryByText("content")).toBeNull();
});

test("disposing before the paint cancels the mount", async () => {
	const built = vi.fn();
	function Heavy() {
		built();
		return <p>content</p>;
	}
	const { unmount } = render(() => (
		<Deferred fallback={<p>skeleton</p>}>
			<Heavy />
		</Deferred>
	));
	unmount();
	await vi.runAllTimersAsync();
	expect(built).not.toHaveBeenCalled();
});
