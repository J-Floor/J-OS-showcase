import {
	Button,
	Icon,
	Select,
	type SelectOptionProps,
} from "@j-os/design-system";
import { For, type Accessor } from "solid-js";

import { ICONS } from "../../shared/icons.ts";

import styles from "./TasksPage.module.scss";
import { VIEW_OPTIONS, type ViewMode } from "./timeline/timeline.ts";

/** One picker entry: the value it sets and the text it shows. */
type Option = Required<Pick<SelectOptionProps, "value" | "label">>;

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
				label="Assignee"
				labelHidden
				value={[props.assignee()]}
				onValueChange={(details) => {
					props.onAssigneeChange(details.value[0]);
				}}
			>
				<For each={props.options()}>
					{(option) => (
						<Select.Option value={option.value}>
							{option.label}
						</Select.Option>
					)}
				</For>
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
				label="View"
				labelHidden
				value={[props.mode()]}
				onValueChange={(details) => {
					const next = VIEW_OPTIONS.find(
						(option) => option.value === details.value[0]
					);
					if (next) props.onModeChange(next.value);
				}}
			>
				<For each={VIEW_OPTIONS}>
					{(option) => (
						<Select.Option value={option.value}>
							{option.label}
						</Select.Option>
					)}
				</For>
			</Select.Root>
			<Button onClick={props.onNewProject}>
				<Icon>{ICONS.add}</Icon> New project
			</Button>
		</div>
	);
}
