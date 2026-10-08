import { Select, type SelectItem } from "@j-os/design-system";
import { For, type JSX } from "solid-js";

import type { Id } from "../../../../../convex/_generated/dataModel";
import type { Person } from "../../data/tasksData.tsx";

export function AssigneeSelect(props: {
	people: Person[];
	value: Id<"people">[];
	onChange: (ids: Id<"people">[]) => void;
}): JSX.Element {
	function options(): SelectItem[] {
		return props.people.map((p) => ({
			value: p._id,
			title: `${p.firstName} ${p.lastName}`,
		}));
	}
	return (
		<Select.Root
			multiple
			options={options()}
			value={props.value}
			placeholder="Add assignees…"
			sameWidth
			onValueChange={(d) => {
				props.onChange(d.value as Id<"people">[]);
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
