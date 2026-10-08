// @vitest-environment happy-dom
import { JFloorProvider } from "@j-os/design-system";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

const { unread, disablePush, signOut, navigate } = vi.hoisted(() => ({
	unread: { value: 0 },
	disablePush: vi.fn(() => Promise.resolve()),
	signOut: vi.fn(() => Promise.resolve()),
	navigate: vi.fn(),
}));

vi.mock("convex-solidjs", () => ({
	useQuery: (
		_query: unknown,
		_args: unknown,
		options?: () => { enabled?: boolean }
	) => ({
		data: () => (options?.().enabled === false ? undefined : unread.value),
	}),
}));
vi.mock("../../../convex/_generated/api", () => ({
	api: { notify: { inbox: { unreadCount: "unreadCount" } } },
}));
vi.mock("../../lib/push.ts", () => ({ disablePush }));
vi.mock("../../lib/auth.ts", () => ({ authClient: { signOut } }));
vi.mock("@solidjs/router", () => ({ useNavigate: () => navigate }));

import { AbilityProvider } from "../../lib/ability.tsx";
import { ConfirmProvider } from "../confirm.tsx";

import {
	notificationsOpen,
	setNotificationsOpen,
} from "./notificationsState.ts";
import {
	NotificationsBell,
	runTopbarAction,
	TopbarMenu,
} from "./TopbarMenu.tsx";

afterEach(() => {
	cleanup();
	setNotificationsOpen(false);
	unread.value = 0;
	vi.clearAllMocks();
});

function actions() {
	return {
		openNotifications: vi.fn(),
		toggleTheme: vi.fn(),
		signOut: vi.fn(() => Promise.resolve()),
	};
}

test("each menu item runs its own action", () => {
	const a = actions();
	runTopbarAction("notifications", a);
	expect(a.openNotifications).toHaveBeenCalledOnce();
	runTopbarAction("theme", a);
	expect(a.toggleTheme).toHaveBeenCalledOnce();
	runTopbarAction("signout", a);
	expect(a.signOut).toHaveBeenCalledOnce();
});

test("an unknown value does nothing", () => {
	const a = actions();
	runTopbarAction("nope", a);
	expect(a.openNotifications).not.toHaveBeenCalled();
	expect(a.toggleTheme).not.toHaveBeenCalled();
	expect(a.signOut).not.toHaveBeenCalled();
});

test("renders one kebab trigger labelled More", () => {
	render(() => (
		<JFloorProvider>
			<AbilityProvider role="member">
				<TopbarMenu />
			</AbilityProvider>
		</JFloorProvider>
	));
	expect(screen.getAllByRole("button", { name: "More" })).toHaveLength(1);
});

test("the bell opens the notifications drawer", () => {
	render(() => (
		<JFloorProvider>
			<NotificationsBell />
		</JFloorProvider>
	));
	fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
	expect(notificationsOpen()).toBe(true);
});

test("opening the menu lists its items, and Notifications opens the drawer", async () => {
	render(() => (
		<JFloorProvider>
			<AbilityProvider role="member">
				<TopbarMenu />
			</AbilityProvider>
		</JFloorProvider>
	));
	const trigger = screen.getByRole("button", { name: "More" });
	fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
	fireEvent.click(trigger);
	const item = await screen.findByRole("menuitem", { name: /Notifications/ });
	expect(
		screen.getByRole("menuitem", { name: /theme/i })
	).toBeInTheDocument();
	expect(
		screen.getByRole("menuitem", { name: /Sign out/ })
	).toBeInTheDocument();
	fireEvent.pointerMove(item);
	fireEvent.pointerDown(item, { button: 0, pointerType: "mouse" });
	fireEvent.pointerUp(item, { button: 0, pointerType: "mouse" });
	fireEvent.click(item);
	await waitFor(() => {
		expect(notificationsOpen()).toBe(true);
	});
});

test("the menu opens and its trigger keeps the menu's id", async () => {
	render(() => (
		<JFloorProvider>
			<AbilityProvider role="member">
				<TopbarMenu />
			</AbilityProvider>
		</JFloorProvider>
	));
	const trigger = screen.getByRole("button", { name: "More" });
	expect(trigger.id).toMatch(/^menu:/);
	fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
	fireEvent.click(trigger);
	expect(await screen.findByRole("menu")).toBeInTheDocument();
});

test("staff get no Notifications item in the menu", async () => {
	render(() => (
		<JFloorProvider>
			<AbilityProvider role="staff">
				<TopbarMenu />
			</AbilityProvider>
		</JFloorProvider>
	));
	const trigger = screen.getByRole("button", { name: "More" });
	fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
	fireEvent.click(trigger);
	expect(
		await screen.findByRole("menuitem", { name: /Sign out/ })
	).toBeInTheDocument();
	expect(
		screen.queryByRole("menuitem", { name: /Notifications/ })
	).not.toBeInTheDocument();
});

test("the bell shows the unread count and says it in its name", () => {
	unread.value = 3;
	const { container } = render(() => (
		<JFloorProvider>
			<NotificationsBell />
		</JFloorProvider>
	));
	expect(
		screen.getByRole("button", { name: "Notifications, 3 unread" })
	).toBeInTheDocument();
	expect(container.querySelector("[data-badge]")).toHaveTextContent("3");
});

test("past the cap the bell reads 99+", () => {
	unread.value = 100;
	const { container } = render(() => (
		<JFloorProvider>
			<NotificationsBell />
		</JFloorProvider>
	));
	expect(
		screen.getByRole("button", { name: "Notifications, 99+ unread" })
	).toBeInTheDocument();
	expect(container.querySelector("[data-badge]")).toHaveTextContent("99+");
});

test("with nothing unread the bell has no badge", () => {
	unread.value = 0;
	const { container } = render(() => (
		<JFloorProvider>
			<NotificationsBell />
		</JFloorProvider>
	));
	expect(
		screen.getByRole("button", { name: "Notifications" })
	).toBeInTheDocument();
	expect(container.querySelector("[data-badge]")).toBeNull();
});

test("the kebab and its Notifications item carry the count for a member", async () => {
	unread.value = 3;
	render(() => (
		<JFloorProvider>
			<AbilityProvider role="member">
				<TopbarMenu />
			</AbilityProvider>
		</JFloorProvider>
	));
	const trigger = screen.getByRole("button", { name: "More, 3 unread" });
	fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
	fireEvent.click(trigger);
	const item = await screen.findByRole("menuitem", { name: /Notifications/ });
	expect(within(item).getByText("3")).toBeInTheDocument();
});

test("staff get no count on the kebab", () => {
	unread.value = 3;
	render(() => (
		<JFloorProvider>
			<AbilityProvider role="staff">
				<TopbarMenu />
			</AbilityProvider>
		</JFloorProvider>
	));
	expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
});

function renderMenuWithConfirm(): void {
	render(() => (
		<JFloorProvider>
			<AbilityProvider role="member">
				<ConfirmProvider>
					<TopbarMenu />
				</ConfirmProvider>
			</AbilityProvider>
		</JFloorProvider>
	));
}

async function chooseSignOutFromMenu(): Promise<void> {
	const trigger = screen.getByRole("button", { name: "More" });
	fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
	fireEvent.click(trigger);
	const item = await screen.findByRole("menuitem", { name: /Sign out/ });
	fireEvent.pointerMove(item);
	fireEvent.pointerDown(item, { button: 0, pointerType: "mouse" });
	fireEvent.pointerUp(item, { button: 0, pointerType: "mouse" });
	fireEvent.click(item);
}

test("Sign out in the menu asks first, and Cancel signs nothing out", async () => {
	renderMenuWithConfirm();
	await chooseSignOutFromMenu();
	const dialog = await screen.findByRole("dialog");
	expect(within(dialog).getByText("Sign out?")).toBeInTheDocument();
	fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
	await waitFor(() => {
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});
	expect(disablePush).not.toHaveBeenCalled();
	expect(signOut).not.toHaveBeenCalled();
});

test("confirming Sign out from the menu signs out", async () => {
	renderMenuWithConfirm();
	await chooseSignOutFromMenu();
	const dialog = await screen.findByRole("dialog");
	fireEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));
	await waitFor(() => {
		expect(signOut).toHaveBeenCalledOnce();
	});
	expect(navigate).toHaveBeenCalledWith("/signin", { replace: true });
});
