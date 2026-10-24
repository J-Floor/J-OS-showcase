import type { Hotkey, Modifier } from "@tanstack/solid-hotkeys";
import type { JSX } from "solid-js";

import type { MakeFieldProps } from "../components/MakeField/MakeField.tsx";

/** `Omit` that distributes over a union: the built-in `Omit` keeps only the
 *  keys common to every member, so a union (a `PropsWithDisabling` props
 *  type) flattens and no longer spreads back into its component. */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
	? Omit<T, K>
	: never;

/**
 * The props MakeField adds around a control, shared by every field.
 *
 * MakeField extends Field.Root's div-typed HTML props, which collide with the
 * control's own (`ref`, `onInput`, `children`, event handlers). A field keeps
 * MakeField's additions and Field's semantic props, and lets the control own
 * the DOM attributes.
 */
export type MakeFieldOwnProps = Omit<
	MakeFieldProps,
	keyof JSX.HTMLAttributes<HTMLDivElement>
>;

/** A key a control answers to: a registrable hotkey, or a lone modifier shown
 *  as a display-only hint. */
export type ShortcutHint = Hotkey | Modifier;

/** The input event Solid hands an <input>/<textarea> handler. */
export type FieldInputEvent<E extends HTMLInputElement | HTMLTextAreaElement> =
	Parameters<JSX.InputEventHandler<E, globalThis.InputEvent>>[0];
