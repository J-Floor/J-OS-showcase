import { useMutation, useQuery } from "convex-solidjs";

import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { BoardLevelPerson } from "../../../../convex/lib/personViews.ts";

export type Task = Doc<"tasks">;
export type Project = Doc<"projects">;
export type Person = BoardLevelPerson;

export function useTasks() {
	return useQuery(api.tasks.list, {}, { keepPreviousData: true });
}
export function useProjects() {
	return useQuery(api.projects.list, {}, { keepPreviousData: true });
}
export function useCurrentPerson() {
	return useQuery(
		api.people.getCurrentPerson,
		{},
		{ keepPreviousData: true }
	);
}

export function useTaskActions() {
	const create = useMutation(api.tasks.create);
	const update = useMutation(api.tasks.update);
	const remove = useMutation(api.tasks.remove);
	return {
		create: (args: Parameters<typeof create.mutate>[0]) =>
			create.mutate(args),
		update: (args: Parameters<typeof update.mutate>[0]) =>
			update.mutate(args),
		remove: (id: Id<"tasks">) => remove.mutate({ id }),
	};
}

export function useProjectActions() {
	const create = useMutation(api.projects.create);
	const update = useMutation(api.projects.update);
	const remove = useMutation(api.projects.remove);
	return {
		create: (args: Parameters<typeof create.mutate>[0]) =>
			create.mutate(args),
		update: (args: Parameters<typeof update.mutate>[0]) =>
			update.mutate(args),
		remove: (id: Id<"projects">) => remove.mutate({ id }),
	};
}
