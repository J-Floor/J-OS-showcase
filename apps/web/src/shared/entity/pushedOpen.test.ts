// @vitest-environment happy-dom
import { Router, useNavigate, useSearchParams } from "@solidjs/router";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { createComponent } from "solid-js";
import { afterEach, expect, onTestFinished, test, vi } from "vitest";

import { createParameterClearer, pushedOpenState } from "./pushedOpen.ts";

afterEach(cleanup);

test("two clear requests before the pop lands pop once, never out of the page", async () => {
	window.history.replaceState(null, "", "/home");
	// A browser traverses history asynchronously; happy-dom does it at once.
	const go = window.history.go.bind(window.history);
	const spy = vi.spyOn(window.history, "go").mockImplementation((delta) => {
		setTimeout(() => {
			go(delta);
		}, 0);
	});
	onTestFinished(() => {
		spy.mockRestore();
	});
	const bag: {
		navigate?: ReturnType<typeof useNavigate>;
		clear?: () => void;
	} = {};
	function Harness() {
		const navigate = useNavigate();
		const [params, setParams] = useSearchParams();
		bag.navigate = navigate;
		bag.clear = createParameterClearer("x", params, setParams, navigate);
		return null;
	}
	render(() =>
		createComponent(Router, {
			children: { path: "*", component: Harness },
		})
	);
	bag.navigate?.("/events");
	await waitFor(() => {
		expect(window.location.pathname).toBe("/events");
	});
	bag.navigate?.("/events?x=a1", { state: pushedOpenState("x") });
	await waitFor(() => {
		expect(window.location.search).toBe("?x=a1");
	});

	// An effect that re-runs before popstate asks again.
	bag.clear?.();
	bag.clear?.();
	await waitFor(() => {
		expect(window.location.search).toBe("");
	});
	await new Promise((resolve) => {
		setTimeout(resolve, 20);
	});
	expect(window.location.pathname).toBe("/events");
});
