// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { head, clientQuery, markRead, markAllRead, navigate, toasterCreate } =
	vi.hoisted(() => ({
		head: {
			data: undefined as unknown[] | undefined,
			error: undefined as Error | undefined,
		},
		clientQuery: vi.fn(),
		markRead: vi.fn(() => Promise.resolve(null)),
		markAllRead: vi.fn(() => Promise.resolve(null)),
		navigate: vi.fn(),
		toasterCreate: vi.fn(),
	}));

vi.mock("convex-solidjs", () => ({
	useQuery: () => ({ data: () => head.data, error: () => head.error }),
	useMutation: (function_: string) => ({
		mutateAsync: function_ === "markRead" ? markRead : markAllRead,
	}),
	useConvexClient: () => ({ query: clientQuery }),
}));
vi.mock("../../../convex/_generated/api", () => ({
	api: {
		notify: {
			inbox: {
				firstPageFloor: "firstPageFloor",
				listSince: "listSince",
				listBefore: "listBefore",
				markRead: "markRead",
				markAllRead: "markAllRead",
			},
		},
	},
}));
vi.mock("@solidjs/router", () => ({ useNavigate: () => navigate }));
vi.mock("../toaster.ts", () => ({ toaster: { create: toasterCreate } }));

/** One per sentinel mount, in mount order, with the elements it observes. */
const intersections: {
	callback: IntersectionObserverCallback;
	elements: Element[];
}[] = [];

class StubIntersectionObserver {
	private readonly entry: (typeof intersections)[number];
	constructor(callback: IntersectionObserverCallback) {
		this.entry = { callback, elements: [] };
		intersections.push(this.entry);
	}
	observe(element: Element) {
		this.entry.elements.push(element);
	}
	unobserve() {}
	disconnect() {}
}

/** Report the current sentinel as scrolled into view, or not. */
function reachEnd(isIntersecting = true): void {
	const current = intersections.at(-1);
	if (!current) throw new Error("no sentinel is observed");
	current.callback(
		current.elements.map(
			(target) =>
				({ isIntersecting, target }) as IntersectionObserverEntry
		),
		{} as IntersectionObserver
	);
}

function listBeforeCalls(): number {
	return clientQuery.mock.calls.filter((call) => call[0] === "listBefore")
		.length;
}

import styles from "./NotificationList.module.scss";
import { NotificationList } from "./NotificationList.tsx";
import { type Inbox, useInbox } from "./useInbox.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TODAY_NOON = new Date().setHours(12, 0, 0, 0);

function row(id: string, title: string, createdAt: number, isRead = false) {
	return {
		_id: id,
		title,
		body: `${title} body`,
		url: `/tasks?task=${id}`,
		createdAt,
		read: isRead,
	};
}

const TASK = row("n1", "New task assigned", TODAY_NOON);
const EVENT = row("n2", "Demo Night starts soon", TODAY_NOON - HOUR, true);
const GUEST = row("n3", "Guest access ending soon", TODAY_NOON - DAY);

/** The floor the client fetches, then each `listBefore` answer in order
 *  (an Error rejects). */
function serve(floor: { since: number | null }, pages: unknown[] = []): void {
	clientQuery.mockImplementation((function_: string) => {
		if (function_ === "firstPageFloor") return Promise.resolve(floor);
		const page = pages.shift();
		return page instanceof Error
			? Promise.reject(page)
			: Promise.resolve(page);
	});
}

function renderList(
	options: {
		open?: () => boolean;
		onClose?: () => void;
		exposed?: { inbox?: Inbox };
	} = {}
) {
	function Harness() {
		const inbox = useInbox(options.open ?? (() => true));
		if (options.exposed) options.exposed.inbox = inbox;
		return (
			<NotificationList
				inbox={inbox}
				onClose={options.onClose ?? (() => {})}
			/>
		);
	}
	return render(() => <Harness />);
}

function rowOf(title: string): HTMLElement {
	const item = screen
		.getByText(title)
		.closest<HTMLElement>(`[role="listitem"]`);
	if (!item) throw new Error(`no row for ${title}`);
	return item;
}

beforeEach(() => {
	vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	intersections.length = 0;
	vi.clearAllMocks();
	head.data = undefined;
	head.error = undefined;
});

test("groups rows under Today and Yesterday, newest first", () => {
	head.data = [TASK, EVENT, GUEST];
	serve({ since: null });
	renderList();
	expect(
		screen
			.getAllByRole("heading", { level: 3 })
			.map((heading) => heading.textContent)
	).toEqual(["Today", "Yesterday"]);
	expect(
		screen.getAllByText(/ body$/).map((element) => element.textContent)
	).toEqual([
		"New task assigned body",
		"Demo Night starts soon body",
		"Guest access ending soon body",
	]);
});

test("unread rows carry the unread class, read rows do not", () => {
	head.data = [TASK, EVENT];
	serve({ since: null });
	renderList();
	expect(rowOf("New task assigned")).toHaveClass(styles.unread);
	expect(rowOf("Demo Night starts soon")).not.toHaveClass(styles.unread);
});

test("an unread row announces it is unread, a read row does not", () => {
	head.data = [TASK, EVENT];
	serve({ since: null });
	renderList();
	expect(
		screen.getByRole("button", { name: /New task assigned.*Unread/ })
	).toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: /Demo Night starts soon.*Unread/ })
	).toBeNull();
});

test("clicking a row closes the sheet, opens its page and marks it read", () => {
	head.data = [TASK];
	serve({ since: null });
	const onClose = vi.fn();
	renderList({ onClose });
	fireEvent.click(screen.getByRole("button", { name: /New task assigned/ }));
	expect(onClose).toHaveBeenCalledOnce();
	expect(navigate).toHaveBeenCalledWith("/tasks?task=n1");
	expect(markRead).toHaveBeenCalledWith({ id: "n1" });
	expect(rowOf("New task assigned")).not.toHaveClass(styles.unread);
});

test("a failed markRead still navigates, toasts, and leaves the row unread", async () => {
	markRead.mockRejectedValueOnce(new Error("Not found"));
	head.data = [TASK];
	serve({ since: null });
	renderList();
	fireEvent.click(screen.getByRole("button", { name: /New task assigned/ }));
	expect(navigate).toHaveBeenCalledWith("/tasks?task=n1");
	await waitFor(() => {
		expect(rowOf("New task assigned")).toHaveClass(styles.unread);
	});
	expect(toasterCreate).toHaveBeenCalledWith({
		type: "error",
		title: "Could not mark that as read.",
	});
});

test("reaching the end loads an older page, with skeleton rows until it lands", async () => {
	head.data = [TASK];
	const older = row("n9", "Older one", TODAY_NOON - 2 * DAY);
	const gate: { release?: (value: unknown) => void } = {};
	serve({ since: TODAY_NOON }, [
		new Promise((resolve) => {
			gate.release = resolve;
		}),
	]);
	renderList();
	await waitFor(() => {
		expect(intersections).toHaveLength(1);
	});
	expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
	reachEnd();
	expect(
		await screen.findByRole("status", { name: "Loading" })
	).toBeInTheDocument();
	expect(clientQuery).toHaveBeenCalledWith("listBefore", {
		before: TODAY_NOON,
		paginationOpts: { numItems: 50, cursor: null },
	});
	gate.release?.({ page: [older], isDone: true, continueCursor: "c1" });
	expect(await screen.findByText("Older one")).toBeInTheDocument();
	expect(screen.queryByRole("status", { name: "Loading" })).toBeNull();
	expect(document.querySelector(`.${styles.sentinel}`)).toBeNull();
});

test("a short page that leaves the end in view loads the next one unprompted", async () => {
	head.data = [TASK];
	serve({ since: TODAY_NOON }, [
		{
			page: [row("n9", "Older one", TODAY_NOON - 2 * DAY)],
			isDone: false,
			continueCursor: "c1",
		},
		{
			page: [row("n8", "Older two", TODAY_NOON - 3 * DAY)],
			isDone: true,
			continueCursor: "c2",
		},
	]);
	renderList();
	await waitFor(() => {
		expect(intersections).toHaveLength(1);
	});
	reachEnd();
	expect(await screen.findByText("Older one")).toBeInTheDocument();
	await waitFor(() => {
		expect(intersections).toHaveLength(2);
	});
	expect(listBeforeCalls()).toBe(1);
	reachEnd();
	expect(await screen.findByText("Older two")).toBeInTheDocument();
	expect(clientQuery).toHaveBeenLastCalledWith("listBefore", {
		before: TODAY_NOON,
		paginationOpts: { numItems: 50, cursor: "c1" },
	});
});

test("a page that pushes the end out of view loads nothing more", async () => {
	head.data = [TASK];
	serve({ since: TODAY_NOON }, [
		{
			page: [row("n9", "Older one", TODAY_NOON - 2 * DAY)],
			isDone: false,
			continueCursor: "c1",
		},
		{ page: [], isDone: true, continueCursor: "c2" },
	]);
	renderList();
	await waitFor(() => {
		expect(intersections).toHaveLength(1);
	});
	reachEnd();
	expect(await screen.findByText("Older one")).toBeInTheDocument();
	await Promise.resolve();
	expect(listBeforeCalls()).toBe(1);
	await waitFor(() => {
		expect(intersections).toHaveLength(2);
	});
	reachEnd(false);
	await Promise.resolve();
	expect(listBeforeCalls()).toBe(1);
	expect(screen.queryByRole("status", { name: "Loading" })).toBeNull();
});

test("a failed page says so and Try again fetches it", async () => {
	head.data = [TASK];
	serve({ since: TODAY_NOON }, [
		new Error("offline"),
		{
			page: [row("n9", "Older one", TODAY_NOON - 2 * DAY)],
			isDone: true,
			continueCursor: "c1",
		},
	]);
	renderList();
	await waitFor(() => {
		expect(intersections).toHaveLength(1);
	});
	reachEnd();
	expect(await screen.findByText("Couldn't load more.")).toBeInTheDocument();
	expect(screen.queryByRole("status", { name: "Loading" })).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	expect(await screen.findByText("Older one")).toBeInTheDocument();
	expect(screen.queryByText("Couldn't load more.")).toBeNull();
});

test("an empty history shows the empty state", () => {
	head.data = [];
	serve({ since: null });
	renderList();
	expect(screen.getByText("No notifications yet")).toBeInTheDocument();
	expect(
		screen.getByText("Notifications sent to you show up here for 90 days.")
	).toBeInTheDocument();
});

test("a failed list says so in place of the rows", () => {
	head.error = new Error("boom");
	serve({ since: null });
	renderList();
	expect(
		screen.getByText("Couldn't load notifications.")
	).toBeInTheDocument();
});

test("the floor is read on the first open only, not at mount", async () => {
	head.data = [];
	serve({ since: null });
	const [open, setOpen] = createSignal(false);
	renderList({ open });
	expect(clientQuery).not.toHaveBeenCalled();
	setOpen(true);
	await waitFor(() => {
		expect(clientQuery).toHaveBeenCalledWith("firstPageFloor", {});
	});
	setOpen(false);
	setOpen(true);
	expect(
		clientQuery.mock.calls.filter((call) => call[0] === "firstPageFloor")
	).toHaveLength(1);
});

test("markAllRead marks every loaded row read at once and calls the mutation", () => {
	head.data = [TASK, EVENT, GUEST];
	serve({ since: null });
	const exposed: { inbox?: Inbox } = {};
	renderList({ exposed });
	exposed.inbox?.markAllRead();
	expect(markAllRead).toHaveBeenCalledWith({});
	expect(rowOf("New task assigned")).not.toHaveClass(styles.unread);
	expect(rowOf("Guest access ending soon")).not.toHaveClass(styles.unread);
});

test("a floor fetch that fails says so, and the next open tries again", async () => {
	head.data = [TASK];
	let floorCalls = 0;
	clientQuery.mockImplementation((function_: string) => {
		if (function_ !== "firstPageFloor")
			return Promise.reject(new Error("unexpected"));
		floorCalls += 1;
		return floorCalls === 1
			? Promise.reject(new Error("offline"))
			: Promise.resolve({ since: null });
	});
	const [open, setOpen] = createSignal(false);
	renderList({ open });
	setOpen(true);
	expect(
		await screen.findByText("Couldn't load notifications.")
	).toBeInTheDocument();
	setOpen(false);
	setOpen(true);
	await waitFor(() => {
		expect(floorCalls).toBe(2);
	});
	await waitFor(() => {
		expect(screen.queryByText("Couldn't load notifications.")).toBeNull();
	});
	expect(screen.getByText("New task assigned")).toBeInTheDocument();
});

test("a failed markAllRead puts the loaded rows back to unread", async () => {
	markAllRead.mockRejectedValueOnce(new Error("refused"));
	head.data = [TASK, EVENT, GUEST];
	serve({ since: null });
	const exposed: { inbox?: Inbox } = {};
	renderList({ exposed });
	exposed.inbox?.markAllRead();
	expect(rowOf("New task assigned")).not.toHaveClass(styles.unread);
	await waitFor(() => {
		expect(rowOf("New task assigned")).toHaveClass(styles.unread);
	});
	expect(rowOf("Guest access ending soon")).toHaveClass(styles.unread);
});

test("a failed markRead does not un-read a row a successful markAllRead covered", async () => {
	const rejecter: { run: (reason: Error) => void } = { run: () => {} };
	markRead.mockImplementationOnce(
		() =>
			new Promise((_resolve, reject) => {
				rejecter.run = reject;
			})
	);
	head.data = [TASK];
	serve({ since: null });
	const exposed: { inbox?: Inbox } = {};
	renderList({ exposed });
	exposed.inbox?.markRead("n1" as never);
	exposed.inbox?.markAllRead();
	await Promise.resolve();
	await Promise.resolve();
	rejecter.run(new Error("refused"));
	await waitFor(() => {
		expect(toasterCreate).toHaveBeenCalled();
	});
	expect(rowOf("New task assigned")).not.toHaveClass(styles.unread);
});

test("a refetch with a new row on top keeps the existing rows' DOM", () => {
	const [rows, setRows] = createSignal([TASK, EVENT]);
	const inbox = {
		rows,
		failed: () => false,
		canLoadMore: () => false,
		loadingMore: () => false,
		loadMoreFailed: () => false,
		loadMore: () => Promise.resolve(),
		markRead: vi.fn(),
		markAllRead: vi.fn(),
	} as unknown as Inbox;
	render(() => <NotificationList inbox={inbox} onClose={() => {}} />);
	const task = rowOf("New task assigned");
	const heading = screen.getByRole("heading", { name: "Today" });

	setRows([
		row("n4", "Fresh one", TODAY_NOON + 1000),
		{ ...TASK },
		{ ...EVENT },
	]);

	expect(screen.getByText("Fresh one")).toBeInTheDocument();
	expect(rowOf("New task assigned")).toBe(task);
	expect(screen.getByRole("heading", { name: "Today" })).toBe(heading);
});
