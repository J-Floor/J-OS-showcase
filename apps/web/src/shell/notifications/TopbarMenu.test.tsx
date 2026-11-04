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
import { ok } from "neverthrow";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { unread, disablePush, signOut, navigate } = vi.hoisted(() => ({
	unread: { value: 0 },
	disablePush: vi.fn(() => Promise.resolve(ok())),
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
vi.mock("../../shared/push.ts", () => ({ disablePush }));
function noSession() {
	return { data: null };
}
vi.mock("../../lib/auth.ts", () => ({
	authClient: { signOut, useSession: () => noSession },
}));
vi.mock("@solidjs/router", () => ({ useNavigate: () => navigate }));

import { AbilityProvider } from "../../lib/ability.tsx";
import { ConfirmProvider } from "../../shared/confirm.tsx";

import {
	isNotificationsOpen,
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
		cycleTheme: vi.fn(),
		signOut: vi.fn(() => Promise.resolve()),
	};
}

test("each menu item runs its own action", () => {
	const mockActions = actions();
	runTopbarAction("notifications", mockActions);
	expect(mockActions.openNotifications).toHaveBeenCalledOnce();
	runTopbarAction("theme", mockActions);
	expect(mockActions.cycleTheme).toHaveBeenCalledOnce();
	runTopbarAction("signout", mockActions);
	expect(mockActions.signOut).toHaveBeenCalledOnce();
});

test("an unknown value does nothing", () => {
	const mockActions = actions();
	runTopbarAction("nope", mockActions);
	expect(mockActions.openNotifications).not.toHaveBeenCalled();
	expect(mockActions.cycleTheme).not.toHaveBeenCalled();
	expect(mockActions.signOut).not.toHaveBeenCalled();
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

test("the bell opens the notifications sheet", () => {
	render(() => (
		<JFloorProvider>
			<NotificationsBell />
		</JFloorProvider>
	));
	fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
	expect(isNotificationsOpen()).toBe(true);
});

test("opening the menu lists its items, and Notifications opens the sheet", async () => {
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
		expect(isNotificationsOpen()).toBe(true);
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

beforeEach(() => {
	localStorage.clear();
});

async function openMenu(): Promise<void> {
	const trigger = screen.getByRole("button", { name: "More" });
	fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
	fireEvent.click(trigger);
	await screen.findByRole("menu");
}

async function themeItem(name: string): Promise<HTMLElement> {
	await openMenu();
	return screen.findByRole("menuitem", { name });
}

function choose(item: HTMLElement): void {
	fireEvent.pointerMove(item);
	fireEvent.pointerDown(item, { button: 0, pointerType: "mouse" });
	fireEvent.pointerUp(item, { button: 0, pointerType: "mouse" });
	fireEvent.click(item);
}

test("the theme item shows the current preference's icon and names the next one, and cycles", async () => {
	render(() => (
		<JFloorProvider>
			<AbilityProvider role="member">
				<TopbarMenu />
			</AbilityProvider>
		</JFloorProvider>
	));
	const steps = [
		["Switch to light theme", "brightness_auto"],
		["Switch to dark theme", "light_mode"],
		["Switch to system theme", "dark_mode"],
		["Switch to light theme", "brightness_auto"],
	] as const;
	for (const [name, icon] of steps) {
		const item = await themeItem(name);
		expect(item.querySelector("[data-icon]")).toHaveTextContent(icon);
		choose(item);
		await waitFor(() => {
			expect(screen.queryByRole("menu")).toBeNull();
		});
	}
});
