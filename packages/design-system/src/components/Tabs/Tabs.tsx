import { Tabs as ArkTabs } from "@ark-ui/solid";
import clsx from "clsx";
import { Show, splitProps, type JSX } from "solid-js";

import styles from "./Tabs.module.scss";

/**
 * Binds the active tab to a URL search param. The component owns the
 * read/validate/write logic; the consumer injects the router primitives
 * (`get`/`set`), so `Tabs` itself stays router-agnostic. `K` is the union of
 * valid tab values, so `fallback`/`keys`/`set` are all checked against it.
 */
export type TabsUrlParam<K extends string = string> = {
	/** Reads the current raw param value (a router getter). A repeated param
	 * (`string[]`) or absent param falls back. */
	get: () => string | string[] | undefined;
	/** Writes the param (a router setter). */
	set: (value: K) => void;
	/** Value used when the param is absent or not listed in `keys`. */
	fallback: K;
	/** Allowed values. A param outside this set falls back. */
	keys?: readonly K[];
};

function Root<K extends string = string>(
	props: ArkTabs.RootProps & { value?: K; urlParam?: TabsUrlParam<K> }
) {
	const [local, rest] = splitProps(props, ["urlParam"]);

	// With `urlParam`, the active tab is derived from the URL and writes flow
	// back through the injected setter. Without it, behave as a plain Ark Root.
	function value(): string | undefined {
		const urlParam = local.urlParam;
		if (!urlParam) return rest.value ?? undefined;
		const current = urlParam.get();
		return typeof current === "string" &&
			(!urlParam.keys ||
				(urlParam.keys as readonly string[]).includes(current))
			? current
			: urlParam.fallback;
	}

	return (
		<ArkTabs.Root
			{...rest}
			value={value()}
			onValueChange={(details) => {
				local.urlParam?.set(details.value as K);
				rest.onValueChange?.(details);
			}}
		/>
	);
}

function List(props: ArkTabs.ListProps) {
	return (
		<ArkTabs.List {...props} class={clsx(styles.list, props.class)}>
			<ArkTabs.Indicator class={styles.indicator} />
			{props.children}
		</ArkTabs.List>
	);
}

function Trigger(props: ArkTabs.TriggerProps) {
	return (
		<ArkTabs.Trigger {...props} class={clsx(styles.trigger, props.class)}>
			{props.children}
		</ArkTabs.Trigger>
	);
}

function Content(props: ArkTabs.ContentProps) {
	return (
		<ArkTabs.Content {...props} class={clsx(styles.content, props.class)}>
			{props.children}
		</ArkTabs.Content>
	);
}

/**
 * Declarative, tab-scoped slot for tab-bar controls — the sibling of
 * `Content`, but for the bar instead of the panel. Renders its children only
 * while `value` is the active tab, reading the active value from the tabs
 * machine (so it follows the same source of truth as the triggers). Place it
 * inside the tab bar, wherever the controls should sit.
 */
function Actions(props: { value: string; children: JSX.Element }) {
	return (
		<ArkTabs.Context>
			{(api) => (
				<Show when={api().value === props.value}>{props.children}</Show>
			)}
		</ArkTabs.Context>
	);
}

export const Tabs = {
	Root,
	List,
	Trigger,
	Content,
	Actions,
};
