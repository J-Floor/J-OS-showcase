import type { FunctionReturnType } from "convex/server";

import type { api } from "../../../../convex/_generated/api";

/** One slide as the list shows it (no HTML body). */
export type Slide = FunctionReturnType<typeof api.tv.listSlides>[number];

/** One slide with its HTML body, for the edit sheet. */
export type SlideDetail = FunctionReturnType<typeof api.tv.getSlide>;
