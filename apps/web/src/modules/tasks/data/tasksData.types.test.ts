import type { FunctionArgs } from "convex/server";
import { describe, expectTypeOf, it } from "vitest";

import type { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

import type {
	ProjectActions,
	ProjectPatch,
	TaskActions,
	TaskPatch,
} from "./tasksData.tsx";

describe("sheet patches", () => {
	it("a task patch is what tasks.update takes, minus the id", () => {
		expectTypeOf<TaskPatch>().toEqualTypeOf<
			Omit<FunctionArgs<typeof api.tasks.update>, "id">
		>();
		expectTypeOf<{ status: "done" }>().toExtend<TaskPatch>();
		expectTypeOf<{ projectId: null }>().toExtend<TaskPatch>();
	});

	it("rejects a misspelt or wrongly typed task field", () => {
		expectTypeOf<{ titel: string }>().not.toExtend<TaskPatch>();
		expectTypeOf<{ status: "finished" }>().not.toExtend<TaskPatch>();
		expectTypeOf<{ id: string }>().not.toExtend<TaskPatch>();
	});

	it("a project patch is what projects.update takes, minus the id", () => {
		expectTypeOf<ProjectPatch>().toEqualTypeOf<
			Omit<FunctionArgs<typeof api.projects.update>, "id">
		>();
		expectTypeOf<{ startDate: null }>().toExtend<ProjectPatch>();
		expectTypeOf<{ strtDate: number }>().not.toExtend<ProjectPatch>();
	});
});

describe("table actions keep the real argument types", () => {
	it("update takes the mutation's args, remove the row's id", () => {
		type TaskUpdate = Parameters<TaskActions["update"]>[0];
		type ProjectUpdate = Parameters<ProjectActions["update"]>[0];
		expectTypeOf<TaskUpdate>().toExtend<
			FunctionArgs<typeof api.tasks.update>
		>();
		expectTypeOf<
			FunctionArgs<typeof api.tasks.update>
		>().toExtend<TaskUpdate>();
		expectTypeOf<ProjectUpdate>().toExtend<
			FunctionArgs<typeof api.projects.update>
		>();
		expectTypeOf<
			FunctionArgs<typeof api.projects.update>
		>().toExtend<ProjectUpdate>();
		expectTypeOf<Parameters<TaskActions["remove"]>[0]>().toEqualTypeOf<
			Id<"tasks">
		>();
		expectTypeOf<Parameters<ProjectActions["remove"]>[0]>().toEqualTypeOf<
			Id<"projects">
		>();
	});
});
