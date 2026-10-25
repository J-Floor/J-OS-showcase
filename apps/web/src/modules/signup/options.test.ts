import type { Infer } from "convex/values";
import { expect, expectTypeOf, test } from "vitest";

import type {
	fundingStage,
	productStage,
	vertical,
} from "../../../convex/schema.ts";

import {
	fundingStageOptions,
	productStageOptions,
	verticalOptions,
	type FundingStage,
	type ProductStage,
	type Vertical,
} from "./options.ts";

test("the stage and vertical unions are the schema validators' types", () => {
	expectTypeOf<ProductStage>().toEqualTypeOf<Infer<typeof productStage>>();
	expectTypeOf<FundingStage>().toEqualTypeOf<Infer<typeof fundingStage>>();
	expectTypeOf<Vertical>().toEqualTypeOf<Infer<typeof vertical>>();
});

test("every option list is typed by its union, with 'Other' last in the verticals", () => {
	expectTypeOf(productStageOptions[0].value).toEqualTypeOf<ProductStage>();
	expectTypeOf(fundingStageOptions[0].value).toEqualTypeOf<FundingStage>();
	expectTypeOf(verticalOptions[0].value).toEqualTypeOf<Vertical>();
	expect(verticalOptions.at(-1)?.value).toBe("other");
});
