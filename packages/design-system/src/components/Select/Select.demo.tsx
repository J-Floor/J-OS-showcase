import { Icon, Select } from "@j-os/design-system";
import { For } from "solid-js";

import { FRAMEWORKS } from "../../../demo/fixtures.ts";
import type { Demo } from "../../../demo/types.ts";

const frameworks = FRAMEWORKS.map((framework) =>
	framework.value === "svelte" ? { ...framework, disabled: true } : framework
);

export default {
	title: "Select",
	render: (p) => (
		<Select.Root
			label={p.label}
			placeholder={p.placeholder}
			helperText={p.helperText}
			errorText={p.errorText}
			allowClearing={p.allowClearing}
			multiple={p.multiple}
			positioning={{ sameWidth: p.sameWidth }}
			invalid={p.invalid}
			required={p.required}
			disabled={p.disabled}
		>
			<For each={frameworks}>
				{(framework) =>
					p.rich ? (
						<Select.Option
							value={framework.value}
							disabled={framework.disabled}
						>
							<Icon>code</Icon>
							<Select.OptionText>
								{framework.name}
							</Select.OptionText>
							<Select.OptionDescription>
								{framework.note}
							</Select.OptionDescription>
						</Select.Option>
					) : (
						<Select.Option
							value={framework.value}
							disabled={framework.disabled}
						>
							{framework.name}
						</Select.Option>
					)
				}
			</For>
		</Select.Root>
	),
	controls: {
		label: { type: "text", default: "Framework" },
		placeholder: { type: "text", default: "Pick one" },
		helperText: { type: "text", default: "Choose your stack." },
		errorText: { type: "text", default: "Selection required." },
		allowClearing: { type: "boolean", default: true },
		multiple: { type: "boolean", default: false },
		rich: { type: "boolean", default: false },
		sameWidth: { type: "boolean", default: true },
		invalid: { type: "boolean", default: false },
		required: { type: "boolean", default: false },
		disabled: { type: "boolean", default: false },
	},
	presets: {
		Multiple: { multiple: true },
		"Rich options": { rich: true },
		Error: { invalid: true },
		Disabled: { disabled: true },
	},
} satisfies Demo;
