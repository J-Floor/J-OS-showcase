// @vitest-environment happy-dom
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

const { resync } = vi.hoisted(() => ({
	resync: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../lib/push.ts", () => ({ resyncPush: resync }));
vi.mock("./NotificationsDrawer.tsx", () => ({
	NotificationsDrawer: (p: { open: boolean; tab: string }) => (
		<div data-testid="drawer" data-open={String(p.open)} data-tab={p.tab} />
	),
}));

import { NotificationsHost } from "./NotificationsHost.tsx";
import {
	notificationsTab,
	openNotifications,
	setNotificationsOpen,
} from "./notificationsState.ts";

afterEach(() => {
	cleanup();
	setNotificationsOpen(false);
	resync.mockClear();
});

function renderAt(url: string) {
	const history = createMemoryHistory();
	history.set({ value: url, replace: true });
	render(() => (
		<MemoryRouter history={history}>
			<Route
				path="*"
				component={NotificationsHost}
				info={{ title: "Page" }}
			/>
		</MemoryRouter>
	));
	return history;
}

test("?notifications=open opens the drawer and removes the param", async () => {
	const history = renderAt("/tasks?notifications=open");
	await waitFor(() => {
		expect(screen.getByTestId("drawer").dataset.open).toBe("true");
	});
	await waitFor(() => {
		expect(history.get()).toMatch(/^\/tasks\??$/);
	});
});

test("only the notifications param is stripped from the URL", async () => {
	const history = renderAt("/tasks?a=1&notifications=open");
	await waitFor(() => {
		expect(screen.getByTestId("drawer").dataset.open).toBe("true");
	});
	await waitFor(() => {
		expect(history.get()).toBe("/tasks?a=1");
	});
});

test("without the param the drawer stays shut", () => {
	renderAt("/tasks");
	expect(screen.getByTestId("drawer").dataset.open).toBe("false");
});

test("re-syncs this device's push subscription on mount", () => {
	renderAt("/tasks");
	expect(resync).toHaveBeenCalledOnce();
});

test("the email footer's deep link opens the drawer on Categories", async () => {
	renderAt("/tasks?notifications=open");
	await waitFor(() => {
		expect(notificationsTab()).toBe("categories");
	});
});

test("opening from the bell or the menu lands on Inbox", () => {
	openNotifications({ tab: "categories" });
	openNotifications();
	expect(notificationsTab()).toBe("inbox");
});

test("the deep link hands the drawer the Categories tab", async () => {
	renderAt("/tasks?notifications=open");
	await waitFor(() => {
		expect(screen.getByTestId("drawer").dataset.tab).toBe("categories");
	});
});
