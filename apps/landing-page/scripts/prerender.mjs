// Prerender every route into static HTML after `vite build` (client) and
// `vite build --ssr` (server). Each page ships its markup plus the per-route
// head the live Framer site had; the client entry then hydrates it.
//
//   dist/index.html          /
//   dist/contact.html        /contact (Pages serves it without a trailing slash)
//   dist/404.html            anything else (Cloudflare Pages serves it with 404)
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

const SITE = "https://thejfloor.com";
const DESCRIPTION =
	"The J floor is a private founder community in Zürich. With 150+ builders across industries, it’s a space to connect, grow, and ship, grounded in trust, momentum, and support through every stage of the startup journey.";

// Per-route head, copied from the live Framer pages: /contact had no
// description, the 404 page was noindex.
const ROUTES = [
	{ url: "/", file: "index.html", description: DESCRIPTION },
	{ url: "/contact", file: "contact.html" },
	{
		url: "/404",
		file: "404.html",
		description: DESCRIPTION,
		noindex: true,
	},
];

function routeHead({ url, description, noindex }) {
	const tags = [
		`<link rel="canonical" href="${SITE}${url}" />`,
		`<meta property="og:url" content="${SITE}${url}" />`,
	];
	if (description) {
		tags.push(
			`<meta name="description" content="${description}" />`,
			`<meta property="og:description" content="${description}" />`,
			`<meta name="twitter:description" content="${description}" />`
		);
	}
	if (noindex) tags.push(`<meta name="robots" content="noindex" />`);
	return tags.join("\n\t\t");
}

const dist = new URL("../dist/", import.meta.url);
const serverDir = new URL("../dist-ssr/", import.meta.url);
const { renderRoute } = await import(
	new URL("entry-server.js", serverDir).href
);
const template = await readFile(new URL("index.html", dist), "utf8");

for (const route of ROUTES) {
	const { html, head } = renderRoute(route.url);
	const page = template
		.replace("<!--route-head-->", `${routeHead(route)}\n\t\t${head}`)
		.replace("<!--app-html-->", html);
	if (
		page.includes("<!--app-html-->") ||
		page.includes("<!--route-head-->")
	) {
		throw new Error(`prerender: placeholder left in ${route.file}`);
	}
	const out = new URL(route.file, dist);
	await mkdir(new URL(".", out), { recursive: true });
	await writeFile(out, page);
	console.log(`prerendered ${route.url} -> dist/${route.file}`);
}

await rm(serverDir, { recursive: true, force: true });
