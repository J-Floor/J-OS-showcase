import type { CommandPaletteItem } from "@j-os/design-system";
import { useNavigate } from "@solidjs/router";
import { Show, createEffect, type JSX } from "solid-js";

import { useAbility } from "../../lib/ability.tsx";

import {
	entityPath,
	slugOf,
	type EntityDescriptor,
} from "./entityDescriptor.ts";

export type Emit = (items: CommandPaletteItem[]) => void;

/**
 * Emits the descriptor's live rows as palette items. Split out from
 * `EntitySource` so `useRows()` (and whatever query it wraps) is only ever
 * constructed by `<Show>` once the ability check has already passed — a
 * conditional `if` inside `EntitySource` itself would still call `useRows()`
 * during that one component-body pass, since Solid components run their body
 * once and never re-invoke it when a signal it plainly read changes.
 */
function EntitySourceRows<Row extends { _id: string }>(props: {
	descriptor: EntityDescriptor<Row>;
	emit: Emit;
}): JSX.Element {
	// One-time setup, not a reactive prop read: `descriptor` is fixed for this
	// component instance (a different descriptor mounts a different `<Show>`
	// child), and `useRows()` is a hook factory that must be called exactly
	// once during setup, like `useQuery` itself.
	const navigate = useNavigate();
	// eslint-disable-next-line solid/reactivity -- one-time hook-factory call, not a reactive prop read
	const rows = props.descriptor.useRows();

	createEffect(() => {
		const desc = props.descriptor;
		props.emit(
			(rows() ?? []).map((row) => ({
				value: `${desc.key}:${slugOf(desc, row)}`,
				label: desc.label(row),
				group: desc.group,
				icon: desc.icon,
				keywords: desc.keywords?.(row),
				detail: desc.detail?.(row),
				searchOnly: desc.searchOnly ?? true,
				onSelect: () => {
					navigate(entityPath(desc, row));
				},
			}))
		);
	});
	return null;
}

/**
 * Generic command-palette source for one entity descriptor — replaces the
 * per-module `PeopleSource`/`WorkSource`/`EventsSource`. Gated on the
 * descriptor's own ability, exactly like those did: a role that cannot
 * `desc.ability.action` `desc.ability.subject` never mounts `useRows()`, so
 * its query is never subscribed and it never emits.
 */
export function EntitySource<Row extends { _id: string }>(props: {
	descriptor: EntityDescriptor<Row>;
	emit: Emit;
}): JSX.Element {
	const ability = useAbility();
	return (
		<Show
			when={ability().can(
				props.descriptor.ability.action,
				props.descriptor.ability.subject
			)}
		>
			<EntitySourceRows descriptor={props.descriptor} emit={props.emit} />
		</Show>
	);
}
