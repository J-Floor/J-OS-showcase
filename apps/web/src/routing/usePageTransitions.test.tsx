// @vitest-environment happy-dom
import {
	MemoryRouter,
	Router,
	Route,
	useBeforeLeave,
	useLocation,
	useNavigate,
} from "@solidjs/router";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import { createLeaveGuards } from "./leaveGuards.ts";
import { usePageTransitions } from "./usePageTransitions.ts";

afterEach(async () => {
	// A transition left running would swallow the next test's navigation.
	await settled();
	cleanup();
	vi.restoreAllMocks();
	guard = undefined;
	vi.unstubAllGlobals();
	Reflect.deleteProperty(document, "startViewTransition");
});

const finished: Promise<void>[] = [];

function fakeTransition() {
	finished.length = 0;
	const start = vi.fn((callback: () => Promise<void>) => {
		// Like a browser, the update callback runs after startViewTransition returns.
		const done = Promise.resolve().then(callback);
		finished.push(done);
		return { finished: done, updateCallbackDone: done };
	});
	Object.assign(document, { startViewTransition: start });
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	return start;
}

// The first navigation's transition must have ended, or the next one would
// join it instead of starting its own.
async function settled() {
	await Promise.all(finished);
	await new Promise((resolve) => setTimeout(resolve, 0));
}

let go: (to: string) => void;
let replaceWith: (to: string) => void;
let guard:
	| ((event: {
			preventDefault: () => void;
			defaultPrevented: boolean;
	  }) => void)
	| undefined;
let pathname: () => string;

function Shell(props: { children?: unknown }) {
	let page: HTMLDivElement | undefined;
	usePageTransitions(() => page);
	const navigate = useNavigate();
	go = navigate;
	replaceWith = (to) => {
		navigate(to, { replace: true });
	};
	const location = useLocation();
	pathname = () => location.pathname;
	useBeforeLeave((event) => guard?.(event));
	return (
		<div
			ref={(element) => {
				page = element;
			}}
		>
			{props.children as never}
		</div>
	);
}

function app() {
	render(() => (
		<MemoryRouter root={Shell}>
			<Route path="/a" component={() => <p>Page A</p>} />
			<Route path="/b" component={() => <p>Page B</p>} />
		</MemoryRouter>
	));
}

test("a pathname change runs inside a page transition", async () => {
	const start = fakeTransition();
	app();
	go("/a");
	await screen.findByText("Page A");
	await settled();
	start.mockClear();
	go("/b");
	expect(await screen.findByText("Page B")).toBeInTheDocument();
	expect(start).toHaveBeenCalledTimes(1);
});

test("a search-only change does not start a transition", async () => {
	const start = fakeTransition();
	app();
	go("/a");
	await screen.findByText("Page A");
	start.mockClear();
	go("/a?person=1");
	await Promise.resolve();
	expect(start).not.toHaveBeenCalled();
});

test("a redirect (a replace navigation) does not start a transition", async () => {
	const start = fakeTransition();
	app();
	go("/a");
	await screen.findByText("Page A");
	await settled();
	start.mockClear();
	replaceWith("/b");
	expect(await screen.findByText("Page B")).toBeInTheDocument();
	expect(start).not.toHaveBeenCalled();
});

test("leaving the index route (the landing redirect) does not start a transition", async () => {
	const start = fakeTransition();
	app();
	go("/a");
	await screen.findByText("Page A");
	await settled();
	go("/");
	await vi.waitFor(() => {
		expect(pathname()).toBe("/");
	});
	await settled();
	start.mockClear();
	go("/b");
	expect(await screen.findByText("Page B")).toBeInTheDocument();
	expect(start).not.toHaveBeenCalled();
});

test("without the API navigation is not intercepted", async () => {
	const seen: boolean[] = [];
	guard = (event) => {
		seen.push(event.defaultPrevented);
	};
	app();
	go("/a");
	go("/b");
	expect(seen).toEqual([false, false]);
	await vi.waitFor(() => {
		expect(pathname()).toBe("/b");
	});
});

test("a later guard still blocks the replayed navigation", async () => {
	const start = fakeTransition();
	app();
	go("/a");
	await screen.findByText("Page A");
	await settled();
	guard = (event) => {
		event.preventDefault();
	};
	start.mockClear();
	go("/b");
	await settled();
	expect(pathname()).toBe("/a");
	expect(screen.queryByText("Page B")).toBeNull();
});

test("a navigation after a replay starts a transition again", async () => {
	const start = fakeTransition();
	app();
	go("/a");
	await screen.findByText("Page A");
	await settled();
	go("/b");
	await screen.findByText("Page B");
	await settled();
	start.mockClear();
	go("/a");
	expect(await screen.findByText("Page A")).toBeInTheDocument();
	expect(start).toHaveBeenCalledTimes(1);
});

// happy-dom does not traverse history: mirror a browser, where go() is async
// and ends in a popstate at the entry reached, `delay` ms later.
function fakeTraversal(delay = 0) {
	const pushState = window.history.pushState.bind(window.history);
	const replaceState = window.history.replaceState.bind(window.history);
	const entries: { state: unknown; url: string }[] = [
		{ state: { _depth: 0 }, url: "/a" },
	];
	replaceState(entries[0].state, "", "/a");
	let index = 0;
	vi.spyOn(window.history, "pushState").mockImplementation(
		(state: unknown, unused: string, url?: string | URL | null) => {
			pushState(state, unused, url);
			entries.splice(index + 1, entries.length, {
				state: window.history.state as unknown,
				url: String(url),
			});
			index += 1;
		}
	);
	vi.spyOn(window.history, "replaceState").mockImplementation(
		(state: unknown, unused: string, url?: string | URL | null) => {
			replaceState(state, unused, url);
			entries[index] = {
				state: window.history.state as unknown,
				url:
					url === undefined || url === null
						? entries[index].url
						: String(url),
			};
		}
	);
	vi.spyOn(window.history, "length", "get").mockImplementation(
		() => entries.length
	);
	vi.spyOn(window.history, "go").mockImplementation((delta = 0) => {
		setTimeout(() => {
			index += delta;
			const entry = entries[index];
			replaceState(entry.state, "", entry.url);
			window.dispatchEvent(
				new PopStateEvent("popstate", { state: entry.state })
			);
		}, delay);
	});
	vi.spyOn(window.history, "back").mockImplementation(() => {
		window.history.go(-1);
	});
	vi.spyOn(window.history, "forward").mockImplementation(() => {
		window.history.go(1);
	});
}

function browserApp() {
	render(() => (
		<Router root={Shell}>
			<Route path="/a" component={() => <p>Page A</p>} />
			<Route path="/b" component={() => <p>Page B</p>} />
		</Router>
	));
}

test("Back replays once inside a transition and settles", async () => {
	window.history.replaceState(null, "", "/a");
	fakeTraversal();
	const start = fakeTransition();
	render(() => (
		<Router root={Shell}>
			<Route path="/a" component={() => <p>Page A</p>} />
			<Route path="/b" component={() => <p>Page B</p>} />
		</Router>
	));
	await screen.findByText("Page A");
	go("/b");
	await screen.findByText("Page B");
	await settled();
	start.mockClear();
	window.history.back();
	expect(await screen.findByText("Page A")).toBeInTheDocument();
	await settled();
	expect(pathname()).toBe("/a");
	expect(start).toHaveBeenCalledTimes(1);
});

test("Forward replays once inside a transition and settles", async () => {
	window.history.replaceState(null, "", "/a");
	fakeTraversal();
	const start = fakeTransition();
	browserApp();
	await screen.findByText("Page A");
	go("/b");
	await screen.findByText("Page B");
	await settled();
	window.history.back();
	await screen.findByText("Page A");
	await settled();
	start.mockClear();
	window.history.forward();
	expect(await screen.findByText("Page B")).toBeInTheDocument();
	await settled();
	expect(pathname()).toBe("/b");
	expect(start).toHaveBeenCalledTimes(1);
});

test("a Back slower than the settle cap still settles with one transition", async () => {
	const SLOWER_THAN_THE_CAP = 120;
	window.history.replaceState(null, "", "/a");
	fakeTraversal(SLOWER_THAN_THE_CAP);
	const start = fakeTransition();
	browserApp();
	await screen.findByText("Page A");
	go("/b");
	await screen.findByText("Page B");
	await settled();
	start.mockClear();
	window.history.back();
	expect(
		await screen.findByText("Page A", {}, { timeout: 1000 })
	).toBeInTheDocument();
	await new Promise((resolve) =>
		setTimeout(resolve, SLOWER_THAN_THE_CAP * 4)
	);
	expect(pathname()).toBe("/a");
	expect(start).toHaveBeenCalledTimes(1);
});

test("guards run twice per animated navigation: first prevented, then the replay", async () => {
	fakeTransition();
	app();
	go("/a");
	await screen.findByText("Page A");
	await settled();
	const seen: boolean[] = [];
	guard = (event) => {
		seen.push(event.defaultPrevented);
	};
	go("/b");
	await screen.findByText("Page B");
	expect(seen).toEqual([true, false]);
});

let hold: ((proceed: () => void) => boolean) | undefined;

/** The app shell's order: leave guards first, then page transitions. */
function GuardedShell(props: { children?: unknown }) {
	let page: HTMLDivElement | undefined;
	const guards = createLeaveGuards();
	usePageTransitions(() => page);
	guards.add((proceed) => hold?.(proceed) ?? false);
	const navigate = useNavigate();
	go = navigate;
	const location = useLocation();
	pathname = () => location.pathname;
	return (
		<div
			ref={(element) => {
				page = element;
			}}
		>
			{props.children as never}
		</div>
	);
}

test("a leave a guard holds starts no transition; going ahead animates it once", async () => {
	const start = fakeTransition();
	render(() => (
		<MemoryRouter root={GuardedShell}>
			<Route path="/a" component={() => <p>Page A</p>} />
			<Route path="/b" component={() => <p>Page B</p>} />
		</MemoryRouter>
	));
	go("/a");
	await screen.findByText("Page A");
	await settled();
	start.mockClear();
	let proceed: (() => void) | undefined;
	hold = (goOn) => {
		proceed = goOn;
		return true;
	};
	go("/b");
	await settled();
	expect(pathname()).toBe("/a");
	expect(start).not.toHaveBeenCalled();
	hold = undefined;
	proceed?.();
	expect(await screen.findByText("Page B")).toBeInTheDocument();
	expect(start).toHaveBeenCalledTimes(1);
});
