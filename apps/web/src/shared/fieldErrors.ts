import type { Accessor } from "solid-js";

/** What a field takes to show its error: `invalid` and the text. */
export type FieldErrorProps = {
	invalid: boolean;
	errorText: string | undefined;
};

/**
 * Field-error helpers for a form that shows errors only after a submit
 * attempt. `errProps` gives a field the `invalid` / `errorText` pair from one
 * error string.
 */
export function createFieldErrors(showErrors: Accessor<boolean>): {
	errProps: (field: string | null) => FieldErrorProps;
} {
	function errProps(field: string | null): FieldErrorProps {
		const text = showErrors() && field ? field : undefined;
		return { invalid: Boolean(text), errorText: text };
	}

	return { errProps };
}
