import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { render } from "../dist-ssr/entry-server.js";
const template = await readFile("dist/index.html", "utf8");
const now = Date.now();
for (const path of ["/", "/contact", "/404"]) {
	const { html, head } = render(path, now);
	const page = template
		.replace("<!--head-->", head)
		.replace('id="root"', `id="root" data-rendered-at="${now}"`)
		.replace("<!--app-->", html);
	if (path === "/contact") {
		await mkdir("dist/contact", { recursive: true });
		await writeFile("dist/contact/index.html", page);
	} else
		await writeFile(
			path === "/" ? "dist/index.html" : "dist/404.html",
			page
		);
}
await rm("dist-ssr", { recursive: true });
