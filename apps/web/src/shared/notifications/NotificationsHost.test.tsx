// @vitest-environment happy-dom
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import { ok } from "neverthrow";
import { afterEach, expect, test, vi } from "vitest";

const { resync } = vi.hoisted(() => ({
	resync: vi.fn(() => Promise.resolve(ok())),
}));
vi.mock("../../lib/push.ts", () => ({ resyncPush: resync }));
vi.mock("./NotificationsSheet.tsx", () => ({
	NotificationsSheet: (props: { open: boolean; tab: string }) => (
		<div
			data-testid="sheet"
			data-open={String(props.open)}
			data-tab={props.tab}
		/>
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

test("?notifications=open opens the sheet and removes the param", async () => {
	const history = renderAt("/tasks?notifications=open");
	await waitFor(() => {
		expect(screen.getByTestId("sheet").dataset.open).toBe("true");
	});
	await waitFor(() => {
		expect(history.get()).toMatch(/^\/tasks\??$/);
	});
});

test("only the notifications param is stripped from the URL", async () => {
	const history = renderAt("/tasks?a=1&notifications=open");
	await waitFor(() => {
		expect(screen.getByTestId("sheet").dataset.open).toBe("true");
	});
	await waitFor(() => {
		expect(history.get()).toBe("/tasks?a=1");
	});
});

test("without the param the sheet stays shut", () => {
	renderAt("/tasks");
	expect(screen.getByTestId("sheet").dataset.open).toBe("false");
});

test("re-syncs this device's push subscription on mount", () => {
	renderAt("/tasks");
	expect(resync).toHaveBeenCalledOnce();
});

test("the email footer's deep link opens the sheet on Categories", async () => {
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

test("the deep link hands the sheet the Categories tab", async () => {
	renderAt("/tasks?notifications=open");
	await waitFor(() => {
		expect(screen.getByTestId("sheet").dataset.tab).toBe("categories");
	});
});
