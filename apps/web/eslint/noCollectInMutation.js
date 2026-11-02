// convex/no-collect-in-mutation: a mutation runs in one transaction, and a
// transaction has read limits. A .collect() over a table that keeps growing
// works until the day it crosses them, then aborts the whole mutation every
// time. Syntactic only: it reports .collect() anywhere inside the handler of
// mutation(...) or internalMutation(...), callbacks included. A read that is
// bounded by construction takes an inline disable with the reason. Tested by
// noCollectInMutation.test.js.

const MUTATION_BUILDERS = ["mutation", "internalMutation"];
const OTHER_BUILDERS = [
	"query",
	"internalQuery",
	"action",
	"internalAction",
	"httpAction",
];

function isFunctionNode(node) {
	return (
		node.type === "ArrowFunctionExpression" ||
		node.type === "FunctionExpression" ||
		node.type === "FunctionDeclaration"
	);
}

function calleeName(call) {
	return call?.type === "CallExpression" && call.callee.type === "Identifier"
		? call.callee.name
		: null;
}

/** The `handler` property a function is the value of, if any. */
function handlerProperty(candidate) {
	const property = candidate.parent;
	if (property?.type !== "Property" || property.value !== candidate)
		return null;
	const { key } = property;
	const name = key.type === "Identifier" ? key.name : key.value;
	return name === "handler" ? property : null;
}

/** The builder of `builder({ handler })` a function is the handler of. An
 *  ordinary object's `handler` property returns null. */
function optionsBuilderOf(candidate) {
	const options = handlerProperty(candidate)?.parent;
	const call = options?.parent;
	return options?.type === "ObjectExpression" &&
		call?.arguments?.[0] === options
		? calleeName(call)
		: null;
}

/** The Convex builder a function is the handler of, if any: the callee of
 *  `builder({ handler })`, or `httpAction` for `httpAction(handler)`. */
function builderOf(candidate) {
	const call = candidate.parent;
	return call?.arguments?.[0] === candidate &&
		calleeName(call) === "httpAction"
		? "httpAction"
		: optionsBuilderOf(candidate);
}

/** Whether a node sits inside a mutation's handler: the nearest enclosing
 *  function that is a recognised Convex builder's handler decides. Callbacks
 *  in between, an ordinary `handler` property included, are walked past. */
function isInMutationHandler(node) {
	for (let current = node.parent; current; current = current.parent) {
		if (!isFunctionNode(current)) continue;
		const builder = builderOf(current);
		if (MUTATION_BUILDERS.includes(builder)) return true;
		if (OTHER_BUILDERS.includes(builder)) return false;
	}
	return false;
}

/** ESLint rule: no .collect() inside a Convex mutation's handler. */
export const noCollectInMutation = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow .collect() in a Convex mutation handler: transactions have read limits.",
		},
		schema: [],
		messages: {
			unbounded:
				"Never .collect() an unbounded table in a mutation: transactions have read limits. Read through an index with .take(N) and let a cron or cursor converge (convex/AGENTS.md).",
		},
	},
	create: (context) => ({
		"CallExpression[callee.type='MemberExpression'][callee.property.name='collect']":
			(node) => {
				if (isInMutationHandler(node))
					context.report({ node, messageId: "unbounded" });
			},
	}),
};
