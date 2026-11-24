import type { FunctionReturnType } from "convex/server";

import type { api } from "../../../../convex/_generated/api";

/** One slide as the list shows it (no HTML body). */
export type Slide = FunctionReturnType<
	typeof api.tvContent.listConfigSlides
>[number];

/** One slide with a URL to its file, for the edit sheet (the query answers
 *  `null` for an id that is not in the config). */
export type SlideDetail = NonNullable<
	FunctionReturnType<typeof api.tvContent.getConfigSlide>
>;

/** The pack and config.xml state, as TvTab reads it once and hands down. */
export type PackState = NonNullable<
	FunctionReturnType<typeof api.tvContent.getPackState>
>;
