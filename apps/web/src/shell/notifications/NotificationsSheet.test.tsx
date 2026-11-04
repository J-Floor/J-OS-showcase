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

const { unread, inbox, device } = await vi.hoisted(async () => {
	const { createSignal } = await import("solid-js");
	const [pushOn, setPushOn] = createSignal(false);
	return {
		unread: { value: 0 },
		inbox: {
			rows: (): unknown[] | undefined => [],
			failed: (): boolean => false,
			canLoadMore: () => false,
			loadingMore: () => false,
			loadMoreFailed: () => false,
			loadMore: () => Promise.resolve(),
			markRead: vi.fn(),
			markAllRead: vi.fn(),
		},
		device: {
			open: undefined as (() => boolean) | undefined,
			pushOn,
			setPushOn,
			enable: () => {
				setPushOn(true);
				return Promise.resolve();
			},
		},
	};
});

vi.mock("convex-solidjs", () => ({
	useQuery: () => ({
		data: () => unread.value,
		error: () => {},
	}),
	useMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../../../convex/_generated/api", () => ({
	api: { notify: { inbox: { unreadCount: "unreadCount" } } },
}));
vi.mock("./useInbox.ts", () => ({ useInbox: () => inbox }));
vi.mock("./NotificationList.tsx", () => ({
	NotificationList: (props: { onClose: () => void }) => (
		<button
			type="button"
			data-testid="list"
			onClick={() => {
				props.onClose();
			}}
		>
			a row
		</button>
	),
}));
vi.mock("./usePushDevice.ts", () => ({
	usePushDevice: (isOpen: () => boolean) => {
		device.open = isOpen;
		return device;
	},
}));
vi.mock("./NotificationDeviceRow.tsx", () => ({
	NotificationDeviceRow: (props: {
		device: { enable: () => Promise<void> };
	}) => (
		<button
			type="button"
			data-testid="device-row"
			onClick={() => {
				void props.device.enable();
			}}
		>
			turn push on
		</button>
	),
}));
vi.mock("./NotificationCategories.tsx", () => ({
	NotificationCategories: (props: { pushOn: boolean }) => (
		<p data-testid="categories" data-push-on={String(props.pushOn)} />
	),
}));

import { NotificationsSheet } from "./NotificationsSheet.tsx";
import type { NotificationsTab } from "./notificationsState.ts";

afterEach(() => {
	cleanup();
	unread.value = 0;
	inbox.markAllRead.mockClear();
	inbox.rows = () => [];
	inbox.failed = () => false;
	device.setPushOn(false);
	device.open = undefined;
});

function renderSheet(tab: NotificationsTab = "inbox") {
	return render(() => (
		<NotificationsSheet open tab={tab} onOpenChange={() => {}} />
	));
}

function tabNamed(name: string | RegExp): HTMLElement {
	return screen.getByRole("tab", { name });
}

test("the device row sits above the Inbox and Categories tabs", () => {
	renderSheet();
	const row = screen.getByTestId("device-row");
	const inboxTab = tabNamed("Inbox");
	expect(tabNamed("Categories")).toBeInTheDocument();
	expect(
		row.compareDocumentPosition(inboxTab) & Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
});

test("opened from the bell, it lands on Inbox", () => {
	renderSheet("inbox");
	expect(tabNamed("Inbox")).toHaveAttribute("aria-selected", "true");
	expect(screen.getByTestId("list")).toBeVisible();
});

test("opened from the email link, it lands on Categories", () => {
	renderSheet("categories");
	expect(tabNamed("Categories")).toHaveAttribute("aria-selected", "true");
	expect(screen.getByTestId("categories")).toBeVisible();
});

test("each open decides the tab afresh", async () => {
	const [open, setOpen] = createSignal(true);
	const [tab, setTab] = createSignal<NotificationsTab>("categories");
	render(() => (
		<NotificationsSheet open={open()} tab={tab()} onOpenChange={setOpen} />
	));
	expect(tabNamed("Categories")).toHaveAttribute("aria-selected", "true");
	setOpen(false);
	setTab("inbox");
	setOpen(true);
	await waitFor(() => {
		expect(tabNamed("Inbox")).toHaveAttribute("aria-selected", "true");
	});
	fireEvent.click(tabNamed("Categories"));
	await waitFor(() => {
		expect(tabNamed("Categories")).toHaveAttribute("aria-selected", "true");
	});
	setOpen(false);
	setOpen(true);
	await waitFor(() => {
		expect(tabNamed("Inbox")).toHaveAttribute("aria-selected", "true");
	});
});

test("Mark all read shows on Inbox with unread notifications and marks them all", () => {
	unread.value = 2;
	renderSheet("inbox");
	fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
	expect(inbox.markAllRead).toHaveBeenCalledOnce();
});

test("no Mark all read when nothing is unread", () => {
	unread.value = 0;
	renderSheet("inbox");
	expect(
		screen.queryByRole("button", { name: "Mark all read" })
	).not.toBeInTheDocument();
});

test("no Mark all read on Categories, even with unread notifications", () => {
	unread.value = 2;
	renderSheet("categories");
	expect(
		screen.queryByRole("button", { name: "Mark all read" })
	).not.toBeInTheDocument();
});

test("the Inbox tab carries the unread count, capped like the bell", () => {
	unread.value = 3;
	renderSheet();
	expect(tabNamed("Inbox (3)")).toBeInTheDocument();
	cleanup();
	unread.value = 150;
	renderSheet();
	expect(tabNamed("Inbox (99+)")).toBeInTheDocument();
});

test("the Inbox tab has no count when nothing is unread", () => {
	unread.value = 0;
	renderSheet();
	expect(tabNamed("Inbox")).toHaveTextContent(/^Inbox$/);
});

test("the device row's push state reaches the Categories tab", async () => {
	renderSheet("categories");
	expect(screen.getByTestId("categories").dataset.pushOn).toBe("false");
	fireEvent.click(screen.getByTestId("device-row"));
	await waitFor(() => {
		expect(screen.getByTestId("categories").dataset.pushOn).toBe("true");
	});
});

test("the device hook follows the sheet's open state", () => {
	const [open, setOpen] = createSignal(false);
	render(() => (
		<NotificationsSheet open={open()} tab="inbox" onOpenChange={setOpen} />
	));
	expect(device.open?.()).toBe(false);
	setOpen(true);
	expect(device.open?.()).toBe(true);
});

test("the device row shows while the inbox is still loading", () => {
	inbox.rows = () => {};
	renderSheet("inbox");
	expect(screen.getByTestId("device-row")).toBeVisible();
	expect(tabNamed("Inbox")).toBeInTheDocument();
	// The list owns its loading and failed states (see NotificationList).
	expect(screen.getByTestId("list")).toBeInTheDocument();
});

test("opening a row closes the sheet", () => {
	const onOpenChange = vi.fn();
	render(() => (
		<NotificationsSheet open tab="inbox" onOpenChange={onOpenChange} />
	));
	fireEvent.click(screen.getByTestId("list"));
	expect(onOpenChange).toHaveBeenCalledWith(false);
});
