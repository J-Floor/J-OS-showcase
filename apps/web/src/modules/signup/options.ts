import type { Infer } from "convex/values";

import type {
	fundingStage,
	productStage,
	vertical,
} from "../../../convex/schema.ts";

// Option lists for the public sign-up form. Labels are written for clarity on
// the form; the values are the Convex enums, inferred from their validators.

export type ProductStage = Infer<typeof productStage>;
export type FundingStage = Infer<typeof fundingStage>;
export type Vertical = Infer<typeof vertical>;

type Option<Value extends string> = { value: Value; label: string };

export const productStageOptions: Option<ProductStage>[] = [
	{ value: "building", label: "Building — not commercial yet" },
	{ value: "prototype", label: "Prototype" },
	{ value: "mvp", label: "MVP / early product" },
	{ value: "traction", label: "Live, with traction" },
	{ value: "other", label: "Other" },
];

export const fundingStageOptions: Option<FundingStage>[] = [
	{ value: "bootstrapped", label: "Bootstrapped (not raised)" },
	{ value: "angel", label: "Raised angel" },
	{ value: "pre_seed", label: "Raised pre-seed" },
	{ value: "seed", label: "Raised seed" },
	{ value: "series_a", label: "Raised Series A+" },
	{ value: "other", label: "Other" },
];

// Authored in any order — `verticalOptions` below is sorted by label at module
// load, so a new entry can be added anywhere and still shows in the right place.
const verticalOptionsUnordered: Option<Vertical>[] = [
	{ value: "aerospace", label: "Aerospace" },
	{ value: "agtech", label: "Agtech" },
	{ value: "ai", label: "AI / ML" },
	{ value: "biotech", label: "Biotech / Life sciences" },
	{ value: "climate", label: "Climate" },
	{ value: "construction", label: "Construction / Built environment" },
	{ value: "consumer", label: "Consumer / Social" },
	{ value: "creative", label: "Creative / Media" },
	{ value: "data", label: "Data / Analytics" },
	{ value: "defense", label: "Defense / Public sector" },
	{ value: "devtools", label: "Developer tools" },
	{ value: "ecommerce", label: "E-commerce / Retail" },
	{ value: "edtech", label: "Edtech" },
	{ value: "energy", label: "Energy" },
	{ value: "fintech", label: "Fintech" },
	{ value: "foodtech", label: "Foodtech" },
	{ value: "gaming", label: "Gaming" },
	{ value: "hardware", label: "Hardware / IoT" },
	{ value: "healthtech", label: "Healthtech" },
	{ value: "hrtech", label: "HR / Future of work" },
	{ value: "infra", label: "Infrastructure" },
	{ value: "insurtech", label: "Insurtech" },
	{ value: "legaltech", label: "Legaltech" },
	{ value: "logistics", label: "Logistics / Supply chain" },
	{ value: "manufacturing", label: "Manufacturing / Industrial" },
	{ value: "martech", label: "Marketing / Sales" },
	{ value: "materials", label: "Materials / Chemicals" },
	{ value: "mobility", label: "Mobility / Transport" },
	{ value: "productivity", label: "Productivity / Ops" },
	{ value: "proptech", label: "Proptech / Real estate" },
	{ value: "robotics", label: "Robotics" },
	{ value: "security", label: "Security" },
	{ value: "semiconductors", label: "Semiconductors" },
	{ value: "traveltech", label: "Travel / Hospitality" },
	{ value: "web3", label: "Web3 / Crypto" },
	{ value: "wellness", label: "Wellness / Fitness" },
	{ value: "other", label: "Other" },
];

/* eslint-disable id-length -- conventional comparator parameter names */
/** Alphabetical by label, but "Other" always sorts last as a catch-all. */
function byVerticalLabel(a: Option<Vertical>, b: Option<Vertical>): number {
	if (a.value === "other") return 1;
	return b.value === "other" ? -1 : a.label.localeCompare(b.label);
}
/* eslint-enable id-length -- conventional comparator parameter names */

/** The verticals as shown to users: sorted by label, "Other" pinned last. */
export const verticalOptions: Option<Vertical>[] = [
	...verticalOptionsUnordered,
].sort(byVerticalLabel);
