// @vitest-environment node
// apps/web/convex/security.invariants.test.ts
//
// Static security invariants over the convex/ source: each rule reads the
// files off disk (hence node, not the app-wide edge-runtime) and is a pure
// function over a path → source map, so a self-check can feed it an in-memory
// sample with a planted violation and prove the rule can still go red.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** Source path relative to convex/ (forward slashes) → file contents. */
type Sources = ReadonlyMap<string, string>;

const CONVEX_DIR = fileURLToPath(new URL(".", import.meta.url));

// ---------------------------------------------------------------------------
// Rule data
// ---------------------------------------------------------------------------

/**
 * Public Convex functions that run without an auth gate on purpose. Key is
 * `file:export` (or `file:route <path>` for an inline HTTP route); value is
 * why it is safe to call signed out. An entry that is no longer public and
 * ungated fails the stale-entry check, so this list only shrinks by hand.
 */
const PUBLIC_ON_PURPOSE: Record<string, string> = {
	"auth.ts:getCurrentUser":
		"returns the caller's own auth user (or null); nothing about anyone else",
	"applications.ts:submitApplication":
		"the public application form; reCAPTCHA, rate limit, identical reply for every address",
	"applications.ts:confirmApplication":
		"the emailed confirm link; authorised by the single-use hashed token",
	"visitors.ts:registerVisitor":
		"the public visitor form; reCAPTCHA, rate limit, identical reply for every address",
	"visitors.ts:confirmVisitor":
		"the emailed visitor confirm link; authorised by the single-use hashed token, and returns the Wi-Fi credentials to whoever holds it",
	"eventCheckIn.ts:confirmEventInvite":
		"the emailed event invite link; authorised by the single-use hashed token, and returns the Wi-Fi credentials to whoever holds it",
	"people.ts:confirmEmailChange":
		"the emailed address-change link; authorised by the single-use hashed token",
	"events.ts:getEventPublic":
		"the public event page: name and times only, no attendees",
	"http.ts:route PRESENCE_PATH":
		"the door presence oracle: proves where a request comes from, not who sent it; doorActions checks who",
	"http.ts:route OCCUPANCY_WEBHOOK_PATH":
		"the counter webhook: the caller is a device, not a person; it must carry the shared secret, and it carries only anonymous counts",
};

/** Calls that establish who the caller is (and, for requireRole, what they may do). */
const GATE_CALL =
	/\b(?:requireRole|personForCurrentUser)\(|\b[A-Za-z_$][\w$]*\.auth\.getUserIdentity\(/;

/** `export const name = builder(` (an optional type annotation allowed). */
const PUBLIC_EXPORT =
	/^export const (\w+)\s*(?::[^=\n]+)?=\s*(query|mutation|action|httpAction)\(/gm;

const PUBLIC_BUILDER = /^(?:query|mutation|action|httpAction)$/;

/** Modules only an operator runs (CLI / dashboard); never callable by a client. */
const OPERATOR_MODULE =
	/^(?:dev|seed|migrations|purge|backfill\w*|migrate\w*)\.ts$/;

const TOKEN_MINTER = "lib/confirmToken.ts";

/** The lock-provider adapter: the only module that talks HTTP to the locks. */
const DOOR_ADAPTER = "lib/nukiClient.ts";

/** The provider methods that change the lock account. Every non-GET request
 *  in the adapter must sit in one of these, and every call site of one must be
 *  behind the write switch. A new write method goes here. */
const DOOR_WRITE_METHODS = ["actuate", "revokeAuthIds"];

/** Adapter exports that bypass the write switch when imported directly. */
const DOOR_UNGATED_EXPORTS = ["nukiProvider", "revokeAuthIds"];

/** The one module that may build the real provider from the environment. */
const DOOR_FACTORY_IMPORTER = "lib/doorProviderEnv.ts";

// ---------------------------------------------------------------------------
// Source reading and a minimal tokenizer
// ---------------------------------------------------------------------------

function listSourceFiles(directory: string): string[] {
	return readdirSync(directory).flatMap((name) => {
		const full = join(directory, name);
		if (name === "_generated") return [];
		if (statSync(full).isDirectory()) return listSourceFiles(full);
		const isSource =
			name.endsWith(".ts") &&
			!name.endsWith(".test.ts") &&
			!name.endsWith(".d.ts");
		return isSource ? [full] : [];
	});
}

function convexSources(): Sources {
	return new Map(
		listSourceFiles(CONVEX_DIR).map((full) => [
			relative(CONVEX_DIR, full).split(sep).join("/"),
			readFileSync(full, "utf8"),
		])
	);
}

function blank(text: string): string {
	return text.replaceAll(/[^\n]/g, " ");
}

/** Index just past the string, template or regex literal opening at `start`. */
function literalEnd(source: string, start: number): number {
	const quote = source.charAt(start);
	let isInClass = false;
	for (let index = start + 1; index < source.length; index++) {
		const character = source.charAt(index);
		if (character === "\\") {
			index++;
		} else if (quote === "/" && character === "[") {
			isInClass = true;
		} else if (quote === "/" && character === "]") {
			isInClass = false;
		} else if (character === quote && !isInClass) {
			return index + 1;
		} else if (character === "\n" && quote !== "`") {
			return index;
		}
	}
	return source.length;
}

/** Characters after which a `/` opens a regex literal rather than dividing. */
const REGEX_PRECEDERS = new Set([
	"",
	"(",
	",",
	"=",
	":",
	"[",
	"!",
	"&",
	"|",
	"?",
	"{",
	"}",
	";",
]);

/**
 * The source with comments blanked out (same length, newlines kept so
 * offsets and line numbers still line up). With `shouldKeepStrings: false`, string,
 * template and regex contents are blanked too, leaving only code: a gate named
 * in a comment or an error message does not count as a gate.
 */
function scrub(source: string, shouldKeepStrings: boolean): string {
	let out = "";
	let last = "";
	let index = 0;
	while (index < source.length) {
		const character = source.charAt(index);
		const next = source.charAt(index + 1);
		let stop = index + 1;
		if (character === "/" && next === "/") {
			const newline = source.indexOf("\n", index);
			stop = newline === -1 ? source.length : newline;
			out += blank(source.slice(index, stop));
		} else if (character === "/" && next === "*") {
			const close = source.indexOf("*/", index + 2);
			stop = close === -1 ? source.length : close + 2;
			out += blank(source.slice(index, stop));
		} else if (
			character === '"' ||
			character === "'" ||
			character === "`" ||
			(character === "/" && REGEX_PRECEDERS.has(last))
		) {
			stop = literalEnd(source, index);
			const literal = source.slice(index, stop);
			out += shouldKeepStrings
				? literal
				: character + blank(literal.slice(1, -1)) + literal.slice(-1);
			last = character;
		} else {
			out += character;
			if (character.trim() !== "") last = character;
		}
		index = stop;
	}
	return out;
}

function codeOf(source: string): string {
	return scrub(source, false);
}

function lineOf(source: string, index: number): number {
	return source.slice(0, index).split("\n").length;
}

/** Index of the bracket closing the one at `open` (same bracket type). */
function matchingClose(code: string, open: number): number {
	const opener = code.charAt(open);
	const closer = opener === "(" ? ")" : "}";
	let depth = 0;
	for (let index = open; index < code.length; index++) {
		const character = code.charAt(index);
		if (character === opener) depth++;
		else if (character === closer) {
			depth--;
			if (depth === 0) return index;
		}
	}
	return code.length;
}

/** Characters that can precede a `{` opening a type literal, not a body. */
const TYPE_BRACE_PRECEDERS = new Set(["<", ":", "|", "&", "(", ",", "="]);

/** The body brace of a function whose parameter list closes at `paramsEnd`,
 *  skipping object types in the return annotation; -1 when it has none. */
function bodyOpen(code: string, paramsEnd: number): number {
	let index = paramsEnd + 1;
	while (index < code.length) {
		const character = code.charAt(index);
		if (character === ";" || character === "=") return -1;
		if (character !== "{") {
			index++;
			continue;
		}
		const before = code.slice(paramsEnd + 1, index).trimEnd();
		if (!TYPE_BRACE_PRECEDERS.has(before.slice(-1))) return index;
		index = matchingClose(code, index) + 1;
	}
	return -1;
}

type FunctionBlock = { name: string; start: number; end: number };

const FUNCTION_DECLARATION = String.raw`\bfunction\s+(\w+)\s*(?:<[^>(]*>\s*)?\(`;
const METHOD_DECLARATION = String.raw`^[\t ]*(?:async\s+)?(\w+)\s*\(`;

const NOT_A_FUNCTION = new Set([
	"if",
	"for",
	"while",
	"switch",
	"catch",
	"return",
	"function",
]);

/**
 * Named functions in `code`: `function name(` declarations, and with
 * `shouldIncludeMethods` also object-literal methods (`name(…) {` at a line start).
 */
function functionBlocks(
	code: string,
	shouldIncludeMethods: boolean
): FunctionBlock[] {
	const header = shouldIncludeMethods
		? new RegExp(`${FUNCTION_DECLARATION}|${METHOD_DECLARATION}`, "gm")
		: new RegExp(FUNCTION_DECLARATION, "g");
	const blocks: FunctionBlock[] = [];
	for (const match of code.matchAll(header)) {
		const name = match[1] || match[2];
		if (NOT_A_FUNCTION.has(name)) continue;
		const open = bodyOpen(
			code,
			matchingClose(code, match.index + match[0].length - 1)
		);
		if (open === -1) continue;
		blocks.push({ name, start: open, end: matchingClose(code, open) });
	}
	return blocks;
}

/** True when the identifier at `index` is the name in a `function name(`
 *  declaration rather than a call. */
function isFunctionDeclaration(code: string, index: number): boolean {
	return code.slice(0, index).trimEnd().endsWith("function");
}

/** Names of the functions containing `index`, innermost first. */
function enclosingFunctions(blocks: FunctionBlock[], index: number): string[] {
	return (
		blocks
			.filter((block) => block.start < index && index < block.end)
			// eslint-disable-next-line id-length -- conventional comparator parameter names
			.sort((a, b) => b.start - a.start)
			.map((block) => block.name)
	);
}

/** The text of the builder call opening at `open`; throws if it runs into the
 *  next export, which means the tokenizer lost its place. */
function callText(file: string, code: string, open: number): string {
	const text = code.slice(open, matchingClose(code, open) + 1);
	if (/\nexport\s/.test(text))
		throw new Error(
			`${file}: could not find the end of the call at line ${String(lineOf(code, open))}`
		);
	return text;
}

/** Local name → `file#exportedName` for each named relative import. */
function relativeImports(
	file: string,
	code: string,
	source: string
): Map<string, string> {
	const out = new Map<string, string>();
	for (const match of code.matchAll(
		/\bimport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*"/g
	)) {
		const specStart = match.index + match[0].length;
		const spec = source.slice(specStart, source.indexOf('"', specStart));
		if (!spec.startsWith(".")) continue;
		const joined = posix.normalize(posix.join(posix.dirname(file), spec));
		const target = joined.endsWith(".ts") ? joined : `${joined}.ts`;
		const parts = match[1].split(",");
		for (const part of parts) {
			const [exported, local] = part
				.replace(/^\s*type\s+/, "")
				.split(/\bas\b/)
				.map((segment) => segment.trim());
			if (exported) out.set(local || exported, `${target}#${exported}`);
		}
	}
	return out;
}

/** The `internal.a.b.name` reference for export `name` of `file`. */
function internalReference(file: string, name: string): string {
	return `internal.${file.replace(/\.ts$/, "").replaceAll("/", ".")}.${name}`;
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Rule 1: public functions need an auth gate
// ---------------------------------------------------------------------------

type GateIndex = {
	/** `file#function` keys of helpers that (transitively) call a gate. */
	helpers: Set<string>;
	/** `internal.x.y` references of internal functions that call a gate. */
	internals: Set<string>;
	imports: Map<string, Map<string, string>>;
};

function doesReferenceGate(
	file: string,
	text: string,
	index: GateIndex
): boolean {
	if (GATE_CALL.test(text)) return true;
	for (const match of text.matchAll(/\binternal(?:\.\w+)+/g))
		if (index.internals.has(match[0])) return true;
	for (const match of text.matchAll(/\b\w+\b/g)) {
		if (index.helpers.has(`${file}#${match[0]}`)) return true;
		const imported = index.imports.get(file)?.get(match[0]);
		if (imported !== undefined && index.helpers.has(imported)) return true;
	}
	return false;
}

/**
 * Every helper function and internal Convex function that reaches a gate,
 * closed transitively: a helper calling a gated helper (same file or
 * imported), or an action running a gated internal query, is gated too.
 * Helpers are keyed per file so a same-named function elsewhere cannot vouch
 * for an ungated one.
 */
function gateIndex(sources: Sources): GateIndex {
	const index: GateIndex = {
		helpers: new Set(),
		internals: new Set(),
		imports: new Map(),
	};
	const candidates: {
		file: string;
		key: string;
		internal: boolean;
		text: string;
	}[] = [];
	for (const [file, source] of sources) {
		const code = codeOf(source);
		index.imports.set(file, relativeImports(file, code, source));
		for (const block of functionBlocks(code, false))
			candidates.push({
				file,
				key: `${file}#${block.name}`,
				internal: false,
				text: code.slice(block.start, block.end),
			});
		for (const match of code.matchAll(
			/^export const (\w+)\s*=\s*internal(?:Query|Mutation|Action)\(/gm
		))
			candidates.push({
				file,
				key: internalReference(file, match[1]),
				internal: true,
				text: callText(file, code, match.index + match[0].length - 1),
			});
	}
	let isChanged = true;
	while (isChanged) {
		isChanged = false;
		for (const candidate of candidates) {
			const set = candidate.internal ? index.internals : index.helpers;
			if (
				set.has(candidate.key) ||
				!doesReferenceGate(candidate.file, candidate.text, index)
			)
				continue;
			set.add(candidate.key);
			isChanged = true;
		}
	}
	return index;
}

/** Every public query / mutation / action / HTTP route, keyed as in
 *  PUBLIC_ON_PURPOSE, with the text of its builder call. */
function publicFunctions(
	sources: Sources
): { file: string; key: string; text: string }[] {
	const out: { file: string; key: string; text: string }[] = [];
	for (const [file, source] of sources) {
		const code = codeOf(source);
		const exported = new Set<number>();
		for (const match of code.matchAll(PUBLIC_EXPORT)) {
			const open = match.index + match[0].length - 1;
			exported.add(open);
			out.push({
				file,
				key: `${file}:${match[1]}`,
				text: callText(file, code, open),
			});
		}
		for (const match of code.matchAll(/\bhttpAction\(/g)) {
			const open = match.index + match[0].length - 1;
			if (exported.has(open)) continue;
			const path = [
				...code.slice(0, match.index).matchAll(/\bpath:\s*([^,\n]+)/g),
			].pop();
			const route = path
				? path[1].trim()
				: `line ${String(lineOf(code, match.index))}`;
			out.push({
				file,
				key: `${file}:route ${route}`,
				text: callText(file, code, open),
			});
		}
	}
	return out;
}

/**
 * Keys of public functions whose handler reaches no auth gate. The check is
 * textual: naming a gated `internal.x.y` or a gated helper anywhere in the
 * handler (even inside `scheduler.runAfter`) counts as reaching the gate.
 */
function ungatedPublicFunctions(sources: Sources): string[] {
	const index = gateIndex(sources);
	return publicFunctions(sources)
		.filter(
			(publicFunction) =>
				!doesReferenceGate(
					publicFunction.file,
					publicFunction.text,
					index
				)
		)
		.map((publicFunction) => publicFunction.key);
}

/** Value imports of a public builder from `_generated/server`, with the local
 *  name each is bound to. */
function publicBuilderImports(
	source: string
): { builder: string; local: string }[] {
	const out: { builder: string; local: string }[] = [];
	for (const match of source.matchAll(
		/\bimport\s+(type\s+)?\{([^}]*)\}\s*from\s*"(?:\.\.?\/)+_generated\/server"/g
	)) {
		if (match[1]) continue;
		const parts = match[2].split(",");
		for (const part of parts) {
			const [builder, local = builder] = part
				.trim()
				.split(/\bas\b/)
				.map((segment) => segment.trim());
			if (PUBLIC_BUILDER.test(builder)) out.push({ builder, local });
		}
	}
	return out;
}

/** Calls of an imported query / mutation / action builder that are not an
 *  `export const name = builder(` site, so publicFunctions cannot see them
 *  (a builder wrapped in a helper, or assigned and exported later). */
function hiddenPublicBuilders(sources: Sources): string[] {
	const out: string[] = [];
	for (const [file, source] of sources) {
		const code = codeOf(source);
		const exported = new Set(
			[...code.matchAll(PUBLIC_EXPORT)].map(
				(match) => match.index + match[0].length - 1
			)
		);
		for (const { builder, local } of publicBuilderImports(source)) {
			if (builder === "httpAction") continue;
			const call = new RegExp(
				`(?<![\\w$.])${escapeRegExp(local)}\\(`,
				"g"
			);
			const hiddenCalls = [...code.matchAll(call)].filter(
				(match) => !exported.has(match.index + match[0].length - 1)
			);
			for (const match of hiddenCalls)
				out.push(
					`${file}:${String(lineOf(code, match.index))} calls ${builder} outside export const`
				);
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// Rule 2: operator modules export only internal functions
// ---------------------------------------------------------------------------

function operatorModuleViolations(sources: Sources): string[] {
	const out: string[] = [];
	for (const [file, source] of sources) {
		if (!OPERATOR_MODULE.test(posix.basename(file))) continue;
		for (const match of codeOf(source).matchAll(PUBLIC_EXPORT))
			out.push(`${file}:${match[1]} is a public ${match[2]}`);
		for (const { builder } of publicBuilderImports(source))
			out.push(`${file} imports the public builder ${builder}`);
	}
	return out;
}

// ---------------------------------------------------------------------------
// Rule 3: confirm tokens are minted only in lib/confirmToken.ts
// ---------------------------------------------------------------------------

function tokenMintViolations(sources: Sources): string[] {
	const out: string[] = [];
	for (const [file, source] of sources) {
		if (file === TOKEN_MINTER) continue;
		const text = scrub(source, true);
		for (const match of text.matchAll(
			/\.insert\(\s*["'`]confirmTokens["'`]/g
		))
			out.push(`${file}:${String(lineOf(text, match.index))}`);
	}
	return out;
}

// ---------------------------------------------------------------------------
// Rule 4: door writes go through the write switch
// ---------------------------------------------------------------------------
// Textual: `requireWrites: true` or `doorWritesEnabled(` only has to appear
// earlier in the same top-level declaration as the write call.

/** Top-level statement starts (column 0), for "earlier in this function". */
function topLevelStart(code: string, index: number): number {
	let start = 0;
	for (const match of code.matchAll(
		/^(?:export |async |function |const )/gm
	)) {
		if (match.index > index) break;
		start = match.index;
	}
	return start;
}

function adapterViolations(source: string): string[] {
	const out: string[] = [];
	const code = codeOf(source);
	const text = scrub(source, true);
	const blocks = functionBlocks(code, true);
	function at(index: number): string {
		return `${DOOR_ADAPTER}:${String(lineOf(code, index))}`;
	}

	const switchFunction = blocks.find(
		(block) => block.name === "doorWritesEnabled"
	);
	if (
		!switchFunction ||
		!/process\.env\.NUKI_WRITE_ENABLED\s*===\s*"1"/.test(
			text.slice(switchFunction.start, switchFunction.end)
		)
	)
		out.push(
			`${DOOR_ADAPTER}: doorWritesEnabled() must be process.env.NUKI_WRITE_ENABLED === "1"`
		);

	for (const match of text.matchAll(
		/\brequest\(\s*deps\s*,\s*(?:"([A-Z]+)")?/g
	)) {
		const method = match[1];
		if (!method) {
			out.push(
				`${at(match.index)}: request method is not a literal, so it cannot be checked`
			);
		} else if (method !== "GET") {
			const function_ = enclosingFunctions(blocks, match.index)[0];
			if (!DOOR_WRITE_METHODS.includes(function_))
				out.push(
					`${at(match.index)}: ${method} request in ${function_}; add it to DOOR_WRITE_METHODS so its call sites are checked`
				);
		}
	}

	for (const match of code.matchAll(/\bfetch\(/g))
		if (!enclosingFunctions(blocks, match.index).includes("request"))
			out.push(
				`${at(match.index)}: fetch outside request(); every lock request must go through request()`
			);

	const factory = blocks.find(
		(block) => block.name === "doorProviderFromEnvironment"
	);
	const factoryBody = factory ? code.slice(factory.start, factory.end) : "";
	const guard =
		/if\s*\(\s*options\.requireWrites\s*&&\s*!doorWritesEnabled\(\)\s*\)\s*return\s+err\(/.exec(
			factoryBody
		);
	const build = factoryBody.indexOf("nukiProvider(");
	if (!guard || build === -1 || guard.index > build)
		out.push(
			`${DOOR_ADAPTER}: doorProviderFromEnvironment must return an Err when requireWrites is set and doorWritesEnabled() is false, before building the provider`
		);

	for (const match of code.matchAll(/\bnukiProvider\(/g))
		if (
			!isFunctionDeclaration(code, match.index) &&
			!enclosingFunctions(blocks, match.index).includes(
				"doorProviderFromEnvironment"
			)
		)
			out.push(
				`${at(match.index)}: nukiProvider built outside doorProviderFromEnvironment, past the write switch`
			);
	return out;
}

function doorWriteViolations(sources: Sources): string[] {
	const adapter = sources.get(DOOR_ADAPTER);
	if (adapter === undefined)
		return [`${DOOR_ADAPTER}: door adapter not found`];
	const out = adapterViolations(adapter);
	const writeCall = new RegExp(
		`\\.(${DOOR_WRITE_METHODS.join("|")})\\(`,
		"g"
	);

	for (const [file, source] of sources) {
		if (file === DOOR_ADAPTER) continue;
		const code = codeOf(source);
		const text = scrub(source, true);

		if (/\bNUKI_WRITE_ENABLED\b/.test(text))
			out.push(
				`${file}: reads NUKI_WRITE_ENABLED; only ${DOOR_ADAPTER} may, through doorWritesEnabled()`
			);

		for (const match of code.matchAll(/\bsetDoorProviderForTests\(/g))
			if (!isFunctionDeclaration(code, match.index))
				out.push(
					`${file}:${String(lineOf(code, match.index))}: setDoorProviderForTests outside a test bypasses the write switch`
				);

		if (
			new RegExp(
				`\\bimport\\s+\\*\\s+as\\s+\\w+\\s+from\\s+"[^"]*${escapeRegExp(posix.basename(DOOR_ADAPTER))}"`
			).test(text)
		)
			out.push(
				`${file}: namespace import of ${DOOR_ADAPTER}; import the names it needs`
			);
		for (const [local, target] of relativeImports(file, code, source)) {
			const [targetFile, exported] = target.split("#");
			if (targetFile !== DOOR_ADAPTER) continue;
			if (DOOR_UNGATED_EXPORTS.includes(exported))
				out.push(
					`${file}: imports ${exported} from ${DOOR_ADAPTER}, which skips the write switch; use doorProvider({ requireWrites: true })`
				);
			if (
				exported === "doorProviderFromEnvironment" &&
				file !== DOOR_FACTORY_IMPORTER
			)
				out.push(
					`${file}: imports ${local} from ${DOOR_ADAPTER}; use doorProvider() from ${DOOR_FACTORY_IMPORTER}`
				);
		}

		const switchHelpers = functionBlocks(code, false)
			.filter((block) =>
				/\bdoorWritesEnabled\(/.test(code.slice(block.start, block.end))
			)
			.map((block) => block.name);
		for (const match of code.matchAll(writeCall)) {
			const before = code.slice(
				topLevelStart(code, match.index),
				match.index
			);
			const isGated =
				/\brequireWrites:\s*true\b/.test(before) ||
				/\bdoorWritesEnabled\(/.test(before) ||
				switchHelpers.some((helper) =>
					new RegExp(`\\b${helper}\\(`).test(before)
				);
			if (!isGated)
				out.push(
					`${file}:${String(lineOf(code, match.index))}: .${match[1]}() without the write switch; build the provider with doorProvider({ requireWrites: true }) or check doorWritesEnabled() first`
				);
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// The real tree
// ---------------------------------------------------------------------------

describe("security invariants (convex/)", () => {
	const sources = convexSources();

	it("reads the convex source tree", () => {
		expect(sources.has(DOOR_ADAPTER)).toBe(true);
		expect(sources.has(TOKEN_MINTER)).toBe(true);
		expect(publicFunctions(sources).length).toBeGreaterThan(
			Object.keys(PUBLIC_ON_PURPOSE).length
		);
	});

	it("every public function checks auth or is public on purpose", () => {
		const ungated = ungatedPublicFunctions(sources);
		const missing = ungated.filter((key) => !(key in PUBLIC_ON_PURPOSE));
		expect(
			missing,
			missing
				.map(
					(key) =>
						`${key}: add requireRole / personForCurrentUser (or a helper or internal query that calls one) to the handler, or list it in PUBLIC_ON_PURPOSE with a reason`
				)
				.join("\n")
		).toEqual([]);
		const stale = Object.keys(PUBLIC_ON_PURPOSE).filter(
			(key) => !ungated.includes(key)
		);
		expect(
			stale,
			stale
				.map(
					(key) =>
						`${key}: no longer an ungated public function; remove it from PUBLIC_ON_PURPOSE`
				)
				.join("\n")
		).toEqual([]);
	});

	it("public builders are called only at export const sites", () => {
		const hidden = hiddenPublicBuilders(sources);
		expect(
			hidden,
			`${hidden.join("\n")}\nExport each public function as \`export const name = query(...)\` so the auth-gate check can see it.`
		).toEqual([]);
	});

	it("operator modules export only internal functions", () => {
		expect(
			[...sources.keys()].filter((file) =>
				OPERATOR_MODULE.test(posix.basename(file))
			)
		).toEqual(
			expect.arrayContaining([
				"dev.ts",
				"seed.ts",
				"migrations.ts",
				"purge.ts",
			])
		);
		const violations = operatorModuleViolations(sources);
		expect(
			violations,
			`${violations.join("\n")}\nOperator modules use internalQuery / internalMutation / internalAction only.`
		).toEqual([]);
	});

	it(`confirm tokens are minted only in ${TOKEN_MINTER}`, () => {
		const violations = tokenMintViolations(sources);
		expect(
			violations,
			`${violations.join("\n")}\nInserts into confirmTokens; mint through ${TOKEN_MINTER} so the token is stored hashed.`
		).toEqual([]);
	});

	it("door writes go through the write switch", () => {
		const violations = doorWriteViolations(sources);
		expect(violations, violations.join("\n")).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Self-checks: each rule must flag a planted violation
// ---------------------------------------------------------------------------

describe("security invariants self-checks", () => {
	it("flags an ungated public function and accepts every kind of gate", () => {
		const sample = new Map([
			[
				"lib/guard.ts",
				`export async function requireMember(ctx) { return requireRole(ctx, ["member"]); }`,
			],
			[
				"other.ts",
				`function check(ctx) { return requireRole(ctx, ["board"]); }`,
			],
			[
				"sample.ts",
				[
					`import { requireMember } from "./lib/guard.ts";`,
					`function check(ctx) { return ctx.db.get("x"); }`,
					`function viaLocal(ctx) { return personForCurrentUser(ctx); }`,
					`export const leak = query({ args: {}, handler: async (ctx) => ctx.db.query("people").collect() });`,
					`export const commented = query({ args: {}, handler: async (ctx) => {`,
					`	// requireRole(ctx, ["board"])`,
					`	throw new Error("requireRole(ctx) missing");`,
					`} });`,
					`export const sameName = mutation({ args: {}, handler: async (ctx) => check(ctx) });`,
					`export const direct = query({ args: {}, handler: async (ctx) => { await requireRole(ctx, ["board"]); } });`,
					`export const identity = query({ args: {}, handler: async (ctx) => ctx.auth.getUserIdentity() });`,
					`export const helper = mutation({ args: {}, handler: async (ctx) => viaLocal(ctx) });`,
					`export const imported = mutation({ args: {}, handler: async (ctx) => requireMember(ctx) });`,
					`export const viaInternal = action({ args: {}, handler: async (ctx) => ctx.runQuery(internal.sample.gate, {}) });`,
					`export const viaUngatedInternal = action({ args: {}, handler: async (ctx) => ctx.runQuery(internal.sample.open, {}) });`,
					`export const gate = internalQuery({ args: {}, handler: async (ctx) => requireMember(ctx) });`,
					`export const open = internalQuery({ args: {}, handler: async (ctx) => null });`,
				].join("\n"),
			],
			[
				"http.ts",
				`http.route({ path: SECRET_PATH, method: "GET", handler: httpAction(async () => new Response("ok")) });`,
			],
		]);
		expect(
			// eslint-disable-next-line id-length -- conventional comparator parameter names
			ungatedPublicFunctions(sample).sort((a, b) => a.localeCompare(b))
		).toEqual([
			"http.ts:route SECRET_PATH",
			"sample.ts:commented",
			"sample.ts:leak",
			"sample.ts:sameName",
			"sample.ts:viaUngatedInternal",
		]);
	});

	it("sees a typed export and flags a public builder called elsewhere", () => {
		const sample = new Map([
			[
				"sample.ts",
				[
					`import { query, query as q, mutation, internalQuery } from "./_generated/server";`,
					`import type { action } from "./_generated/server";`,
					`function preset(name) { return mutation({ args: {}, handler: async () => name }); }`,
					`export const reset = preset("x");`,
					`export const typed: Typed = query({ args: {}, handler: async (ctx) => ctx.db.query("people").collect() });`,
					`export const aliased = q({ args: {}, handler: async () => null });`,
					`export const plain = mutation({ args: {}, handler: async () => null });`,
					`export const inner = internalQuery({ args: {}, handler: async () => null });`,
					`// mutation({}) in a comment`,
					`const later = action({});`,
				].join("\n"),
			],
		]);
		expect(
			// eslint-disable-next-line id-length -- conventional comparator parameter names
			hiddenPublicBuilders(sample).sort((a, b) => a.localeCompare(b))
		).toEqual([
			"sample.ts:3 calls mutation outside export const",
			"sample.ts:6 calls query outside export const",
		]);
		expect(ungatedPublicFunctions(sample)).toContain("sample.ts:typed");
	});

	it("flags a public builder in an operator module", () => {
		const sample = new Map([
			[
				"dev.ts",
				`import { mutation } from "./_generated/server";\nexport const reset = mutation({ args: {}, handler: async () => null });`,
			],
			[
				"notify/backfillThing.ts",
				`import { internalMutation, type MutationCtx } from "../_generated/server";\nexport const run = internalMutation({ args: {}, handler: async () => null });`,
			],
			[
				"migrateX.ts",
				`import { internalMutation, query } from "./_generated/server";\nimport type { QueryCtx } from "./_generated/server";`,
			],
			[
				"people.ts",
				`import { mutation } from "./_generated/server";\nexport const edit = mutation({});`,
			],
		]);
		expect(operatorModuleViolations(sample)).toEqual([
			"dev.ts:reset is a public mutation",
			"dev.ts imports the public builder mutation",
			"migrateX.ts imports the public builder query",
		]);
	});

	it("flags a confirm token minted outside the minter", () => {
		const insert = `await ctx.db.insert(\n\t"confirmTokens", { tokenHash });`;
		const sample = new Map([
			[TOKEN_MINTER, insert],
			[
				"people.ts",
				`// ctx.db.insert("confirmTokens") is not allowed here\n${insert}`,
			],
		]);
		expect(tokenMintViolations(sample)).toEqual(["people.ts:2"]);
	});

	describe("door writes", () => {
		const adapter = [
			`export function doorWritesEnabled(): boolean { return process.env.NUKI_WRITE_ENABLED === "1"; }`,
			`async function request(deps: NukiDeps, method: string, path: string): Promise<unknown> {`,
			`	return send();`,
			`	function send(): Promise<Response> { return deps.fetch(path, { method }); }`,
			`}`,
			`export async function revokeAuthIds(deps: NukiDeps, ids: string[]): Promise<void> {`,
			`	await request(deps, "DELETE", "/smartlock/auth", ids);`,
			`}`,
			`export function doorProviderFromEnvironment(options: { requireWrites: boolean }): DoorProvider {`,
			`	if (options.requireWrites && !doorWritesEnabled())`,
			`		return err({ type: "DoorWritesDisabled" });`,
			`	return nukiProvider({ fetch, token: "t" }, []);`,
			`}`,
			`export function nukiProvider(deps: NukiDeps, lockIds: string[]): DoorProvider {`,
			`	return {`,
			`		async readModel(): Promise<{ ok: boolean }> {`,
			`			return request(deps, "GET", "/smartlock");`,
			`		},`,
			`		revokeAuthIds(ids): Promise<void> {`,
			`			return revokeAuthIds(deps, ids);`,
			`		},`,
			`		async actuate(slot, action): Promise<DoorActionResult> {`,
			`			return request(deps, "POST", "/smartlock/1/action", {});`,
			`		},`,
			`	};`,
			`}`,
		].join("\n");
		const gatedCaller = [
			`import { doorProvider } from "./lib/doorProviderEnv.ts";`,
			`function revokeAllowed(): boolean { return doorWritesEnabled(); }`,
			`async function open(ctx, args) {`,
			`	const provider = doorProvider({ requireWrites: true });`,
			`	return provider.actuate(args.lock, "unlock");`,
			`}`,
			`export const revoke = internalAction({ args: {}, handler: async (ctx) => {`,
			`	if (!revokeAllowed()) return null;`,
			`	await doorProvider({ requireWrites: false }).revokeAuthIds(["1"]);`,
			`} });`,
		].join("\n");
		const factory = `import { doorProviderFromEnvironment } from "./nukiClient.ts";\nexport function doorProvider(opts) { return doorProviderFromEnvironment(opts); }`;

		function withFiles(extra: Record<string, string>): Map<string, string> {
			return new Map(
				Object.entries({
					[DOOR_ADAPTER]: adapter,
					[DOOR_FACTORY_IMPORTER]: factory,
					"doorActions.ts": gatedCaller,
					...extra,
				})
			);
		}

		it("accepts the gated structure", () => {
			expect(doorWriteViolations(withFiles({}))).toEqual([]);
		});

		it("flags a write call behind no switch", () => {
			const sample = withFiles({
				"doorHealth.ts": `async function poke() {\n\tconst p = doorProvider({ requireWrites: false });\n\tawait p.actuate("downstairs", "unlock");\n}`,
			});
			expect(doorWriteViolations(sample)).toEqual([
				`doorHealth.ts:3: .actuate() without the write switch; build the provider with doorProvider({ requireWrites: true }) or check doorWritesEnabled() first`,
			]);
		});

		it("flags an adapter write outside the listed write methods", () => {
			const sample = withFiles({
				[DOOR_ADAPTER]: adapter.replace(
					"\t\tasync actuate(",
					`\t\tasync grant(email): Promise<void> {\n\t\t\tawait request(deps, "PUT", "/smartlock/auth", { email });\n\t\t},\n\t\tasync actuate(`
				),
			});
			expect(doorWriteViolations(sample)).toEqual([
				`${DOOR_ADAPTER}:23: PUT request in grant; add it to DOOR_WRITE_METHODS so its call sites are checked`,
			]);
		});

		it("flags a factory that builds the provider without the switch", () => {
			const sample = withFiles({
				[DOOR_ADAPTER]: adapter.replace(
					'\tif (options.requireWrites && !doorWritesEnabled())\n\t\treturn err({ type: "DoorWritesDisabled" });\n',
					""
				),
			});
			expect(doorWriteViolations(sample)).toEqual([
				`${DOOR_ADAPTER}: doorProviderFromEnvironment must return an Err when requireWrites is set and doorWritesEnabled() is false, before building the provider`,
			]);
		});

		it("flags a bypass of the factory, the switch or the test injection", () => {
			const sample = withFiles({
				"doorRevoke.ts": [
					`import { nukiProvider } from "./lib/nukiClient.ts";`,
					`const on = process.env.NUKI_WRITE_ENABLED;`,
					`setDoorProviderForTests(fake);`,
				].join("\n"),
				"lib/occupancy/x.ts": `import { doorProviderFromEnvironment as make } from "../nukiClient.ts";`,
			});
			expect(doorWriteViolations(sample)).toEqual([
				`doorRevoke.ts: reads NUKI_WRITE_ENABLED; only ${DOOR_ADAPTER} may, through doorWritesEnabled()`,
				`doorRevoke.ts:3: setDoorProviderForTests outside a test bypasses the write switch`,
				`doorRevoke.ts: imports nukiProvider from ${DOOR_ADAPTER}, which skips the write switch; use doorProvider({ requireWrites: true })`,
				`lib/occupancy/x.ts: imports make from ${DOOR_ADAPTER}; use doorProvider() from ${DOOR_FACTORY_IMPORTER}`,
			]);
		});
	});
});
