import type { PolymorphicProps } from "@ark-ui/solid/factory";
import type { TooltipTriggerProps } from "@ark-ui/solid/tooltip";
import type { Hotkey, Modifier } from "@tanstack/solid-hotkeys";
import type { JSX } from "solid-js";
import { expectTypeOf, test } from "vitest";

import type { MakeFieldProps } from "../components/MakeField/MakeField.tsx";

import type { FieldRootKey, MakeFieldKey } from "./makeFieldProps.ts";
import type { TriggerProps } from "./triggerProps.ts";
import type {
	DistributiveOmit,
	FieldInputEvent,
	MakeFieldOwnProps,
	ShortcutHint,
} from "./types.ts";

type Branch =
	| { kind: "a"; a: string; shared: number }
	| { kind: "b"; b: boolean; shared: number };

test("DistributiveOmit keeps each union branch", () => {
	expectTypeOf<DistributiveOmit<Branch, "shared">>().toEqualTypeOf<
		{ kind: "a"; a: string } | { kind: "b"; b: boolean }
	>();
});

test("TriggerProps is what an Ark asChild render function hands its child", () => {
	type Handed = ReturnType<
		Parameters<NonNullable<TooltipTriggerProps["asChild"]>>[0]
	>;
	type HandedAnywhere = ReturnType<
		Parameters<NonNullable<PolymorphicProps<"span">["asChild"]>>[0]
	>;
	expectTypeOf<Handed>().toExtend<TriggerProps>();
	expectTypeOf<HandedAnywhere>().toExtend<TriggerProps<"span">>();
});

test("TriggerProps carries the element's own attributes", () => {
	expectTypeOf<TriggerProps>().toHaveProperty("disabled");
	expectTypeOf<TriggerProps["disabled"]>().toEqualTypeOf<
		JSX.ButtonHTMLAttributes<HTMLButtonElement>["disabled"]
	>();
});

test("MakeFieldOwnProps drops the div's DOM attributes and keeps MakeField's own", () => {
	expectTypeOf<MakeFieldOwnProps>().not.toHaveProperty("onInput");
	expectTypeOf<MakeFieldOwnProps>().toHaveProperty("label");
	expectTypeOf<MakeFieldOwnProps>().toHaveProperty("errorText");
	expectTypeOf<MakeFieldProps>().toExtend<MakeFieldOwnProps>();
});

test("the keys splitFieldPartProps hands MakeField, less the DOM attributes the control owns, are MakeFieldOwnProps' keys", () => {
	expectTypeOf<
		Exclude<
			MakeFieldKey | FieldRootKey,
			keyof JSX.HTMLAttributes<HTMLDivElement>
		>
	>().toEqualTypeOf<keyof MakeFieldOwnProps>();
});

test("ShortcutHint is a hotkey or a lone modifier", () => {
	expectTypeOf<ShortcutHint>().toEqualTypeOf<Hotkey | Modifier>();
});

test("FieldInputEvent is the event Solid hands an input handler", () => {
	type Handed = Parameters<
		JSX.InputEventHandler<HTMLTextAreaElement, globalThis.InputEvent>
	>[0];
	expectTypeOf<
		FieldInputEvent<HTMLTextAreaElement>
	>().toEqualTypeOf<Handed>();
	expectTypeOf<
		FieldInputEvent<HTMLInputElement>["currentTarget"]
	>().toExtend<HTMLInputElement>();
});
