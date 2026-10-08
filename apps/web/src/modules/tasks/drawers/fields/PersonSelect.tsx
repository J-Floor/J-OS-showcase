import { Select, type SelectItem } from "@j-os/design-system";
import { For, type JSX } from "solid-js";

import type { Id } from "../../../../../convex/_generated/dataModel";
import type { Person } from "../../data/tasksData.tsx";

export function PersonSelect(props: {
	people: Person[];
	value?: Id<"people">;
	onChange: (id: Id<"people"> | undefined) => void;
	placeholder?: string;
}): JSX.Element {
	function options(): SelectItem[] {
		return props.people.map((p) => ({
			value: p._id,
			title: `${p.firstName} ${p.lastName}`,
		}));
	}
	return (
		<Select.Root
			options={options()}
			value={props.value ? [props.value] : []}
			placeholder={props.placeholder ?? "Select…"}
			allowClearing
			sameWidth
			onValueChange={(d) => {
				props.onChange(d.value[0] as Id<"people"> | undefined);
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
