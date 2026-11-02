// @vitest-environment happy-dom
import { ShortcutPeekProvider } from "@j-os/design-system";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ConfirmProvider } from "../../../shared/confirm.tsx";
import { ShortcutPeekButton } from "../../../shared/ShortcutPeekButton.tsx";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

beforeEach(() => {
	mutate.mockResolvedValue(undefined);
});

afterEach(() => {
	cleanup();
	mutate.mockReset();
});

vi.mock("convex-solidjs", () => ({
	useMutation: () => ({ mutate }),
	useQuery: () => ({ data: () => {} }),
}));
vi.mock("../../../../../convex/_generated/api", () => ({ api: {} }));
vi.mock("../../../shared/data/boardLevel.tsx", () => ({
	useBoardLevel: () => ({ data: () => [] }),
}));
vi.mock("../data/tasksData.tsx", async (importOriginal) => ({
	...(await importOriginal<typeof import("../data/tasksData.tsx")>()),
	useProjects: () => ({ data: () => [] }),
	useTasks: () => ({ data: () => [] }),
}));

import { ProjectSheet } from "./ProjectSheet.tsx";
import { TaskSheet } from "./TaskSheet.tsx";

const task = {
	_id: "task-1",
	_creationTime: 0,
	title: "Fix the bug",
	status: "backlog",
	assigneeIds: [],
} as never;

const project = {
	_id: "project-1",
	_creationTime: 0,
	name: "Renovation",
	createdBy: "person1",
} as never;

/** Waits for the confirm dialog and presses its Delete. */
async function confirmDelete(title: string): Promise<void> {
	const dialog = await screen.findByRole("dialog", { name: title });
	fireEvent.click(
		within(dialog).getByRole("button", { name: "Delete", hidden: true })
	);
}

function renderTask(props: { task?: unknown; open?: boolean } = {}) {
	const onOpenChange = vi.fn();
	render(() => (
		<ConfirmProvider>
			<TaskSheet
				open={props.open ?? true}
				onOpenChange={onOpenChange}
				task={"task" in props ? (props.task as never) : task}
			/>
		</ConfirmProvider>
	));
	return onOpenChange;
}

function renderProject(props: { project?: unknown; open?: boolean } = {}) {
	render(() => (
		<ConfirmProvider>
			<ProjectSheet
				open={props.open ?? true}
				onOpenChange={() => {}}
				onTaskClick={() => {}}
				project={
					"project" in props ? (props.project as never) : project
				}
			/>
		</ConfirmProvider>
	));
}

test("Delete asks first, then deletes the task once", async () => {
	renderTask();
	fireEvent.keyDown(document.body, { key: "Delete" });
	await confirmDelete("Delete task?");
	await waitFor(() => {
		expect(mutate).toHaveBeenCalledTimes(1);
	});
	expect(mutate).toHaveBeenCalledWith({ id: "task-1" });
});

test("Delete is ignored while typing in the task sheet", async () => {
	renderTask();
	fireEvent.keyDown(screen.getByLabelText(/Title/), { key: "Delete" });
	await Promise.resolve();
	expect(screen.queryByRole("dialog", { name: "Delete task?" })).toBeNull();
	expect(mutate).not.toHaveBeenCalled();
});

test("Delete does nothing while the task sheet is closed", async () => {
	renderTask({ open: false });
	fireEvent.keyDown(document.body, { key: "Delete" });
	await Promise.resolve();
	expect(screen.queryByRole("dialog", { name: "Delete task?" })).toBeNull();
	expect(mutate).not.toHaveBeenCalled();
});

test("Delete does nothing on the task create form", async () => {
	renderTask({ task: undefined });
	fireEvent.keyDown(document.body, { key: "Delete" });
	await Promise.resolve();
	expect(screen.queryByRole("dialog", { name: "Delete task?" })).toBeNull();
	expect(mutate).not.toHaveBeenCalled();
});

test("the Delete task button asks first too, and names its key", async () => {
	renderTask();
	const button = screen.getByRole("button", { name: /Delete task/ });
	expect(button).toHaveAttribute("aria-keyshortcuts", "Delete");
	fireEvent.click(button);
	await confirmDelete("Delete task?");
	await waitFor(() => {
		expect(mutate).toHaveBeenCalledWith({ id: "task-1" });
	});
});

test("Mod+Enter creates the task from inside the title, once it has one", async () => {
	renderTask({ task: undefined });
	const title = screen.getByLabelText(/Title/);
	fireEvent.keyDown(title, { key: "Enter", ctrlKey: true });
	expect(mutate).not.toHaveBeenCalled();
	fireEvent.input(title, { target: { value: "Write the report" } });
	fireEvent.keyDown(title, { key: "Enter", ctrlKey: true });
	await waitFor(() => {
		expect(mutate).toHaveBeenCalledTimes(1);
	});
	expect(mutate).toHaveBeenCalledWith(
		expect.objectContaining({ title: "Write the report" })
	);
});

test("Mod+Enter does nothing on an open task, or a closed create form", () => {
	renderTask();
	fireEvent.keyDown(document.body, { key: "Enter", ctrlKey: true });
	cleanup();
	renderTask({ task: undefined, open: false });
	fireEvent.keyDown(document.body, { key: "Enter", ctrlKey: true });
	expect(mutate).not.toHaveBeenCalled();
});

test("the Create task button shows its key's chip while peeking", () => {
	const [open] = createSignal(true);
	render(() => (
		<ShortcutPeekProvider>
			<ShortcutPeekButton />
			<TaskSheet open={open()} onOpenChange={() => {}} />
		</ShortcutPeekProvider>
	));
	const create = screen.getByRole("button", { name: /Create task/ });
	expect(create).toHaveAttribute("aria-keyshortcuts");
	expect(create.querySelector("kbd")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: /shortcut/i }));
	expect(create.querySelector("kbd")).not.toBeNull();
});

test("Delete asks first, then deletes the project once", async () => {
	renderProject();
	fireEvent.keyDown(document.body, { key: "Delete" });
	await confirmDelete("Delete project?");
	await waitFor(() => {
		expect(mutate).toHaveBeenCalledTimes(1);
	});
	expect(mutate).toHaveBeenCalledWith({ id: "project-1" });
});

test("Delete is ignored while typing in the project sheet", async () => {
	renderProject();
	fireEvent.keyDown(screen.getByPlaceholderText("Project name"), {
		key: "Delete",
	});
	await Promise.resolve();
	expect(
		screen.queryByRole("dialog", { name: "Delete project?" })
	).toBeNull();
	expect(mutate).not.toHaveBeenCalled();
});

test("Delete does nothing while the project sheet is closed", async () => {
	renderProject({ open: false });
	fireEvent.keyDown(document.body, { key: "Delete" });
	await Promise.resolve();
	expect(
		screen.queryByRole("dialog", { name: "Delete project?" })
	).toBeNull();
	expect(mutate).not.toHaveBeenCalled();
});

test("Mod+Enter creates the project from inside the name, once it has one", async () => {
	renderProject({ project: undefined });
	const name = screen.getByPlaceholderText("Project name");
	fireEvent.keyDown(name, { key: "Enter", ctrlKey: true });
	expect(mutate).not.toHaveBeenCalled();
	fireEvent.input(name, { target: { value: "Garden" } });
	fireEvent.keyDown(name, { key: "Enter", ctrlKey: true });
	await waitFor(() => {
		expect(mutate).toHaveBeenCalledTimes(1);
	});
	expect(mutate).toHaveBeenCalledWith(
		expect.objectContaining({ name: "Garden" })
	);
});

test("the Delete project button names its key", () => {
	renderProject();
	expect(
		screen.getByRole("button", { name: /Delete project/ })
	).toHaveAttribute("aria-keyshortcuts", "Delete");
});
