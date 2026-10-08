import {
	Select as ArkSelect,
	type SelectRootProps as ArkSelectRootProps,
	createListCollection,
} from "@ark-ui/solid/select";
import clsx from "clsx";
import { type JSX, Show, splitProps } from "solid-js";
import { Portal } from "solid-js/web";

import { ICONS } from "../../icons.ts";
import { type PropsWithDisabling } from "../../utils/disablingProps.ts";
import { splitMakeFieldProps } from "../../utils/makeFieldProps.ts";
import { splitArkProps } from "../../utils/splitArkProps.ts";
import { Icon, type IconProps } from "../Icon/Icon.tsx";
import { List } from "../List/List.tsx";
import { MakeField, type MakeFieldProps } from "../MakeField/MakeField.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

import styles from "./Select.module.scss";

/**
 * A single selectable item. Provided to `Select.Root` via the `options` prop so
 * ark can build its collection (a11y + value mapping), and mirrored by the
 * `<Select.Option>` children that actually render. At least one of
 * `title`/`description` must be set.
 */
export type SelectItem = {
	value: string;
	title?: string;
	description?: string;
	leadingIconName?: IconProps["children"];
	disabled?: boolean;
};

export type SelectRootProps = PropsWithDisabling<
	MakeFieldProps & {
		/** The selectable items used to build the ark collection (rendering comes from children). */
		options: SelectItem[];
		/** Make the options take the same width as the trigger. */
		sameWidth?: boolean;
		/** Show a clear control when a value is selected. */
		allowClearing?: boolean;
		/** Placeholder shown when no value is selected. */
		placeholder?: string;
		/** The `<Select.Content>` (and its `<Select.Option>` / `<Select.OptionsGroup>` children). */
		children?: JSX.Element;
	} & Omit<
			ArkSelectRootProps<SelectItem>,
			"collection" | "asChild" | "class" | "children"
		>
>;

/**
 * Select field. Ported from EmboUI's Select with the J-OS design-system
 * conventions: ark's `Select.*` is never exposed; the compound wrappers
 * (`Root` / `Content` / `Option` / `OptionsGroup`) are. There is **no slot
 * extraction** — the consumer places `<Select.Option>` children that render in
 * place; the `options` prop is used *only* to build the ark `createListCollection`
 * (required for a11y/value mapping).
 *
 * React→Solid: `useRef`(DOM) → `let el!: …; ref={el}`; `useMemo`/`React.Children`
 * dropped (the collection comes from the explicit `options` prop instead of
 * parsing children); ark `asChild` is a render-prop function in Solid; `Portal`
 * from `solid-js/web`; `onlyArkProps` → `splitArkProps`.
 *
 * @example
 * ```tsx
 * <Select.Root label="Framework" options={opts} onValueChange={(d) => …}>
 *   <Select.Content>
 *     <Select.Option value="a" title="Alpha" />
 *     <Select.Option value="b" title="Beta" />
 *   </Select.Content>
 * </Select.Root>
 * ```
 */
function Root(props: SelectRootProps): JSX.Element {
	// eslint-disable-next-line no-unassigned-vars -- assigned by Solid's `ref={triggerEl}` binding below, which the rule can't see
	let triggerEl: HTMLButtonElement | undefined;

	const [own, rest] = splitArkProps(props, [
		"options",
		"sameWidth",
		"allowClearing",
		"placeholder",
		"children",
	]);
	// MakeField props (label/helper/error + semantics + the full disabling set,
	// incl. disabledReason → the dim + reason tooltip) route to MakeField; the
	// rest spreads on ArkSelect.Root. `disabled`/`required` are re-forwarded to
	// the ark Root below (it is not a Field.* part, so it doesn't inherit them).
	const [makeFieldProps, arkRest] = splitMakeFieldProps(rest);

	function collection(): ReturnType<typeof createListCollection<SelectItem>> {
		return createListCollection({
			items: own.options,
			itemToString: (item) =>
				item.title ?? item.description ?? item.value,
			itemToValue: (item) => item.value,
			isItemDisabled: (item) => item.disabled ?? false,
		});
	}

	function focusTrigger(): void {
		triggerEl?.focus();
	}

	return (
		<MakeField
			{...makeFieldProps}
			onLabelClicked={focusTrigger}
			focusField={focusTrigger}
		>
			<ArkSelect.Root
				// Content builds on first open. No `unmountOnExit`: the close is a CSS
				// transition, which unmounting would cut off.
				lazyMount
				{...arkRest}
				disabled={makeFieldProps.disabled}
				required={makeFieldProps.required}
				collection={collection()}
				positioning={{ sameWidth: own.sameWidth ?? false }}
			>
				<ArkSelect.Control>
					<ArkSelect.Trigger
						ref={triggerEl}
						class={styles.inputWrapper}
					>
						<ArkSelect.ValueText
							placeholder={own.placeholder}
							class={styles.value}
						/>
						<ArkSelect.Context>
							{(context) => (
								<>
									<Show
										when={
											context().value.length > 0 &&
											own.allowClearing
										}
									>
										<Tooltip
											tooltipContent="Clear value"
											class={styles.clearTrigger}
											aria-label="Clear value"
											onClick={() => {
												context().clearValue();
											}}
										>
											<Icon>{ICONS.close}</Icon>
										</Tooltip>
									</Show>
									<ArkSelect.Indicator class={styles.icon}>
										<Icon>
											{context().open
												? ICONS.collapseAll
												: ICONS.expandAll}
										</Icon>
									</ArkSelect.Indicator>
								</>
							)}
						</ArkSelect.Context>
					</ArkSelect.Trigger>
				</ArkSelect.Control>
				{own.children}
			</ArkSelect.Root>
		</MakeField>
	);
}

/**
 * Wraps `ArkSelect.Positioner > Content` (portalled) and renders its placed
 * `<Select.Option>` / `<Select.OptionsGroup>` children directly — no slot
 * extraction.
 */
function Content(props: ArkSelect.ContentProps): JSX.Element {
	return (
		<Portal>
			<ArkSelect.Positioner class={styles.positioner}>
				<ArkSelect.Content
					{...props}
					class={clsx(styles.content, props.class)}
				>
					<List.Root>{props.children}</List.Root>
				</ArkSelect.Content>
			</ArkSelect.Positioner>
		</Portal>
	);
}

/** A single option. Wraps `ArkSelect.Item` + `List.Item` rendering. */
function Option(props: SelectItem): JSX.Element {
	return (
		<ArkSelect.Item item={props} class={styles.item}>
			<List.Item>
				<Show when={props.leadingIconName}>
					<List.ItemLeftIcon>
						{props.leadingIconName!}
					</List.ItemLeftIcon>
				</Show>
				<Show when={props.title}>
					<List.ItemTitle>{props.title!}</List.ItemTitle>
				</Show>
				<Show when={props.description}>
					<List.ItemDescription>
						{props.description!}
					</List.ItemDescription>
				</Show>
				<ArkSelect.ItemIndicator class={styles.itemIndicator}>
					<Icon>{ICONS.check}</Icon>
				</ArkSelect.ItemIndicator>
			</List.Item>
		</ArkSelect.Item>
	);
}

/** A labelled group of options. Wraps `ArkSelect.ItemGroup` + label. */
function OptionsGroup(
	props: ArkSelect.ItemGroupProps & { label: string }
): JSX.Element {
	const [own, rest] = splitProps(props, ["label", "children", "class"]);
	return (
		<ArkSelect.ItemGroup
			{...rest}
			class={clsx(styles.itemGroup, own.class)}
		>
			<ArkSelect.ItemGroupLabel class={styles.groupLabel}>
				{own.label}
			</ArkSelect.ItemGroupLabel>
			{own.children}
		</ArkSelect.ItemGroup>
	);
}

export const Select = {
	Root,
	Content,
	Option,
	OptionsGroup,
};
