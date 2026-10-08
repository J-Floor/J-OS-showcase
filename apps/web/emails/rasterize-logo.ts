// apps/web/emails/rasterize-logo.ts
import { resolve } from "node:path";

import sharp from "sharp";

// The J monogram (viewBox 0 0 60 60) from the design-system Logo component,
// dark mark on transparent for the light email background. Rendered at 2x
// (96px) so it stays crisp on retina at the 48px display height.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" fill="#000000">
<path d="M47.9995 39.2078C47.9995 49.0321 42.2707 54.3333 30.8133 54.3333H11.4297V46.912H30.891C35.5995 46.912 38.1113 44.1549 38.1113 39.7022V12.4214H18.0996V5H47.9995V39.2078Z"/>
</svg>`;

const OUT = resolve(import.meta.dirname, "../public/email/logo.png");

await sharp(Buffer.from(SVG)).resize(96, 96).png().toFile(OUT);

console.log(`[email:logo] wrote ${OUT}`);
