import { Checkbox, Input, NumberInput, Select } from "@j-os/design-system";
import { For, type JSX } from "solid-js";

import type { Control, Demo } from "./types.ts";

import styles from "./playground.module.scss";

type ControlValue = string | number | boolean;

function ControlWidget(props: {
	name: string;
	control: Control;
	value: ControlValue;
	onChange: (value: ControlValue) => void;
}): JSX.Element {
	const control = props.control;
	switch (control.type) {
		case "text":
			return (
				<Input
					label={props.name}
					value={String(props.value)}
					onValueChange={(event) => props.onChange(event.currentTarget.value)}
				/>
			);
		case "number":
			return (
				<NumberInput
					label={props.name}
					value={String(props.value)}
					onValueChange={(details) => props.onChange(details.valueAsNumber)}
				/>
			);
		case "boolean":
			return (
				<Checkbox
					checked={Boolean(props.value)}
					onCheckedChange={(details) => props.onChange(details.checked === true)}
				>
					{props.name}
				</Checkbox>
			);
		case "select":
			return (
				<Select.Root
					label={props.name}
					sameWidth
					options={control.options.map((value) => ({ value, title: value }))}
					value={[String(props.value)]}
					onValueChange={(details) => props.onChange(details.value[0])}
				>
					<Select.Content>
						<For each={control.options}>
							{(option) => <Select.Option value={option} title={option} />}
						</For>
					</Select.Content>
				</Select.Root>
			);
	}
}

export function ControlsPanel(props: {
	story: Demo;
	state: Record<string, ControlValue>;
	set: (key: string, value: ControlValue) => void;
	presetNames: string[];
	onPreset: (name: string) => void;
}): JSX.Element {
	return (
		<div class={styles.controls}>
			<Select.Root
				label="Preset"
				sameWidth
				placeholder="Default"
				options={props.presetNames.map((value) => ({ value, title: value }))}
				onValueChange={(details) => props.onPreset(details.value[0])}
			>
				<Select.Content>
					<For each={props.presetNames}>
						{(name) => <Select.Option value={name} title={name} />}
					</For>
				</Select.Content>
			</Select.Root>

			<div class={styles.controlList}>
				<For each={Object.entries(props.story.controls)}>
					{([key, control]) => (
						<ControlWidget
							name={key}
							control={control}
							value={props.state[key]}
							onChange={(value) => props.set(key, value)}
						/>
					)}
				</For>
			</div>
		</div>
	);
}
