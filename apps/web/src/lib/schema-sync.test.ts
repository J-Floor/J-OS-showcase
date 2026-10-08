// Drift guards for hand-maintained TypeScript unions that duplicate Convex
// schema validators across the convex/src runtime boundary. The frontend can't
// `Infer` these validators at runtime (it can't import server value
// validators), so the unions are kept in sync BY HAND. These compile-time
// assertions fail the typecheck (and therefore CI) the moment a union diverges
// from its schema validator. The runtime `expect` only exists so Vitest counts
// the file.

import type { Infer } from "convex/values";
import { expect, test } from "vitest";

import {
	fundingStage,
	productStage,
	tier,
	vertical,
} from "../../convex/schema.ts";
import type {
	FundingStage,
	ProductStage,
	Vertical,
} from "../modules/signup/options.ts";

import type { Role } from "./ability.tsx";

// Compile-time type-equality assertion. `Expect<Equal<A, B>>` only typechecks
// when A and B are mutually assignable, i.e. exactly the same union.
type Expect<T extends true> = T;
// The single-use `<T>` params are the whole point of this idiom: it compares two
// generic function signatures for structural identity, which is how TS reaches
// strict (invariant) type equality. Hence the rule disable.
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters -- the Equal<> trick needs generic signatures for invariant type equality */
type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
/* eslint-enable @typescript-eslint/no-unnecessary-type-parameters -- restore after the Equal<> helper */

// These are `export`ed only so `noUnusedLocals` (TS6196) doesn't flag them — a
// failed `Expect<Equal<…>>` is a compile error regardless of whether the alias
// is consumed.

// `Role` === the schema `tier` union minus the positions that hold no app role
// (prospect, former, visitor), PLUS the extra "none".
export type _RoleSync = Expect<
	Equal<
		Exclude<Role, "none">,
		Exclude<Infer<typeof tier>, "prospect" | "former" | "visitor">
	>
>;

export type _ProductStageSync = Expect<
	Equal<ProductStage, Infer<typeof productStage>>
>;

export type _FundingStageSync = Expect<
	Equal<FundingStage, Infer<typeof fundingStage>>
>;

export type _VerticalSync = Expect<Equal<Vertical, Infer<typeof vertical>>>;

test("schema-sync unions are guarded at compile time", () => {
	// The real assertions are the `Expect<Equal<…>>` types above; they fail the
	// typecheck if any union drifts from its schema validator.
	expect(true).toBe(true);
});
