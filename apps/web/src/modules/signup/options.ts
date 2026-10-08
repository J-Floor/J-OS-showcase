// Option lists for the public sign-up form. Values mirror the Convex enums
// (`productStage` / `fundingStage` / `vertical` in convex/schema.ts); labels are
// written for clarity on the form.

// Mirrors the `productStage` / `fundingStage` / `vertical` unions in
// convex/schema.ts. Kept in sync by hand (the frontend can't import the server
// value validators); src/lib/schema-sync.test.ts fails the typecheck on drift.
export type ProductStage =
	| "building"
	| "prototype"
	| "mvp"
	| "traction"
	| "other";

export type FundingStage =
	| "bootstrapped"
	| "angel"
	| "pre_seed"
	| "seed"
	| "series_a"
	| "other";

export type Vertical =
	| "ai"
	| "fintech"
	| "insurtech"
	| "healthtech"
	| "biotech"
	| "climate"
	| "energy"
	| "aerospace"
	| "robotics"
	| "hardware"
	| "semiconductors"
	| "devtools"
	| "infra"
	| "security"
	| "data"
	| "edtech"
	| "foodtech"
	| "agtech"
	| "proptech"
	| "legaltech"
	| "hrtech"
	| "logistics"
	| "mobility"
	| "traveltech"
	| "martech"
	| "ecommerce"
	| "consumer"
	| "creative"
	| "web3"
	| "manufacturing"
	| "defense"
	| "materials"
	| "construction"
	| "wellness"
	| "gaming"
	| "productivity"
	| "other";

export type ProductStageOption = { value: ProductStage; label: string };
export type FundingStageOption = { value: FundingStage; label: string };
export type VerticalOption = { value: Vertical; label: string };

export const productStageOptions: ProductStageOption[] = [
	{ value: "building", label: "Building — not commercial yet" },
	{ value: "prototype", label: "Prototype" },
	{ value: "mvp", label: "MVP / early product" },
	{ value: "traction", label: "Live, with traction" },
	{ value: "other", label: "Other" },
];

export const fundingStageOptions: FundingStageOption[] = [
	{ value: "bootstrapped", label: "Bootstrapped (not raised)" },
	{ value: "angel", label: "Raised angel" },
	{ value: "pre_seed", label: "Raised pre-seed" },
	{ value: "seed", label: "Raised seed" },
	{ value: "series_a", label: "Raised Series A+" },
	{ value: "other", label: "Other" },
];

// Authored in any order — `verticalOptions` below is sorted by label at module
// load, so a new entry can be added anywhere and still shows in the right place.
const verticalOptionsUnordered: VerticalOption[] = [
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

/** Alphabetical by label, but "Other" always sorts last as a catch-all. */
function byVerticalLabel(a: VerticalOption, b: VerticalOption): number {
	if (a.value === "other") return 1;
	if (b.value === "other") return -1;
	return a.label.localeCompare(b.label);
}

/** The verticals as shown to users: sorted by label, "Other" pinned last. */
export const verticalOptions: VerticalOption[] = [
	...verticalOptionsUnordered,
].sort(byVerticalLabel);
