// @vitest-environment happy-dom
import { viewTransition } from "@j-os/design-system";
import {
	MemoryRouter,
	Route,
	createMemoryHistory,
	useLocation,
	useNavigate,
} from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { createSignal, Suspense } from "solid-js";
import { afterEach, expect, onTestFinished, test, vi } from "vitest";

import { AbilityProvider, type Role } from "../../lib/ability.tsx";

import type { EntityDescriptor, PeekProps } from "./entityDescriptor.ts";
import { lazyPeek } from "./lazyPeek.tsx";
import { usePeek } from "./PeekContext.tsx";
import { PeekHost } from "./PeekHost.tsx";
import { pushedOpenState } from "./pushedOpen.ts";

type Row = { _id: string; name: string };

const seen: {
	location?: ReturnType<typeof useLocation>;
	navigate?: ReturnType<typeof useNavigate>;
} = {};

function currentUrl(): string {
	return seen.location
		? `${seen.location.pathname}${seen.location.search}`
		: "";
}

const { fake, bare, slow, broken, second, late } = vi.hoisted(() => ({
	second: {} as EntityDescriptor<Row>,
	late: {} as EntityDescriptor<Row>,
	fake: {} as EntityDescriptor<Row>,
	bare: {} as EntityDescriptor<Row>,
	slow: {} as EntityDescriptor<Row>,
	broken: {} as EntityDescriptor<Row>,
}));

vi.mock("./entityDescriptors.ts", () => ({
	entityDescriptors: [fake, bare, slow, broken, second, late],
}));

function FakePeek(props: PeekProps<Row>) {
	const peek = usePeek();
	return (
		<div data-testid="peek" data-open={String(props.open)}>
			<span>{props.row?.name}</span>
			<span data-testid="view-in">
				{peek?.viewIn.label}|{peek?.viewIn.href}
			</span>
			<button
				onClick={() => {
					props.onOpenChange(false);
				}}
			>
				close
			</button>
		</div>
	);
}

function SecondPeek(props: PeekProps<Row>) {
	return (
		<div data-testid="peek-second" data-open={String(props.open)}>
			<span>{props.row?.name}</span>
		</div>
	);
}

const [rows, setRows] = createSignal([{ _id: "r1", name: "Alpha" }]);
// A kind whose list has not answered yet.
const [lateRows, setLateRows] = createSignal<Row[] | undefined>(undefined);

function useLateRows() {
	return lateRows;
}

function useFakeRows() {
	return rows;
}

function nameOf(row: Row) {
	return row.name;
}

Object.assign(fake, {
	key: "fake",
	route: "/fakes",
	param: "fake",
	group: "Fakes",
	icon: "widgets",
	useRows: useFakeRows,
	label: nameOf,
	ability: { action: "view", subject: "Inventory" },
	peek: lazyPeek(() => Promise.resolve(FakePeek)),
} satisfies EntityDescriptor<Row>);
Object.assign(second, fake, {
	key: "second",
	route: "/seconds",
	param: "second",
	peek: lazyPeek(() => Promise.resolve(SecondPeek)),
});
Object.assign(late, fake, { key: "late", useRows: useLateRows });
Object.assign(bare, fake, { key: "bare", peek: undefined });

// A chunk that has not arrived: the slow kind's peek resolves when the test
// says so.
const chunk: { arrive?: () => void } = {};
const SlowPeek = lazyPeek(
	() =>
		new Promise<typeof FakePeek>((resolve) => {
			chunk.arrive = () => {
				resolve(FakePeek);
			};
		})
);
Object.assign(slow, fake, { key: "slow", peek: SlowPeek });

// A chunk that never comes (offline, or a stale bundle after a deploy).
Object.assign(broken, fake, {
	key: "broken",
	peek: lazyPeek<Row>(() => Promise.reject(new Error("chunk failed"))),
});

afterEach(cleanup);

function Page() {
	seen.location = useLocation();
	seen.navigate = useNavigate();
	return (
		<>
			<p data-testid="page">page content</p>
			<PeekHost />
		</>
	);
}

function renderHost(
	startAt: string,
	role: Role = "board",
	history = createMemoryHistory()
) {
	history.set({ value: startAt });
	// The boundary above the host, as the shell has above the page: a peek
	// that suspends it would swap the whole page for this fallback.
	render(() => (
		<AbilityProvider role={role}>
			<Suspense fallback={<p data-testid="shell-fallback">loading</p>}>
				<MemoryRouter history={history}>
					<Route path="*" component={Page} />
				</MemoryRouter>
			</Suspense>
		</AbilityProvider>
	));
	return currentUrl;
}

test("the open param renders the kind's peek, open, with its row", async () => {
	renderHost("/events?open=fake%3Ar1");
	await waitFor(() => {
		expect(screen.getByTestId("peek")).toHaveAttribute("data-open", "true");
	});
	expect(screen.getByText("Alpha")).toBeInTheDocument();
});

test("the peek sees a view-in link to the entity's page", async () => {
	renderHost("/events?open=fake%3Ar1");
	await waitFor(() => {
		expect(screen.getByTestId("view-in")).toHaveTextContent(
			"View in Fakes|/fakes?fake=r1"
		);
	});
});

test("an unknown kind clears the param", async () => {
	const url = renderHost("/events?open=nope%3Ar1");
	await waitFor(() => {
		expect(url()).toBe("/events");
	});
	expect(screen.queryByTestId("peek")).toBeNull();
});

test("a kind without a peek clears the param", async () => {
	const url = renderHost("/events?open=bare%3Ar1");
	await waitFor(() => {
		expect(url()).toBe("/events");
	});
});

test("a loaded list without the slug clears the param", async () => {
	const url = renderHost("/events?open=fake%3Amissing");
	await waitFor(() => {
		expect(url()).toBe("/events");
	});
});

test("a viewer who may not see the kind gets nothing and the param is cleared", async () => {
	const url = renderHost("/events?open=fake%3Ar1", "member");
	await waitFor(() => {
		expect(url()).toBe("/events");
	});
	expect(screen.queryByTestId("peek")).toBeNull();
});

test("a peek whose chunk is still loading leaves the page standing, then renders once it arrives", async () => {
	renderHost("/events?open=slow%3Ar1");
	await waitFor(() => {
		expect(chunk.arrive).toBeDefined();
	});
	expect(screen.getByTestId("page")).toBeInTheDocument();
	expect(screen.queryByTestId("shell-fallback")).toBeNull();
	expect(screen.queryByTestId("peek")).toBeNull();
	chunk.arrive?.();
	await waitFor(() => {
		expect(screen.getByTestId("peek")).toHaveAttribute("data-open", "true");
	});
	expect(screen.getByTestId("page")).toBeInTheDocument();
	expect(screen.queryByTestId("shell-fallback")).toBeNull();
});

test("a data update inside the open peek keeps the same DOM node", async () => {
	renderHost("/events?open=fake%3Ar1");
	const peek = await screen.findByTestId("peek");
	setRows([{ _id: "r1", name: "Alpha renamed" }]);
	await waitFor(() => {
		expect(screen.getByText("Alpha renamed")).toBeInTheDocument();
	});
	expect(screen.getByTestId("peek")).toBe(peek);
	setRows([{ _id: "r1", name: "Alpha" }]);
});

test("a peek whose chunk fails to load closes and clears the param", async () => {
	const url = renderHost("/events?open=broken%3Ar1");
	await waitFor(() => {
		expect(url()).toBe("/events");
	});
	expect(screen.queryByTestId("peek")).toBeNull();
	expect(screen.getByTestId("page")).toBeInTheDocument();
});

test("closing removes the open param", async () => {
	const url = renderHost("/events?open=fake%3Ar1");
	await waitFor(() => {
		expect(screen.getByTestId("peek")).toBeInTheDocument();
	});
	fireEvent.click(screen.getByRole("button", { name: "close" }));
	await waitFor(() => {
		expect(url()).toBe("/events");
	});
});

test("a list that has not answered yet keeps the param, and the peek opens once it does", async () => {
	const url = renderHost("/events?open=late%3Ar1");
	await new Promise((resolve) => {
		setTimeout(resolve, 20);
	});
	expect(url()).toBe("/events?open=late%3Ar1");
	setLateRows([{ _id: "r1", name: "Late one" }]);
	await waitFor(() => {
		expect(screen.getByTestId("peek")).toHaveAttribute("data-open", "true");
	});
	expect(screen.getByText("Late one")).toBeInTheDocument();
	expect(url()).toBe("/events?open=late%3Ar1");
});

/** A View Transitions fake whose transition finishes only when told to. */
function holdTransition(): () => void {
	const resolvers: (() => void)[] = [];
	const finished = new Promise<void>((resolve) => {
		resolvers.push(resolve);
	});
	Object.assign(document, {
		startViewTransition: (update: () => Promise<void> | void) => {
			const updated = Promise.resolve().then(update);
			return { finished, updateCallbackDone: updated, ready: updated };
		},
	});
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	onTestFinished(() => {
		Reflect.deleteProperty(document, "startViewTransition");
		vi.unstubAllGlobals();
	});
	return () => {
		for (const resolve of resolvers) resolve();
	};
}

test("stepping from one kind's peek to another's closes the first through its hold while the second opens", async () => {
	const finish = holdTransition();
	renderHost("/events?open=fake%3Ar1");
	const first = await screen.findByTestId("peek");
	expect(first).toHaveAttribute("data-open", "true");

	// The first sheet's close morph, running while the swap happens.
	void viewTransition(() => {});
	seen.navigate?.("/events?open=second%3Ar1", { replace: true });
	await waitFor(() => {
		expect(screen.getByTestId("peek-second")).toHaveAttribute(
			"data-open",
			"true"
		);
	});
	expect(screen.getByTestId("peek")).toBe(first);
	expect(first).toHaveAttribute("data-open", "false");

	finish();
	await waitFor(() => {
		expect(screen.queryByTestId("peek")).toBeNull();
	});
	expect(screen.getByTestId("peek-second")).toHaveAttribute(
		"data-open",
		"true"
	);
});

test("clearing the param on a pushed entry pops it: no duplicate of the page is left behind", async () => {
	const history = createMemoryHistory();
	history.set({ value: "/start" });
	history.set({ value: "/events" });
	window.history.replaceState(pushedOpenState("open"), "");
	onTestFinished(() => {
		window.history.replaceState(null, "");
	});
	const url = renderHost("/events?open=nope%3Ar1", "board", history);
	await waitFor(() => {
		expect(url()).toBe("/events");
	});
	history.back();
	await waitFor(() => {
		expect(url()).toBe("/start");
	});
});
