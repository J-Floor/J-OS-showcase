/**
 * Turns crapper and dryer output into pass or fail. Neither tool has an exclude
 * flag or an ignore comment, so both live here.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";

type Source = { path: string; text: string };
export type CrapEntry = {
	name: string;
	namespace: string;
	crap: number | null;
};
type DryPair = {
	left: { file: string; startLine: number };
	right: { file: string; startLine: number };
};

type FunctionInfo = {
	name: string;
	line: number;
	hasJsx: boolean;
	/** The class a method or constructor belongs to; undefined for a plain function. */
	owner: string | undefined;
};
type IgnoreComment = { path: string; line: number; reason: string | undefined };

const CRAP_THRESHOLD = 30;
const CRAP_ENTRY =
	/:name "([^"]+)", :namespace "([^"]+)", :complexity \d+, :coverage (?:[\d.]+|nil), :crap ([\d.]+|nil)/g;
const DRY_PAIR =
	/:left \{:file "([^"]+)", :start-line (\d+)[^}]*\}\s*:right \{:file "([^"]+)", :start-line (\d+)/g;
const DRY_ROOTS = [
	"apps/web/convex/",
	"apps/web/src/",
	"apps/web/emails/",
	"apps/web/agreements/",
	"packages/design-system/src/",
	"apps/landing-page/src/",
];

export function parseCrapEdn(text: string): CrapEntry[] {
	const entries = [...text.matchAll(CRAP_ENTRY)].map((match) => ({
		name: match[1],
		namespace: match[2],
		crap: match[3] === "nil" ? null : Number(match[3]),
	}));
	if (entries.length !== text.split(":name ").length - 1) {
		throw new Error("crap.edn holds an entry this script cannot read.");
	}
	if (entries.length === 0) {
		throw new Error("crap.edn holds no entries.");
	}
	return entries;
}

export function parseDryEdn(text: string): DryPair[] {
	const pairs = [...text.matchAll(DRY_PAIR)].map((match) => ({
		left: { file: match[1], startLine: Number(match[2]) },
		right: { file: match[3], startLine: Number(match[4]) },
	}));
	if (pairs.length !== text.split(":score ").length - 1) {
		throw new Error("dry.edn holds a pair this script cannot read.");
	}
	return pairs;
}

function containsJsx(node: ts.Node): boolean {
	if (
		ts.isJsxElement(node) ||
		ts.isJsxSelfClosingElement(node) ||
		ts.isJsxFragment(node)
	) {
		return true;
	}
	return ts.forEachChild(node, containsJsx) ?? false;
}

function functionsIn(source: Source): FunctionInfo[] {
	const file = ts.createSourceFile(
		source.path,
		source.text,
		ts.ScriptTarget.Latest,
		true,
		source.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
	);
	function lineOf(node: ts.Node): number {
		return file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
	}
	const found: FunctionInfo[] = [];
	for (const statement of file.statements) {
		if (ts.isFunctionDeclaration(statement) && statement.name) {
			found.push({
				name: statement.name.text,
				line: lineOf(statement),
				hasJsx: containsJsx(statement),
				owner: undefined,
			});
		}
		if (ts.isVariableStatement(statement)) {
			for (const declaration of statement.declarationList.declarations) {
				if (ts.isIdentifier(declaration.name) && declaration.initializer) {
					found.push({
						name: declaration.name.text,
						line: lineOf(statement),
						hasJsx: containsJsx(declaration.initializer),
						owner: undefined,
					});
				}
			}
		}
		if (ts.isClassDeclaration(statement) && statement.name) {
			for (const member of statement.members) {
				const name = ts.isConstructorDeclaration(member)
					? "constructor"
					: ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)
						? member.name.text
						: undefined;
				if (name === undefined) continue;
				found.push({
					name,
					line: lineOf(member),
					hasJsx: containsJsx(member),
					owner: statement.name.text,
				});
			}
		}
	}
	return found;
}

function ignoresIn(source: Source, marker: string): IgnoreComment[] {
	const pattern = new RegExp(`^\\s*//\\s*${marker}\\b(?:\\s+--\\s+(\\S.*))?\\s*$`);
	return source.text.split("\n").flatMap((text, index) => {
		const match = pattern.exec(text);
		return match
			? [{ path: source.path, line: index + 1, reason: match[1] }]
			: [];
	});
}

function namespaceOf(path: string): string {
	return path
		.replace(/\.(ts|tsx)$/, "")
		.replace(/^src\//, "")
		.replaceAll("/", ".");
}

function isGeneratedOrDemo(path: string): boolean {
	return /(^|\/)(generated|_generated)\//.test(path) || /\.demo\.tsx?$/.test(path);
}

/** Crapper names a method's namespace after its module plus the class. */
function resolveSource(
	namespace: string,
	byNamespace: Map<string, Source[]>
): { source: Source; owner: string | undefined } | undefined {
	const direct = byNamespace.get(namespace);
	if (direct) return direct.length === 1 ? { source: direct[0], owner: undefined } : undefined;
	const cut = namespace.lastIndexOf(".");
	const parent = byNamespace.get(namespace.slice(0, Math.max(0, cut)));
	return parent?.length === 1
		? { source: parent[0], owner: namespace.slice(cut + 1) }
		: undefined;
}

/**
 * Collects the ignore comments of one kind, reports those with no reason, and
 * later reports those nothing used.
 */
function ignoreBook(sources: Source[], marker: string) {
	const ignores = sources.flatMap((source) => ignoresIn(source, marker));
	const used = new Set<IgnoreComment>();
	return {
		ignores,
		used,
		missingReasons: ignores
			.filter((ignore) => ignore.reason === undefined)
			.map((ignore) => `${ignore.path}:${ignore.line}: ${marker} needs a reason after --`),
		stale: () =>
			ignores
				.filter((ignore) => !used.has(ignore) && ignore.reason !== undefined)
				.map((ignore) => `${ignore.path}:${ignore.line}: stale ${marker}, remove it`),
	};
}

export function checkCrap(
	entries: CrapEntry[],
	sources: Source[],
	threshold: number
): string[] {
	const byNamespace = new Map<string, Source[]>();
	for (const source of sources) {
		const namespace = namespaceOf(source.path);
		byNamespace.set(namespace, [...(byNamespace.get(namespace) ?? []), source]);
	}
	const { ignores, used, missingReasons, stale } = ignoreBook(sources, "crap-ignore");
	const problems = [...missingReasons];

	for (const entry of entries) {
		const resolved = resolveSource(entry.namespace, byNamespace);
		if (!resolved) {
			problems.push(`cannot resolve namespace ${entry.namespace} (${entry.name})`);
			continue;
		}
		const { source, owner } = resolved;
		if (entry.crap === null || entry.crap <= threshold || isGeneratedOrDemo(source.path)) {
			continue;
		}
		const found = functionsIn(source).find(
			(candidate) => candidate.name === entry.name && candidate.owner === owner
		);
		if (!found) {
			problems.push(`cannot resolve function ${entry.name} in ${source.path}`);
			continue;
		}
		if (found.hasJsx) continue;
		const ignore = ignores.find(
			(candidate) => candidate.path === source.path && candidate.line === found.line - 1
		);
		if (ignore) {
			used.add(ignore);
			continue;
		}
		problems.push(
			`${source.path}:${found.line}: ${entry.name} scores ${entry.crap}, above ${threshold}`
		);
	}
	return [...problems, ...stale()];
}

export function checkDry(pairs: DryPair[], sources: Source[]): string[] {
	const paths = new Set(sources.map((source) => source.path));
	const { ignores, used, missingReasons, stale } = ignoreBook(sources, "dry-ignore");
	const problems = [...missingReasons];

	for (const { left, right } of pairs) {
		if (!paths.has(left.file) || !paths.has(right.file)) {
			problems.push(`cannot resolve pair ${left.file} and ${right.file}`);
			continue;
		}
		const matching = ignores.filter(
			(ignore) =>
				(ignore.path === left.file && ignore.line === left.startLine - 1) ||
				(ignore.path === right.file && ignore.line === right.startLine - 1)
		);
		for (const ignore of matching) used.add(ignore);
		if (matching.length === 0) {
			problems.push(
				`duplicate: ${left.file}:${left.startLine} and ${right.file}:${right.startLine}`
			);
		}
	}
	return [...problems, ...stale()];
}

export function isDryFile(path: string): boolean {
	return (
		DRY_ROOTS.some((root) => path.startsWith(root)) &&
		path.endsWith(".ts") &&
		!path.endsWith(".d.ts") &&
		!path.endsWith(".test.ts") &&
		!isGeneratedOrDemo(path)
	);
}

function trackedFiles(directory: string): string[] {
	const listing = execFileSync(
		"git",
		["ls-files", "--cached", "--others", "--exclude-standard", "--", directory],
		{ encoding: "utf8" }
	);
	return [...new Set(listing.split("\n"))].filter((path) => path !== "" && existsSync(path));
}

function report(problems: string[]): void {
	for (const problem of problems) console.error(problem);
	if (problems.length > 0) process.exit(1);
}

function runCrap(argument: string): void {
	const packageDir = argument.replace(/\/+$/, "");
	const prefix = `${packageDir}/`;
	const sources = trackedFiles(packageDir)
		.filter((path) => /\.tsx?$/.test(path) && !/\.(test|d)\.tsx?$/.test(path))
		.map((path) => ({
			path: path.slice(prefix.length),
			text: readFileSync(path, "utf8"),
		}));
	const edn = readFileSync(join(packageDir, ".metrics/crap.edn"), "utf8");
	report(checkCrap(parseCrapEdn(edn), sources, CRAP_THRESHOLD));
}

function runDry(): void {
	const sources = trackedFiles(".")
		.filter(isDryFile)
		.map((path) => ({ path, text: readFileSync(path, "utf8") }));
	report(checkDry(parseDryEdn(readFileSync(".metrics/dry.edn", "utf8")), sources));
}

if (import.meta.main) {
	const [command, argument] = process.argv.slice(2);
	if (command === "crap" && argument) runCrap(argument);
	else if (command === "dry") runDry();
	else if (command === "dry-files") console.log(trackedFiles(".").filter(isDryFile).join("\n"));
	else {
		console.error("Usage: gate.ts crap <packageDir> | dry | dry-files");
		process.exit(2);
	}
}
