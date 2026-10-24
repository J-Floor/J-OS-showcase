// @vitest-environment happy-dom
import { JFloorProvider, Tabs } from "@j-os/design-system";
import { MemoryRouter, Route } from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
	keyedIn,
	keyedValue,
	morphKeyOf,
} from "../../../test-stubs/morphKeys.tsx";

const DAY = 86_400_000;
const { rows } = vi.hoisted(() => ({
	rows: {
		projects: [] as unknown[],
		tasks: [] as unknown[],
	},
}));

vi.mock("./data/tasksData.tsx", () => ({
	useProjects: () => ({ data: () => rows.projects }),
	useTasks: () => ({ data: () => rows.tasks }),
	useProjectActions: () => ({
		create: vi.fn(),
		update: vi.fn(),
		remove: vi.fn(),
	}),
	useTaskActions: () => ({
		create: vi.fn(),
		update: vi.fn(),
		remove: vi.fn(),
	}),
}));
vi.mock("../../shared/data/boardLevel.tsx", () => ({
	useBoardLevel: () => ({
		data: () => [{ _id: "u1", firstName: "Ada", lastName: "Lovelace" }],
	}),
}));

import { TaskCard } from "./kanban/TaskCard.tsx";
import { TaskSheet } from "./sheets/TaskSheet.tsx";
import { ProjectsTab } from "./tabs/ProjectsTab.tsx";

type Snapshot = { names: Record<string, string>; kinds: string; title: string };

/** Each element holding a transition name, by name: its test id, else its
 *  tag and text. */
function heldNames(): Record<string, string> {
	const names: Record<string, string> = {};
	for (const element of document.querySelectorAll<HTMLElement>("*")) {
		const name = element.style.getPropertyValue("view-transition-name");
		if (name)
			names[name] =
				element.dataset.testid ??
				`${element.tagName}:${element.textContent.trim()}`;
	}
	return names;
}

function take(): Snapshot {
	return {
		names: heldNames(),
		kinds: document.documentElement.dataset.vt ?? "",
		title: document.querySelector("h2")?.textContent ?? "",
	};
}

/** A View Transitions fake whose update runs a microtask later and whose
 *  transition finishes a task after the update. */
function recordTransitions(): { old: Snapshot[]; new: Snapshot[] } {
	const seen = { old: [] as Snapshot[], new: [] as Snapshot[] };
	Object.assign(document, {
		startViewTransition: (update: () => Promise<void> | void) => {
			seen.old.push(take());
			const updated = Promise.resolve()
				.then(update)
				.then(() => {
					seen.new.push(take());
				});
			const finished = updated.then(
				() => new Promise((resolve) => setTimeout(resolve, 0))
			);
			return { finished, updateCallbackDone: updated, ready: updated };
		},
	});
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	return seen;
}

beforeEach(() => {
	vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({
		length: 1,
	} as DOMRectList);
	HTMLElement.prototype.setPointerCapture = () => {};
	if (!("ResizeObserver" in globalThis)) {
		globalThis.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
	}
	const today = Date.now();
	rows.projects = [
		{
			_id: "p1",
			_creationTime: 0,
			name: "Roof",
			leaderId: "u1",
			startDate: today - 5 * DAY,
			endDate: today + 5 * DAY,
		},
	];
	rows.tasks = [];
});

afterEach(() => {
	cleanup();
	Reflect.deleteProperty(document, "startViewTransition");
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function settle(ms = 20): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderProjectsTab() {
	return render(() => (
		<JFloorProvider>
			<MemoryRouter>
				<Route
					path="*"
					component={() => (
						<Tabs.Root value="projects">
							<Tabs.Bar />
							<ProjectsTab
								active={() => true}
								onNeedTab={() => {}}
							/>
						</Tabs.Root>
					)}
				/>
			</MemoryRouter>
		</JFloorProvider>
	));
}

function click(element: HTMLElement): void {
	fireEvent.pointerDown(element, { clientX: 10, pointerId: 1 });
	fireEvent.pointerUp(element, { clientX: 10, pointerId: 1 });
}

test("a timeline bar is a morph source: the project sheet grows out of it", async () => {
	const seen = recordTransitions();
	renderProjectsTab();
	await settle();
	const bar = document.querySelector<HTMLElement>("[title='Roof']");
	expect(bar).not.toBeNull();
	click(bar!);
	await waitFor(() => {
		expect(seen.new).toHaveLength(1);
	});
	expect(seen.new[0].kinds.split(" ")).toContain("morph-grow");
	// The bar's name flies into the sheet's title, the project's name.
	expect(seen.old[0].names["jf-morph-title"]).toContain("Roof");
	expect(seen.new[0].names["jf-morph-title"]).toBe("H2:Roof");
});

test("the project card's leader flies into the sheet's Leader row", async () => {
	const seen = recordTransitions();
	renderProjectsTab();
	await settle();
	click(screen.getByRole("button", { name: /Roof/ }));
	fireEvent.click(screen.getByRole("button", { name: /Roof/ }));
	await waitFor(() => {
		expect(seen.new).toHaveLength(1);
	});
	const part = Object.entries(seen.old[0].names).find(
		([name, holder]) =>
			name.startsWith("jf-morph-part-") && holder.includes("Ada Lovelace")
	)?.[0];
	expect(part).toMatch(/^jf-morph-part-/);
	expect(seen.new[0].names[part!]).toMatch(/^DIV:/);
	// The task count has no sheet row: nothing else flies.
	expect(
		Object.keys(seen.new[0].names).filter((name) =>
			name.startsWith("jf-morph-part-")
		)
	).toEqual([part]);
});

test("a project sheet shows the project's name, and keeps it through its close", async () => {
	const seen = recordTransitions();
	renderProjectsTab();
	await settle();
	click(screen.getByRole("button", { name: /Roof/ }));
	fireEvent.click(screen.getByRole("button", { name: /Roof/ }));
	await waitFor(() => {
		expect(seen.new).toHaveLength(1);
	});
	expect(seen.new[0].title).toBe("Roof");
	await settle();
	fireEvent.keyDown(document.activeElement ?? document.body, {
		key: "Escape",
	});
	await waitFor(() => {
		expect(seen.old).toHaveLength(2);
	});
	expect(seen.old[1].title).toBe("Roof");
	await waitFor(() => {
		expect(seen.new).toHaveLength(2);
	});
	expect(seen.new[1].title).toBe("Roof");
});

test("dragging the New row opens a create sheet that morphs out of the dragged range", async () => {
	const seen = recordTransitions();
	renderProjectsTab();
	await settle();
	// The "New" row closes the bars area, after each bar's row.
	const newRow = document.querySelector("[title='Roof']")?.parentElement
		?.parentElement?.lastElementChild as HTMLElement | null;
	expect(newRow).not.toBeNull();
	vi.spyOn(newRow!, "getBoundingClientRect").mockReturnValue({
		left: 0,
	} as DOMRect);
	fireEvent.pointerDown(newRow!, { clientX: 5, pointerId: 1 });
	fireEvent.pointerMove(newRow!, { clientX: 200, pointerId: 1 });
	fireEvent.pointerUp(newRow!, { clientX: 200, pointerId: 1 });
	await waitFor(() => {
		expect(seen.new).toHaveLength(1);
	});
	expect(seen.new[0].title).toBe("New project");
	expect(seen.new[0].kinds.split(" ")).toContain("morph-grow");
});

test("a task card's fields carry the keys of the task sheet's rows", () => {
	const people = [
		{ _id: "u1", firstName: "Ada", lastName: "Lovelace" },
	] as never;
	const projects = [{ _id: "p1", name: "Roof" }] as never;
	const task = {
		_id: "t1",
		_creationTime: 0,
		title: "Fix the gutter",
		status: "backlog",
		assigneeIds: ["u1"],
		projectId: "p1",
		dueDate: Date.parse("2026-06-22"),
	} as never;
	render(() => (
		<>
			<TaskCard
				task={task}
				people={people}
				projects={projects}
				onClick={() => {}}
			/>
			<TaskSheet
				open
				onOpenChange={() => {}}
				task={task}
				people={people}
				projects={projects}
			/>
		</>
	));
	const card = document.querySelector("article")!;
	const cardKeys = keyedIn(card).map((element) => morphKeyOf(element));
	expect(cardKeys).toEqual(["assigneeIds", "projectId", "dueDate"]);
	for (const key of cardKeys) {
		expect(
			keyedValue(document.querySelector('[role="dialog"]'), key ?? "")
		).not.toBeNull();
	}
	// The sheet's header names the task.
	expect(
		within(screen.getByRole("dialog")).getByRole("heading", {
			name: "Fix the gutter",
		})
	).toBeTruthy();
});
