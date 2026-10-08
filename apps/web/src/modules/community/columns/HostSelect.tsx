import { Select } from "@j-os/design-system";
import { For, createMemo } from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import { useBoardLevel } from "../../../shared/data/boardLevel.tsx";

/** Picker for a guest's "hosted by" board member. Options are the active BOARD
 * board only (admins excluded); the value stored is that person's id
 * (rename-safe). When a guest only has a legacy unresolved name, pass it as
 * `placeholder` so the board sees who to re-pick. Commits immediately on change
 * (clear = null). */
export function HostSelect(props: {
	value: Id<"people"> | null;
	onCommit: (value: Id<"people"> | null) => void;
	placeholder?: string;
	label?: string;
	/** Open the list as soon as it mounts. Used by the Guests table, where the
	 *  picker is only mounted once the board clicks the cell — without this,
	 *  swapping the real control in would cost them a second click. */
	defaultOpen?: boolean;
	/** Focus the trigger on mount, for the same swap-in. */
	autoFocus?: boolean;
}) {
	const boardLevel = useBoardLevel();

	const options = createMemo(() =>
		(boardLevel.data() ?? [])
			.filter((s) => s.tier === "board")
			.map((s) => ({
				value: s._id,
				title: `${s.firstName} ${s.lastName}`.trim(),
			}))
	);

	return (
		<Select.Root
			label={props.label}
			placeholder={props.placeholder ?? "Pick a board member"}
			defaultOpen={props.defaultOpen}
			autofocus={props.autoFocus}
			allowClearing
			options={options()}
			value={props.value ? [props.value] : []}
			onValueChange={(d) => {
				props.onCommit(
					(d.value[0] as Id<"people"> | undefined) ?? null
				);
			}}
		>
			<Select.Content>
				<For each={options()}>
					{(o) => <Select.Option value={o.value} title={o.title} />}
				</For>
			</Select.Content>
		</Select.Root>
	);
}
