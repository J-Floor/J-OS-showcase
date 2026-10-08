// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

const { head, clientQuery, markRead, markAllRead, navigate } = vi.hoisted(
	() => ({
		head: {
			data: undefined as unknown[] | undefined,
			error: undefined as Error | undefined,
		},
		clientQuery: vi.fn(),
		markRead: vi.fn(() => Promise.resolve(null)),
		markAllRead: vi.fn(() => Promise.resolve(null)),
		navigate: vi.fn(),
	})
);

vi.mock("convex-solidjs", () => ({
	useQuery: () => ({ data: () => head.data, error: () => head.error }),
	useMutation: (fn: string) => ({
		mutateAsync: fn === "markRead" ? markRead : markAllRead,
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

import styles from "./NotificationList.module.scss";
import { NotificationList } from "./NotificationList.tsx";
import { type Inbox, useInbox } from "./useInbox.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TODAY_NOON = new Date().setHours(12, 0, 0, 0);

function row(id: string, title: string, createdAt: number, read = false) {
	return {
		_id: id,
		title,
		body: `${title} body`,
		url: `/tasks?task=${id}`,
		createdAt,
		read,
	};
}

const TASK = row("n1", "New task assigned", TODAY_NOON);
const EVENT = row("n2", "Demo Night starts soon", TODAY_NOON - HOUR, true);
const GUEST = row("n3", "Guest access ending soon", TODAY_NOON - DAY);

/** The floor the client fetches, then each `listBefore` answer in order
 *  (an Error rejects). */
function serve(floor: { since: number | null }, pages: unknown[] = []): void {
	clientQuery.mockImplementation((fn: string) => {
		if (fn === "firstPageFloor") return Promise.resolve(floor);
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
				onClose={options.onClose ?? (() => undefined)}
			/>
		);
	}
	return render(() => <Harness />);
}

function rowOf(title: string): HTMLElement {
	const item = screen.getByText(title).closest("li");
	if (!item) throw new Error(`no row for ${title}`);
	return item;
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	head.data = undefined;
	head.error = undefined;
});

test("groups rows under Today and Yesterday, newest first", () => {
	head.data = [TASK, EVENT, GUEST];
	serve({ since: null });
	renderList();
	expect(
		screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)
	).toEqual(["Today", "Yesterday"]);
	expect(screen.getAllByText(/ body$/).map((e) => e.textContent)).toEqual([
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

test("clicking a row closes the drawer, opens its page and marks it read", () => {
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

test("a failed markRead still navigates, is logged, and leaves the row unread", async () => {
	markRead.mockRejectedValueOnce(new Error("Not found"));
	const error = vi
		.spyOn(console, "error")
		.mockImplementation(() => undefined);
	head.data = [TASK];
	serve({ since: null });
	renderList();
	fireEvent.click(screen.getByRole("button", { name: /New task assigned/ }));
	expect(navigate).toHaveBeenCalledWith("/tasks?task=n1");
	await waitFor(() => {
		expect(rowOf("New task assigned")).toHaveClass(styles.unread);
	});
	expect(error).toHaveBeenCalled();
	error.mockRestore();
});

test("Load more appends an older page and hides once a page comes back done", async () => {
	head.data = [TASK];
	const older = row("n9", "Older one", TODAY_NOON - 2 * DAY);
	serve({ since: TODAY_NOON }, [
		{ page: [older], isDone: true, continueCursor: "c1" },
	]);
	renderList();
	fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
	expect(await screen.findByText("Older one")).toBeInTheDocument();
	expect(clientQuery).toHaveBeenCalledWith("listBefore", {
		before: TODAY_NOON,
		paginationOpts: { numItems: 50, cursor: null },
	});
	expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
});

test("a failed Load more offers to try again", async () => {
	head.data = [TASK];
	serve({ since: TODAY_NOON }, [new Error("offline")]);
	renderList();
	fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
	expect(
		await screen.findByRole("button", {
			name: "Couldn't load more. Try again.",
		})
	).toBeInTheDocument();
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
		clientQuery.mock.calls.filter((c) => c[0] === "firstPageFloor")
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
	clientQuery.mockImplementation((fn: string) => {
		if (fn !== "firstPageFloor")
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
	const error = vi
		.spyOn(console, "error")
		.mockImplementation(() => undefined);
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
	error.mockRestore();
});

test("a failed markRead does not un-read a row a successful markAllRead covered", async () => {
	const error = vi
		.spyOn(console, "error")
		.mockImplementation(() => undefined);
	const rejecter: { run: (reason: Error) => void } = { run: () => undefined };
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
		expect(error).toHaveBeenCalled();
	});
	expect(rowOf("New task assigned")).not.toHaveClass(styles.unread);
	error.mockRestore();
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
	render(() => <NotificationList inbox={inbox} onClose={() => undefined} />);
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
