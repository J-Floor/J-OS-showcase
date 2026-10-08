// Optimize raster images to WebP for the landing page.
//
//   bun run --filter @j-os/landing-page optimize:assets <image...>
//
// Each input is written to a `.webp` sibling, capped at 2560px wide (never
// upscaled). Line-art PNGs are encoded lossless; photos lossy (q80). Used to
// self-host and shrink the images pulled off Framer's CDN into public/assets,
// so the site has no runtime dependency on framerusercontent.
import { basename, dirname, extname, join } from "node:path";
import sharp from "sharp";

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
	console.error("usage: optimize-assets <image...>");
	process.exit(1);
}

for (const input of inputs) {
	const ext = extname(input).toLowerCase();
	const out = join(dirname(input), `${basename(input, ext)}.webp`);
	const pipe = sharp(input).resize({ width: 2560, withoutEnlargement: true });
	const encoded =
		ext === ".png"
			? pipe.webp({ lossless: true, effort: 5 })
			: pipe.webp({ quality: 80, effort: 5 });
	await encoded.toFile(out);
	console.log(`${input} -> ${out}`);
}
