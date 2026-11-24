import { rewriteAssetRefs, type PlayerSlide } from "@j-os/tv-player";
import type { FunctionReturnType } from "convex/server";

import type { api } from "../../../../convex/_generated/api";

export type PreviewData = FunctionReturnType<typeof api.tvContent.previewPack>;

/** The player's slides for the preview: HTML is fetched from its file URL and its `assets/...` point at their URLs.
 *  A slide whose file cannot be fetched is left out; the others still show. */
export async function previewSlides(
	data: PreviewData,
	fetchText: (url: string) => Promise<string>
): Promise<PlayerSlide[]> {
	const assets = new Map(data.assets.map((asset) => [asset.path, asset.url]));
	const slides = await Promise.all(
		data.slides.map(async (slide): Promise<PlayerSlide | null> => {
			const base = {
				id: slide.id,
				kind: slide.kind,
				durationSec: slide.durationSec,
			};
			if (slide.kind === "image") return { ...base, imageUrl: slide.url };
			try {
				return {
					...base,
					html: rewriteAssetRefs(await fetchText(slide.url), (path) =>
						assets.get(path)
					),
				};
			} catch {
				return null;
			}
		})
	);
	return slides.filter((slide) => slide !== null);
}
