import {
	Query,
	Select,
	Skeleton,
	type SelectRootProps,
} from "@j-os/design-system";
import { createMemo } from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import { PersonOptions } from "../../../shared/components/PersonOptions.tsx";
import { useBoardLevel } from "../../../shared/data/boardLevel.tsx";
import { personFields } from "../fields.ts";

/** Picker for a guest's "hosted by" board member. Options are the active BOARD
 * board only (admins excluded); the value stored is that person's id
 * (rename-safe). When a guest only has a legacy unresolved name, pass it as
 * `placeholder` so the board sees who to re-pick. Commits immediately on change
 * (clear = null). */
export function HostSelect(
	props: Partial<
		Pick<SelectRootProps, "label" | "defaultOpen" | "autofocus">
	> & {
		value: Id<"people"> | null;
		/** The guest's legacy host name, when nobody has resolved it to a board
		 *  member yet: shown as the placeholder so the board sees who to re-pick. */
		legacyHost?: string;
		onCommit: (value: Id<"people"> | null) => void;
	}
) {
	const boardLevel = useBoardLevel();

	const board = createMemo(() =>
		(boardLevel.data() ?? []).filter((member) => member.tier === "board")
	);

	return (
		<Query.Root data={boardLevel.data()}>
			<Query.Skeleton>
				<Skeleton width="medium" />
			</Query.Skeleton>
			<Query.Content of={boardLevel.data()}>
				{() => (
					<Select.Root
						// A visible label, else "Hosted by" hidden, for a row or cell
						// that already says so.
						label={props.label ?? personFields.hostedById.label}
						labelHidden={props.label === undefined}
						placeholder={
							props.legacyHost
								? `${props.legacyHost} — re-pick`
								: "Pick a board member"
						}
						defaultOpen={props.defaultOpen}
						autofocus={props.autofocus}
						allowClearing
						value={props.value ? [props.value] : []}
						onValueChange={(details) => {
							props.onCommit(
								(details.value[0] as
									| Id<"people">
									| undefined) ?? null
							);
						}}
					>
						<PersonOptions people={board()} />
					</Select.Root>
				)}
			</Query.Content>
		</Query.Root>
	);
}
