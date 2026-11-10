// apps/web/scripts/env-set.ts
//
// `bun run env:set <NAME> [--only dev,prod,staging]` sets one Convex env var on
// dev, prod and staging. The value is asked for once (hidden input) or read
// from stdin when it is not a TTY. It goes to the convex CLI through stdin, so
// it never appears in shell history or in `ps`.
import { spawnSync } from "node:child_process";

import {
	parseArgs,
	setEverywhere,
	USAGE,
	type Runner,
} from "../src/lib/envSet.ts";

function readHidden(prompt: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const stdin = process.stdin;
		process.stderr.write(prompt);
		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding("utf8");
		let value = "";
		const onData = (chunk: string) => {
			for (const char of chunk) {
				if (char === "\r" || char === "\n") {
					stdin.setRawMode(false);
					stdin.pause();
					stdin.off("data", onData);
					process.stderr.write("\n");
					resolve(value);
					return;
				}
				if (char === "\u0003") {
					stdin.setRawMode(false);
					process.stderr.write("\n");
					reject(new Error("cancelled"));
					return;
				}
				if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
				else value += char;
			}
		};
		stdin.on("data", onData);
	});
}

async function readPiped(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

const runConvex: Runner = (args, value) => {
	const child = spawnSync("bunx", args, { input: value, encoding: "utf8" });
	if (child.error) return { ok: false, message: child.error.message };
	if (child.status === 0) return { ok: true };
	const output = `${child.stderr}${child.stdout}`.trim();
	return { ok: false, message: output || `exited ${String(child.status)}` };
};

const parsed = parseArgs(process.argv.slice(2));
if ("error" in parsed) {
	console.error(`${parsed.error}\n${USAGE}`);
	process.exit(2);
}

const value = process.stdin.isTTY
	? await readHidden(`Value for ${parsed.name}: `)
	: await readPiped();
if (value === "") {
	console.error("empty value, nothing set");
	process.exit(2);
}

const { lines, hasFailed } = setEverywhere(parsed, value, runConvex);
for (const line of lines) console.log(line);
process.exit(hasFailed ? 1 : 0);
