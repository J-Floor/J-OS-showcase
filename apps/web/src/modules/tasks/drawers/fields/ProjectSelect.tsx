import { Select, type SelectItem } from "@j-os/design-system";
import type { JSX } from "solid-js";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { SelectOptionList } from "../../../../shared/components/SelectOptionList.tsx";
import type { Project } from "../../data/tasksData.tsx";

export function ProjectSelect(props: {
	projects: Project[];
	value?: Id<"projects">;
	onChange: (id: Id<"projects"> | undefined) => void;
}): JSX.Element {
	function options(): SelectItem[] {
		return props.projects.map((project) => ({
			value: project._id,
			title: project.name,
		}));
	}
	return (
		<Select.Root
			options={options()}
			value={props.value ? [props.value] : []}
			placeholder="No project"
			allowClearing
			sameWidth
			onValueChange={(details) => {
				props.onChange(details.value[0] as Id<"projects"> | undefined);
			}}
		>
			<SelectOptionList options={options()} />
		</Select.Root>
	);
}
