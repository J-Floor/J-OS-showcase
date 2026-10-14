import { Button, Icon, Select } from "@j-os/design-system";
import type { Accessor } from "solid-js";

import { SelectOptionList } from "../../shared/components/SelectOptionList.tsx";
import { ICONS } from "../../shared/icons.ts";

import styles from "./TasksPage.module.scss";
import type { ViewMode } from "./timeline/timeline.ts";

const VIEW_OPTIONS = [
	{ value: "day", title: "Day" },
	{ value: "week", title: "Week" },
	{ value: "month", title: "Month" },
];

type Option = { value: string; title: string };

/** The Tasks tab's header: the assignee filter and "New task". */
export function TasksTabActions(props: {
	options: Accessor<Option[]>;
	assignee: Accessor<string>;
	onAssigneeChange: (assignee: string) => void;
	onNewTask: () => void;
}) {
	return (
		<div class={styles.taskControls}>
			<Select.Root
				options={props.options()}
				value={[props.assignee()]}
				sameWidth={false}
				onValueChange={(details) => {
					props.onAssigneeChange(details.value[0]);
				}}
			>
				<SelectOptionList options={props.options()} />
			</Select.Root>
			<Button onClick={props.onNewTask}>
				<Icon>{ICONS.add}</Icon> New task
			</Button>
		</div>
	);
}

/** The Projects tab's header: jump to today, the day/week/month view, and
 *  "New project". */
export function ProjectTabActions(props: {
	mode: Accessor<ViewMode>;
	onModeChange: (mode: ViewMode) => void;
	onJumpToday: () => void;
	onNewProject: () => void;
}) {
	return (
		<div class={styles.projectControls}>
			<Button variant="secondary" onClick={props.onJumpToday}>
				<Icon>today</Icon> Today
			</Button>
			<Select.Root
				options={VIEW_OPTIONS}
				value={[props.mode()]}
				onValueChange={(details) => {
					props.onModeChange(details.value[0] as ViewMode);
				}}
			>
				<SelectOptionList options={VIEW_OPTIONS} />
			</Select.Root>
			<Button onClick={props.onNewProject}>
				<Icon>{ICONS.add}</Icon> New project
			</Button>
		</div>
	);
}
