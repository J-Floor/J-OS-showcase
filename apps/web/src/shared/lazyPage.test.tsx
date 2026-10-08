// @vitest-environment happy-dom
import { ErrorBoundary } from "@j-os/design-system";
import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import { createResource, type Component } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import { lazyPage } from "./lazyPage.tsx";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

test("shows PageSkeleton until the loader resolves, then renders the page", async () => {
	let resolveLoad!: (c: Component) => void;
	const promise = new Promise<Component>((resolve) => {
		resolveLoad = resolve;
	});
	function Page() {
		return <p>Page content</p>;
	}
	const LazyPage = lazyPage(() => promise);

	render(() => <LazyPage />);

	expect(
		document.querySelectorAll("[data-skeleton-row]").length
	).toBeGreaterThan(0);
	expect(screen.queryByText("Page content")).toBeNull();

	resolveLoad(Page);

	await waitFor(() => {
		expect(screen.getByText("Page content")).toBeInTheDocument();
	});
	expect(document.querySelectorAll("[data-skeleton-row]").length).toBe(0);
});

test("a second mount after load renders the page synchronously, no skeleton", async () => {
	function Page() {
		return <p>Cached content</p>;
	}
	const LazyPage = lazyPage(() => Promise.resolve(Page));

	const first = render(() => <LazyPage />);
	await waitFor(() => {
		expect(screen.getByText("Cached content")).toBeInTheDocument();
	});
	first.unmount();

	const second = render(() => <LazyPage />);
	// No `await` / `waitFor`: the cache already holds the component, so this
	// must be present on the very next synchronous read.
	expect(second.getByText("Cached content")).toBeInTheDocument();
	expect(
		second.container.querySelectorAll("[data-skeleton-row]").length
	).toBe(0);
});

test("a rejected loader reaches an ErrorBoundary fallback", async () => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	const LazyPage = lazyPage(() => Promise.reject(new Error("chunk boom")));

	render(() => (
		<ErrorBoundary>
			<LazyPage />
		</ErrorBoundary>
	));

	await waitFor(() => {
		expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
	});
	expect(screen.getByText("chunk boom")).toBeInTheDocument();
});

// Regression for the review finding this loader replaces: a route-level
// `<Suspense>` re-enters its fallback whenever a Convex `useQuery` (a
// `createResource` under the hood) refetches, detaching the whole page DOM
// and dropping focus (see suspense-convex-loading-crash). `lazyPage` must
// never itself sit inside a Suspense boundary — verified here by mounting a
// page that reads its own `createResource`, focusing an input inside it,
// refetching, and asserting the exact same input element (and focus) survive.
// This test fails if `LazyPage`'s render is wrapped in `<Suspense>` (checked
// manually while writing this test, then reverted).
test("a resource refetch inside the page does not replace the page's DOM", async () => {
	let refetch!: () => void;
	function Page() {
		const [data, { refetch: doRefetch }] = createResource(() =>
			Promise.resolve("v1")
		);
		refetch = () => {
			void doRefetch();
		};
		return (
			<div>
				<input aria-label="focus target" />
				<p>{data()}</p>
			</div>
		);
	}
	const LazyPage = lazyPage(() => Promise.resolve(Page));

	render(() => <LazyPage />);
	await waitFor(() => {
		expect(screen.getByText("v1")).toBeInTheDocument();
	});

	const input = screen.getByLabelText("focus target");
	input.focus();
	expect(document.activeElement).toBe(input);

	refetch();
	await waitFor(() => {
		expect(screen.getByText("v1")).toBeInTheDocument();
	});

	expect(input.isConnected).toBe(true);
	expect(document.activeElement).toBe(input);
});
