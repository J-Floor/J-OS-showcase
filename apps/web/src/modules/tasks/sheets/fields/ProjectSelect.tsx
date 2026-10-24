import { Select } from "@j-os/design-system";
import { For, type JSX } from "solid-js";

import type { Id } from "../../../../../convex/_generated/dataModel";
import type { Project } from "../../data/tasksData.tsx";

export function ProjectSelect(props: {
	label: string;
	projects: Project[];
	value?: Id<"projects">;
	onChange: (id: Id<"projects"> | undefined) => void;
}): JSX.Element {
	return (
		<Select.Root
			label={props.label}
			labelHidden
			value={props.value ? [props.value] : []}
			placeholder="No project"
			allowClearing
			positioning={{ sameWidth: true }}
			onValueChange={(details) => {
				props.onChange(details.value[0] as Id<"projects"> | undefined);
			}}
		>
			<For each={props.projects}>
				{(project) => (
					<Select.Option value={project._id}>
						{project.name}
					</Select.Option>
				)}
			</For>
		</Select.Root>
	);
}
