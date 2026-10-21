import { useMutation } from "convex-solidjs";

import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type { BoardLevelPerson } from "../../../../convex/lib/personViews.ts";
import { call } from "../../../lib/call.ts";
import { useQuery } from "../../../shared/data/useQuery.ts";

export type Task = Doc<"tasks">;
export type Project = Doc<"projects">;
export type Person = BoardLevelPerson;

export function useTasks() {
	return useQuery(api.tasks.list, {});
}
export function useProjects() {
	return useQuery(api.projects.list, {});
}
export function useCurrentPerson() {
	return useQuery(api.people.getCurrentPerson, {});
}

type Mutation<Args, Result> = { mutate: (args: Args) => Promise<Result> };

/** One table's create / update / remove, each a Result: the caller shows a
 *  failure where the action happened. */
function tableActions<
	CreateArgs,
	CreateResult,
	UpdateArgs,
	UpdateResult,
	RemoveId,
	RemoveResult,
>(
	create: Mutation<CreateArgs, CreateResult>,
	update: Mutation<UpdateArgs, UpdateResult>,
	remove: Mutation<{ id: RemoveId }, RemoveResult>
) {
	return {
		create: (args: CreateArgs) =>
			call(create.mutate(args), "Could not create that."),
		update: (args: UpdateArgs) =>
			call(update.mutate(args), "Could not save that change."),
		remove: (id: RemoveId) =>
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
