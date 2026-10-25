import type { FunctionArgs, FunctionReference } from "convex/server";
import { useMutation } from "convex-solidjs";

import { api } from "../../../../convex/_generated/api";
import type {
	Doc,
	Id,
	TableNames,
} from "../../../../convex/_generated/dataModel";
import type { BoardLevelPerson } from "../../../../convex/lib/personViews.ts";
import { call } from "../../../lib/call.ts";
import { useQuery } from "../../../shared/data/useQuery.ts";

export type Task = Doc<"tasks">;
export type Project = Doc<"projects">;
export type Person = BoardLevelPerson;

/** The fields one task edit writes: any subset of what `tasks.update` takes. */
export type TaskPatch = Omit<FunctionArgs<typeof api.tasks.update>, "id">;
/** The fields one project edit writes. */
export type ProjectPatch = Omit<FunctionArgs<typeof api.projects.update>, "id">;

export function useTasks() {
	return useQuery(api.tasks.list, {});
}
export function useProjects() {
	return useQuery(api.projects.list, {});
}
export function useCurrentPerson() {
	return useQuery(api.people.getCurrentPerson, {});
}

type AnyMutation = FunctionReference<"mutation">;
type Mutation<Reference extends AnyMutation> = ReturnType<
	typeof useMutation<Reference>
>;
/** A mutation that removes a row by its id. */
type RemoveMutation<Table extends TableNames> = FunctionReference<
	"mutation",
	"public",
	{ id: Id<Table> }
>;

/** One table's create / update / remove, each a Result: the caller shows a
 *  failure where the action happened. */
function tableActions<
	Table extends TableNames,
	Create extends AnyMutation,
	Update extends AnyMutation,
>(
	create: Mutation<Create>,
	update: Mutation<Update>,
	remove: Mutation<RemoveMutation<Table>>
) {
	return {
		create: (args: FunctionArgs<Create>) =>
			call(create.mutate(args), "Could not create that."),
		update: (args: FunctionArgs<Update>) =>
			call(update.mutate(args), "Could not save that change."),
		remove: (id: Id<Table>) =>
			call(remove.mutate({ id }), "Could not delete that."),
	};
}

export function useTaskActions() {
	return tableActions(
		useMutation(api.tasks.create),
		useMutation(api.tasks.update),
		useMutation(api.tasks.remove)
	);
}

export function useProjectActions() {
	return tableActions(
		useMutation(api.projects.create),
		useMutation(api.projects.update),
		useMutation(api.projects.remove)
	);
}

export type TaskActions = ReturnType<typeof useTaskActions>;
export type ProjectActions = ReturnType<typeof useProjectActions>;
