import clsx from "clsx";

/** Key suffix appended to a part name to form its override prop, e.g. `content` -> `contentClass`. */
type PartClassKey<Part extends string> = `${Part}Class`;

/** Map of per-part class overrides, e.g. `{ contentClass?: string; positionerClass?: string }`. */
export type PartClasses<Part extends string> = {
	[P in Part as PartClassKey<P>]?: string;
};

/** Mixin: adds an optional `classOverride` map for the given parts to a props type. */
export type WithPartClasses<Part extends string> = {
	classOverride?: PartClasses<Part>;
};

/**
 * Merge the CSS-module class for a part with an optional per-part consumer override.
 * Ports EmboUI's `getPartStyles`: `clsx(styles[part], props.classOverride?.[`${part}Class`])`.
 */
export function getPartStyles<Part extends string>(
	styles: Record<string, string>,
	props: WithPartClasses<Part>,
	part: Part
): string {
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- narrows the key from `string` to the mapped-type key so it can index PartClasses
	const overrideKey = `${part}Class` as PartClassKey<Part>;
	const override = props.classOverride?.[overrideKey] as string | undefined;
	return clsx(styles[part], override);
}
