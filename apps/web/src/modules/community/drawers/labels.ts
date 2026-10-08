import {
	fundingStageOptions,
	productStageOptions,
	verticalOptions,
} from "../../signup/options.ts";
import type {
	FundingStage,
	ProductStage,
	Vertical,
} from "../../signup/options.ts";

/** Returns the human-readable label for a productStage enum value,
 *  falling back to the raw value when the entry is not found. */
export function productStageLabel(stage: ProductStage | undefined): string {
	if (stage == null) return "";
	return productStageOptions.find((o) => o.value === stage)?.label ?? stage;
}

/** Returns the human-readable label for a fundingStage enum value,
 *  falling back to the raw value when the entry is not found. */
export function fundingStageLabel(stage: FundingStage | undefined): string {
	if (stage == null) return "";
	return fundingStageOptions.find((o) => o.value === stage)?.label ?? stage;
}

/** Maps an array of vertical enum values to their labels (falling back to the
 *  raw value) and joins them with ", ".  Returns "" for undefined / empty so
 *  callers can use the existing `|| "—"` fallback. */
export function verticalsLabel(
	values: readonly Vertical[] | undefined
): string {
	if (!values || values.length === 0) return "";
	return values
		.map((v) => verticalOptions.find((o) => o.value === v)?.label ?? v)
		.join(", ");
}
