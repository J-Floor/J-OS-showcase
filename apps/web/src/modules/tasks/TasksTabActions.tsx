import {
	PHONE_QUERY,
	Select,
	createMediaQuery,
	type SelectOptionProps,
} from "@j-os/design-system";
import { For, Show, type Accessor, type JSX } from "solid-js";

import { ActionButton } from "../../shared/actions/ActionButton.tsx";
import {
	PAGE_TARGET,
	type ActionDescriptor,
	type PageTarget,
} from "../../shared/actions/shortcuts.ts";

import {
	SELECTION_TARGET,
	type BulkDelete,
} from "./kanban/kanbanInteraction.ts";
import styles from "./TasksPage.module.scss";
import { VIEW_OPTIONS, type ViewMode } from "./timeline/timeline.ts";

/** One picker entry: the value it sets and the text it shows. */
type Option = Required<Pick<SelectOptionProps, "value" | "label">>;

/** "Delete N selected", shown while cards are selected: the visible control
 *  for the Delete key. In the tab bar, so its coming and going never moves
 *  the board. Its icon gives way to the key's chip while peeking. On a
 *  phone the pill a screen wide has no room for the label at any count: the
 *  Delete shows its icon and the count, and names itself in full in its
 *  tooltip and accessible name. */
export function BulkDeleteButton(props: {
	bulkDelete: BulkDelete;
}): JSX.Element {
	const isPhone = createMediaQuery(PHONE_QUERY);
	return (
		<Show when={props.bulkDelete.action.can(SELECTION_TARGET)}>
			<ActionButton
				action={props.bulkDelete.action}
				target={SELECTION_TARGET}
				variant="secondary"
				compactLabel={
					isPhone() ? String(props.bulkDelete.count()) : undefined
				}
			/>
		</Show>
	);
}

/** The Tasks tab's header: the selected cards' Delete while there are any,
 *  the assignee filter and "New task" (`N`). On a phone the header is a
 *  floating pill a screen wide, and the three overflow it: while cards are
 *  selected, their Delete takes the filter's place. */
export function TasksTabActions(props: {
	options: Accessor<Option[]>;
	assignee: Accessor<string>;
	onAssigneeChange: (assignee: string) => void;
	newTask: ActionDescriptor<PageTarget>;
	bulkDelete: BulkDelete;
}) {
	const isPhone = createMediaQuery(PHONE_QUERY);
	function isSelecting(): boolean {
		return props.bulkDelete.action.can(SELECTION_TARGET);
	}
	return (
		<div class={styles.taskControls}>
			<BulkDeleteButton bulkDelete={props.bulkDelete} />
			<Show when={!(isPhone() && isSelecting())}>
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
			</Show>
			<ActionButton action={props.newTask} target={PAGE_TARGET} />
		</div>
	);
}

/** The Projects tab's header: jump to today (`T`), the day/week/month view,
 *  and "New project" (`P`). */
export function ProjectTabActions(props: {
	mode: Accessor<ViewMode>;
	onModeChange: (mode: ViewMode) => void;
	today: ActionDescriptor<PageTarget>;
	newProject: ActionDescriptor<PageTarget>;
}) {
	return (
		<div class={styles.projectControls}>
			<ActionButton
				variant="secondary"
				action={props.today}
				target={PAGE_TARGET}
			/>
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
			<ActionButton action={props.newProject} target={PAGE_TARGET} />
		</div>
	);
}
