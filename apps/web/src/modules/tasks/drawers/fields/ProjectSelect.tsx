import { Select, type SelectItem } from "@j-os/design-system";
import { For, type JSX } from "solid-js";

import type { Id } from "../../../../../convex/_generated/dataModel";
import type { Project } from "../../data/tasksData.tsx";

export function ProjectSelect(props: {
	projects: Project[];
	value?: Id<"projects">;
	onChange: (id: Id<"projects"> | undefined) => void;
}): JSX.Element {
	function options(): SelectItem[] {
		return props.projects.map((p) => ({ value: p._id, title: p.name }));
	}
	return (
		<Select.Root
			options={options()}
			value={props.value ? [props.value] : []}
			placeholder="No project"
			allowClearing
			sameWidth
			onValueChange={(d) => {
				props.onChange(d.value[0] as Id<"projects"> | undefined);
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
