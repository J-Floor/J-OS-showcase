// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("../lib/pwaUpdates.ts", () => ({ checkForUpdateNow: () => {} }));

import { AppErrorBoundary } from "./AppErrorBoundary.tsx";

afterEach(cleanup);

test("a new resetKey clears a caught error and renders the children again", () => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	const [path, setPath] = createSignal("/broken");
	render(() => (
		<AppErrorBoundary resetKey={path()}>
			{(() => {
				if (path() === "/broken") throw new Error("boom");
				return <p>page</p>;
			})()}
		</AppErrorBoundary>
	));
	expect(screen.queryByText("page")).toBeNull();
	setPath("/fine");
	expect(screen.getByText("page")).toBeInTheDocument();
});
