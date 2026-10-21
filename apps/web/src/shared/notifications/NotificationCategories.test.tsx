// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
import { ConvexError } from "convex/values";
import { afterEach, expect, test, vi } from "vitest";

const { rows, queryCalls, setPref, prefsError } = vi.hoisted(() => ({
	rows: { value: [] as unknown[] | undefined },
	queryCalls: [] as unknown[][],
	setPref: vi.fn(() => Promise.resolve(null)),
	prefsError: { value: undefined as Error | undefined },
}));

vi.mock("convex-solidjs", () => ({
	useQuery: (...args: unknown[]) => {
		queryCalls.push(args);
		return {
			data: () => rows.value,
			error: () => prefsError.value,
		};
	},
	useMutation: () => ({ mutateAsync: setPref }),
}));
vi.mock("../../../convex/_generated/api", () => ({
	api: { notify: { prefs: { mine: "mine", set: "set" } } },
}));

import { NotificationCategories } from "./NotificationCategories.tsx";

afterEach(() => {
	cleanup();
	setPref.mockClear();
	rows.value = [];
	prefsError.value = undefined;
});

const EVENTS = {
	category: "events",
	label: "Events",
	description: "Reminders before an event starts and before it ends.",
	note: "Event reminders are push only.",
	pushOnly: true,
	push: true,
	email: false,
};
const TASKS = {
	category: "tasks",
	label: "Tasks",
	description: "You are assigned a task or made lead of a project.",
	push: true,
	email: false,
};

const PUSH_OFF_HINT =
	"Turn on push notifications above to choose what gets pushed here.";

function renderCategories(isPushOn = true) {
	return render(() => <NotificationCategories pushOn={isPushOn} />);
}

function group(name: string) {
	return within(screen.getByRole("group", { name }));
}

test("shows exactly the categories the server returns for this role, with their notes", () => {
	rows.value = [EVENTS, TASKS];
	renderCategories();
	expect(screen.getByText("Events")).toBeInTheDocument();
	expect(screen.getByText("Tasks")).toBeInTheDocument();
	expect(screen.queryByText("Doors")).not.toBeInTheDocument();
	expect(
		screen.getByText("Event reminders are push only.")
	).toBeInTheDocument();
});

test("subscribes to prefs with keepPreviousData on", () => {
	rows.value = [TASKS];
	renderCategories();
	const options = queryCalls[0]?.[2] as () => { keepPreviousData: boolean };
	expect(options().keepPreviousData).toBe(true);
});

test("each category's checkboxes are grouped under its name; push-only has no Email", () => {
	rows.value = [EVENTS, TASKS];
	renderCategories();
	expect(
		group("Events").getByRole("checkbox", { name: /Push/ })
	).toBeInTheDocument();
	expect(
		group("Events").queryByRole("checkbox", { name: /Email/ })
	).not.toBeInTheDocument();
	expect(
		group("Tasks").getByRole("checkbox", { name: /Push/ })
	).toBeInTheDocument();
	expect(
		group("Tasks").getByRole("checkbox", { name: /Email/ })
	).toBeInTheDocument();
});

test("a checkbox saves that channel and keeps the other as it was", async () => {
	rows.value = [EVENTS, TASKS];
	renderCategories();
	fireEvent.click(group("Tasks").getByRole("checkbox", { name: /Push/ }));
	await waitFor(() => {
		expect(setPref).toHaveBeenCalledWith({
			category: "tasks",
			push: false,
			email: false,
		});
	});
});

test("shows a polite message when saving fails", async () => {
	setPref.mockRejectedValueOnce(new Error("boom"));
	rows.value = [TASKS];
	renderCategories();
	fireEvent.click(screen.getByRole("checkbox", { name: /Email/ }));
	expect(
		await screen.findByText("Could not save that change.")
	).toBeInTheDocument();
});

test("shows the server's reason when it refuses the change", async () => {
	setPref.mockRejectedValueOnce(
		new ConvexError({ code: "Forbidden", message: "You can't do that." })
	);
	rows.value = [TASKS];
	renderCategories();
	fireEvent.click(screen.getByRole("checkbox", { name: /Email/ }));
	expect(await screen.findByText("You can't do that.")).toBeInTheDocument();
});

test("a row's checkboxes are disabled while its save is pending", async () => {
	let finish: ((value: null) => void) | undefined;
	setPref.mockImplementationOnce(
		() =>
			new Promise<null>((resolve) => {
				finish = resolve;
			})
	);
	rows.value = [TASKS];
	renderCategories();
	fireEvent.click(screen.getByRole("checkbox", { name: /Push/ }));
	await waitFor(() => {
		expect(screen.getByRole("checkbox", { name: /Email/ })).toBeDisabled();
	});
	finish?.(null);
	await waitFor(() => {
		expect(screen.getByRole("checkbox", { name: /Email/ })).toBeEnabled();
	});
});

test("push off: Push checkboxes are disabled but keep the saved value, Email stays editable", () => {
	rows.value = [TASKS];
	renderCategories(false);
	const push = group("Tasks").getByRole("checkbox", { name: /Push/ });
	expect(push).toBeDisabled();
	expect(push).toBeChecked();
	expect(
		group("Tasks").getByRole("checkbox", { name: /Email/ })
	).toBeEnabled();
});

test("push on: Push and Email checkboxes are both editable", () => {
	rows.value = [TASKS];
	renderCategories(true);
	expect(
		group("Tasks").getByRole("checkbox", { name: /Push/ })
	).toBeEnabled();
	expect(
		group("Tasks").getByRole("checkbox", { name: /Email/ })
	).toBeEnabled();
});

test("the push-off hint shows only while push is off", () => {
	rows.value = [TASKS];
	renderCategories(false);
	expect(screen.getByText(PUSH_OFF_HINT)).toBeInTheDocument();
	cleanup();
	renderCategories(true);
	expect(screen.queryByText(PUSH_OFF_HINT)).not.toBeInTheDocument();
});

test("a failed prefs query says the settings didn't load", () => {
	rows.value = undefined;
	prefsError.value = new Error("boom");
	renderCategories();
	expect(
		screen.getByText("Couldn't load notification settings.")
	).toBeInTheDocument();
	expect(screen.queryByRole("group")).not.toBeInTheDocument();
});

test("shows a skeleton while the prefs load", () => {
	rows.value = undefined;
	const { container } = renderCategories();
	expect(container.querySelector('[data-width="long"]')).not.toBeNull();
	expect(screen.queryByRole("group")).not.toBeInTheDocument();
	expect(
		screen.queryByText("Couldn't load notification settings.")
	).not.toBeInTheDocument();
});

test("a slow failure shows next to its own category, not dropped by a later save", async () => {
	let fail: ((reason: Error) => void) | undefined;
	setPref.mockImplementationOnce(
		() =>
			new Promise<null>((_resolve, reject) => {
				fail = reject;
			})
	);
	rows.value = [EVENTS, TASKS];
	renderCategories();
	fireEvent.click(group("Tasks").getByRole("checkbox", { name: /Email/ }));
	fireEvent.click(group("Events").getByRole("checkbox", { name: /Push/ }));
	await waitFor(() => {
		expect(setPref).toHaveBeenCalledTimes(2);
	});
	await waitFor(() => {
		expect(
			group("Events").getByRole("checkbox", { name: /Push/ })
		).toBeEnabled();
	});
	fail?.(new Error("boom"));
	expect(
		await group("Tasks").findByText("Could not save that change.")
	).toBeInTheDocument();
	expect(
		group("Events").queryByText("Could not save that change.")
	).not.toBeInTheDocument();
});
