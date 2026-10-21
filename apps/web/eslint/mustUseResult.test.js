// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";

import { mustUseResult } from "./mustUseResult.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const fixtures = fileURLToPath(new URL("fixtures", import.meta.url));
// Each case is linted as this file, which the fixture project includes. The
// cases import the real consumer modules, so the test also breaks if one
// moves without the rule.
const CASE_FILE = `${fixtures}/case.tsx`;
const WITH_TIMEOUT_FILE = fileURLToPath(
	new URL("../src/lib/withTimeout.ts", import.meta.url)
);

const ruleTester = new RuleTester({
	languageOptions: {
		parser: tseslint.parser,
		parserOptions: {
			project: "./tsconfig.json",
			tsconfigRootDir: fixtures,
			// typescript-eslint switches to "single run" when CI=true: it builds
			// the program once from disk and never sees RuleTester's in-memory
			// code, so every import in a case resolved to the fixture file and
			// TypeScript crashed reporting the missing members.
			disallowAutomaticSingleRunInference: true,
			ecmaFeatures: { jsx: true },
		},
	},
});

const HELPERS = `
import { err, errAsync, ok, type Result, ResultAsync } from "neverthrow";
import type { AppError } from "../../convex/lib/errors/index.ts";

async function asyncResult(): Promise<Result<number, string>> {
  return Promise.resolve(ok(1));
}
function plainResult(value: number): Result<number, string> {
  return value > 0 ? ok(value) : err("negative");
}
function resultAsync(): ResultAsync<number, string> {
  return ResultAsync.fromSafePromise(Promise.resolve(1));
}
function refusal(): Result<number, AppError> {
  return err({ type: "Forbidden" });
}
void [asyncResult, plainResult, resultAsync, refusal, errAsync];
`;

function valid(name, body) {
	return { name, filename: CASE_FILE, code: `${HELPERS}\n${body}` };
}
function invalid(name, body) {
	return {
		...valid(name, body),
		errors: [{ messageId: "mustUseResult" }],
	};
}

ruleTester.run("must-use-result", mustUseResult, {
	valid: [
		// Uses of a Result (the probe's clean block).
		valid(
			"awaits Promise.all of Results into a variable",
			`export async function f(values: number[]) {
        const all = await Promise.all(values.map(async (value) => plainResult(value)));
        return all;
      }`
		),
		valid(
			"awaits a Promise<Result> into a variable it returns",
			`export async function f() {
        const first = await asyncResult();
        return first;
      }`
		),
		valid(
			".then with a callback that reads the Result",
			`export async function f() {
        await resultAsync().then((result) => result.isOk());
      }`
		),
		valid(
			"returns an array of Results",
			`export function f(values: number[]) {
        return values.map((value) => plainResult(value));
      }`
		),
		// C1: only the real consumers exempt a Result handed to them.
		valid(
			"hands a Result to the real unwrap",
			`import { unwrap } from "../../convex/lib/result.ts";
      export function f(): void {
        unwrap(refusal());
      }`
		),
		valid(
			"hands a Result to the real unwrapLogged",
			`import { unwrapLogged } from "../../convex/lib/result.ts";
      export function f(): void {
        unwrapLogged(refusal(), "Merge");
      }`
		),
		valid(
			"hands a Result to trackResult, destructured",
			`import { call } from "../../src/lib/call.ts";
      import { createActionError } from "../../src/shared/createActionError.ts";
      export async function f() {
        const { trackResult } = createActionError();
        await trackResult(call(Promise.resolve(1), "Could not save."));
      }`
		),
		valid(
			"hands a Result to trackResult as a method, and drops what it returns",
			`import { call } from "../../src/lib/call.ts";
      import { createActionError } from "../../src/shared/createActionError.ts";
      export function f() {
        const saveError = createActionError();
        void saveError.trackResult(call(Promise.resolve(1), "Could not save."));
      }`
		),
		valid(
			"hands a Result to settleRosterAction",
			`import { settleRosterAction } from "../../src/modules/community/actions/RosterActionError.tsx";
      export async function f() {
        await settleRosterAction("members", undefined, errAsync({ code: "Forbidden", message: "No." }));
      }`
		),
		{
			name: "withTimeout's resolver hands the Result on",
			filename: WITH_TIMEOUT_FILE,
			code: readFileSync(WITH_TIMEOUT_FILE, "utf8"),
		},
		// C2: the counterparts of the invalid cases below.
		valid(
			"returns a Promise<Result> to a callback whose return is read",
			`function onSave(handler: () => Promise<Result<number, string>>) {
        return handler;
      }
      export function f() {
        onSave(() => asyncResult());
      }`
		),
		valid(
			".then with a named handler that takes the Result",
			`function read(result: Result<number, string>): boolean {
        return result.isOk();
      }
      export async function f() {
        await resultAsync().then(read);
      }`
		),
		valid(
			"assigns a Promise<Result> to a variable",
			`let latest: Promise<Result<number, string>> | undefined;
      export function f() {
        latest = asyncResult();
        return latest;
      }`
		),
	],
	invalid: [
		// The probe's holes.
		invalid(
			"voids a Promise<Result>",
			"export function f() { void asyncResult(); }"
		),
		invalid(
			"drops a Promise<Result> statement",
			"export function f() { asyncResult(); }"
		),
		invalid(
			"awaits Promise.all of Results as a statement",
			`export async function f(values: number[]) {
        await Promise.all(values.map(async (value) => plainResult(value)));
      }`
		),
		invalid(
			"voids Promise.all of Results",
			`export function f(values: number[]) {
        void Promise.all(values.map(async () => asyncResult()));
      }`
		),
		invalid(
			".then with a callback that ignores the Result",
			"export async function f() { await resultAsync().then(() => null); }"
		),
		invalid(
			"returns a Result from a setTimeout callback",
			"export function f() { setTimeout(() => plainResult(1), 0); }"
		),
		invalid(
			"returns a Promise<Result> from an event handler",
			'export const f = () => <button type="button" onClick={() => asyncResult()} />;'
		),
		invalid(
			"voids a Promise<Result> in an event handler",
			'export const f = () => <button type="button" onClick={() => void asyncResult()} />;'
		),
		invalid(
			"voids a Result in an event handler",
			'export const f = () => <button type="button" onClick={() => void plainResult(1)} />;'
		),
		invalid(
			"returns a Result from an event handler's block",
			`export const f = () => (
        <button
          type="button"
          onClick={() => {
            return plainResult(2);
          }}
        />
      );`
		),
		// C1: a lookalike of a consumer's name does not consume.
		invalid(
			"hands a Result to an unwrap declared elsewhere",
			`import { unwrap } from "./lookalikes.ts";
      export function f(): void {
        unwrap(plainResult(1));
      }`
		),
		invalid(
			"hands a Result to a trackResult declared elsewhere",
			`import { trackResult } from "./lookalikes.ts";
      export function f(): void {
        trackResult(plainResult(1));
      }`
		),
		invalid(
			"resolves a Promise with a Result outside withTimeout",
			`export function f() {
        return new Promise<Result<number, string>>((resolve) => {
          resolve(err("late"));
        });
      }`
		),
		// C2: a callback typed void | Promise<void> discards what it returns.
		invalid(
			"returns a Promise<Result> to a void | Promise<void> callback",
			`function onCommit(handler: () => void | Promise<void>) {
        return handler;
      }
      export function f() {
        onCommit(() => asyncResult());
      }`
		),
		// C2: a named .then handler that takes nothing drops the Result.
		invalid(
			".then with a named handler that takes no parameter",
			`function ignore(): null {
        return null;
      }
      export async function f() {
        await resultAsync().then(ignore);
      }`
		),
	],
});
