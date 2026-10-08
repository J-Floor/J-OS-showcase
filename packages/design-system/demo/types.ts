import type { JSX } from "solid-js";

/** Supported control widget kinds. */
export type Control =
	| { type: "text"; default: string }
	| { type: "number"; default: number }
	| { type: "boolean"; default: boolean }
	| { type: "select"; options: string[]; default: string };

/** Map of prop name -> control declaration. */
export type Controls = Record<string, Control>;

/**
 * Live prop values fed to `render`. Loosely typed on purpose: stories cast at
 * the render boundary (`p.variant`) without per-prop generics. This is harness
 * glue, not the component API.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional loose harness boundary
export type PropValues = Record<string, any>;

/** A single component's playground entry (one per `*.demo.tsx` file). */
export type Demo = {
	/** Sidebar label; also the discovery key. */
	title: string;
	/** Renders the component from the live prop values. */
	render: (props: PropValues) => JSX.Element;
	/** Tweakable props, each with a default. */
	controls: Controls;
	/** Named partial prop-sets applied via the preset picker. */
	presets?: Record<string, Partial<PropValues>>;
};
