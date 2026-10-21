// neverthrow/must-use-result, our version: the plugin's rule with fewer false
// reports (a Result handed to a function that really consumes it) and more
// real ones (a Promise of a Result, or a Result returned where nobody reads
// it). Tested by mustUseResult.test.js.
import neverthrow from "@ninoseki/eslint-plugin-neverthrow";
import ts from "typescript";

/** How to handle a Result. Used by this rule's message and by the
 *  `_unsafeUnwrap` bans in eslint.config.js. */
export const HANDLE_RESULT =
	"Return it, unwrap() it at the handler edge, or check isErr() / match(). Never _unsafeUnwrap.";

// The plugin doesn't count handing a Result to a function as a use, so
// unwrap(await requireRole(...)) is reported. Only these functions really
// consume a Result, and a call counts only when the type checker resolves it
// to the declaration in that file: a lookalike of the same name elsewhere is
// still a drop.
// unwrap: the handler-edge unwrap (throws the Err).
// unwrapLogged: logs a refusal's internal detail, then unwraps.
// trackResult: shows the Err in the area of the action and hands the Result
// back; called bare or as a method (saveError.trackResult(...)). Its own
// returned Result may be dropped: the Err is already shown.
// settleRosterAction: shows the Err in the roster tab's error area.
const RESULT_CONSUMERS = {
	"convex/lib/result.ts": ["unwrap", "unwrapLogged"],
	"src/shared/createActionError.ts": ["trackResult"],
	"src/modules/community/actions/RosterActionError.tsx": [
		"settleRosterAction",
	],
};
// A Promise resolver hands the Result on to whoever awaits the Promise. Its
// signature is declared in TypeScript's lib, so it is recognised by where its
// parameter is declared instead: only in withTimeout's race.
const RESOLVER_FILE = "/src/lib/withTimeout.ts";

const RESULT_METHODS = [
	"mapErr",
	"map",
	"andThen",
	"orElse",
	"match",
	"unwrapOr",
];

function isFunctionNode(node) {
	return (
		node?.type === "ArrowFunctionExpression" ||
		node?.type === "FunctionExpression"
	);
}

function constituents(type) {
	return type.isUnion() ? type.types : [type];
}

function isVoid(type) {
	return (type.flags & ts.TypeFlags.Void) !== 0;
}

/** The type checks that decide whether a value is, or carries, a Result. */
function resultTypeTools(checker) {
	// The plugin recognises a Result only by its methods, so a Promise<Result>
	// (an async function's return), an array of Results (Promise.all) and a
	// Result returned to a caller that ignores it all slip through. These
	// resolve the awaited type and apply the same test.
	function isResultType(type) {
		return constituents(checker.getApparentType(type)).some((member) =>
			RESULT_METHODS.every(
				(method) => member.getProperty(method) !== undefined
			)
		);
	}
	function isListType(member) {
		return [
			checker.isArrayType(member),
			checker.isTupleType(member),
		].includes(true);
	}
	function carriesResult(type) {
		const awaited = checker.getAwaitedType(type) ?? type;
		const elements = constituents(awaited)
			.filter((member) => isListType(member))
			.flatMap((member) => checker.getTypeArguments(member));
		return [awaited, ...elements].some((candidate) =>
			isResultType(candidate)
		);
	}
	// `void`, `Promise<void>` or `void | Promise<void>`: nothing to read.
	function returnsNothing(type) {
		return constituents(type).every(
			(member) =>
				isVoid(member) ||
				isVoid(checker.getAwaitedType(member) ?? member)
		);
	}
	return { isResultType, carriesResult, returnsNothing };
}

/** Which calls really consume a Result, per RESULT_CONSUMERS. */
function consumerTools(checker, toTs) {
	function isResolver(callee) {
		if (callee.type !== "Identifier") return false;
		const declaration = checker.getSymbolAtLocation(
			toTs(callee)
		)?.valueDeclaration;
		return (
			declaration !== undefined &&
			ts.isParameter(declaration) &&
			declaration.getSourceFile().fileName.endsWith(RESOLVER_FILE)
		);
	}
	function isConsumer(callNode) {
		if (isResolver(callNode.callee)) return true;
		const declaration = checker.getResolvedSignature(
			toTs(callNode)
		)?.declaration;
		const name = declaration?.name?.getText();
		if (name === undefined) return false;
		const fileName = declaration.getSourceFile().fileName;
		return Object.entries(RESULT_CONSUMERS).some(
			([file, names]) =>
				fileName.endsWith(`/${file}`) && names.includes(name)
		);
	}
	function isConsumerCall(node) {
		const callNode = node.type === "AwaitExpression" ? node.argument : node;
		return callNode.type === "CallExpression" && isConsumer(callNode);
	}
	function isHandedOn(node) {
		const parent = node?.parent;
		return parent?.type === "ConditionalExpression" && parent.test !== node
			? isHandedOn(parent)
			: parent?.type === "CallExpression" &&
					parent.arguments.includes(node) &&
					isConsumer(parent);
	}
	return { isConsumerCall, isHandedOn };
}

/** The checks that need the type checker, bound to one file's program. */
function typeTools(context) {
	const services = context.sourceCode.parserServices;
	const checker = services.program.getTypeChecker();
	function toTs(node) {
		return services.esTreeNodeToTSNodeMap.get(node);
	}
	function typeOf(node) {
		return checker.getTypeAtLocation(toTs(node));
	}
	const { isResultType, carriesResult, returnsNothing } =
		resultTypeTools(checker);

	// A function whose every contextual signature returns nothing (an event
	// handler, a setTimeout callback): whatever it returns is thrown away.
	function returnIsDiscarded(node) {
		const contextual = checker.getContextualType(toTs(node));
		if (!contextual) return false;
		const signatures = constituents(contextual).flatMap((member) =>
			member.getCallSignatures()
		);
		return (
			signatures.length > 0 &&
			signatures.every((signature) =>
				returnsNothing(checker.getReturnTypeOfSignature(signature))
			)
		);
	}

	// Whether a .then callback takes the Result it is handed. A named handler
	// does if it has a parameter; an inline one if it uses its parameter.
	function callbackTakesResult(callback) {
		if (!isFunctionNode(callback)) {
			return typeOf(callback)
				.getCallSignatures()
				.some((signature) => signature.getParameters().length > 0);
		}
		const [parameter] = callback.params;
		if (!parameter) return false;
		if (parameter.type !== "Identifier") return true;
		const variable = context.sourceCode
			.getDeclaredVariables(callback)
			.find((declared) => declared.name === parameter.name);
		return (variable?.references.length ?? 0) > 0;
	}

	// A ResultAsync is thenable, and .then(callback) is how the callback
	// receives the Result; the plugin doesn't count that either. It counts only
	// when the callback takes the Result: .then(() => ...) drops it.
	function isThenned(node) {
		const member = node?.parent;
		if (
			member?.type !== "MemberExpression" ||
			member.object !== node ||
			member.property.name !== "then" ||
			member.parent?.type !== "CallExpression"
		) {
			return false;
		}
		const [callback] = member.parent.arguments;
		return callback !== undefined && callbackTakesResult(callback);
	}

	return {
		typeOf,
		isResultType,
		carriesResult,
		returnIsDiscarded,
		...consumerTools(checker, toTs),
		isThenned,
	};
}

function enclosingFunction(node) {
	let current = node.parent;
	while (
		current &&
		!isFunctionNode(current) &&
		current.type !== "FunctionDeclaration"
	) {
		current = current.parent;
	}
	return current;
}

function isVoidExpression(node) {
	return node.type === "UnaryExpression" && node.operator === "void";
}

function discardedResultChecks(context, tools) {
	function report(node) {
		if (!tools.isConsumerCall(node))
			context.report({ node, messageId: "mustUseResult" });
	}
	function checkReturned(expression, enclosing) {
		if (
			isFunctionNode(enclosing) &&
			!tools.isHandedOn(expression) &&
			tools.carriesResult(tools.typeOf(expression)) &&
			tools.returnIsDiscarded(enclosing)
		) {
			report(expression);
		}
	}
	return {
		// A statement drops its value. A bare Result is the plugin's to report;
		// a Promise of one, or an array of them, is ours. An assignment keeps
		// the value.
		ExpressionStatement: (statement) => {
			const { expression } = statement;
			if (expression.type === "AssignmentExpression") return;
			const dropped = isVoidExpression(expression)
				? expression.argument
				: expression;
			const type = tools.typeOf(dropped);
			if (!tools.isResultType(type) && tools.carriesResult(type))
				report(dropped);
		},
		// `() => void x` drops x even though the plugin sees it as returned.
		"ArrowFunctionExpression[expression=true]": (arrow) => {
			const { body } = arrow;
			if (!isVoidExpression(body)) {
				checkReturned(body, arrow);
				return;
			}
			if (tools.carriesResult(tools.typeOf(body.argument)))
				report(body.argument);
		},
		"ReturnStatement[argument]": (statement) => {
			checkReturned(statement.argument, enclosingFunction(statement));
		},
	};
}

const pluginRule = neverthrow.rules["must-use-result"];

export const mustUseResult = {
	...pluginRule,
	meta: {
		...pluginRule.meta,
		messages: { mustUseResult: `This Result is dropped. ${HANDLE_RESULT}` },
	},
	create: (context) => {
		const tools = typeTools(context);
		return {
			...pluginRule.create(
				Object.create(context, {
					report: {
						value: (descriptor) => {
							if (
								!tools.isHandedOn(descriptor.node) &&
								!tools.isConsumerCall(descriptor.node) &&
								!tools.isThenned(descriptor.node)
							) {
								context.report(descriptor);
							}
						},
					},
				})
			),
			...discardedResultChecks(context, tools),
		};
	},
};
