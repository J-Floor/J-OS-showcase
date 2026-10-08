import { createContext, useContext, type Accessor, type JSX } from "solid-js";

import { ICONS } from "../../icons.ts";

export type TStatus = "success" | "error" | "warning" | "info" | "neutral";

const iconByStatus: Record<TStatus, string> = {
	success: ICONS.check,
	error: ICONS.error,
	warning: ICONS.warning,
	info: ICONS.info,
	neutral: "crop_square",
};

const StatusContext = createContext<Accessor<string>>();

/** Reactive accessor for the current status's icon name. Use within <Status>. */
export function useStatusIcon(): Accessor<string> {
	const ctx = useContext(StatusContext);
	if (!ctx) {
		throw new Error("useStatusIcon must be used within a <Status>");
	}
	return ctx;
}

export type StatusProps = {
	status?: TStatus;
	/** Icon ligature to use when status is "neutral". */
	neutralIconName?: string;
	class?: string;
	children: JSX.Element;
};

export function Status(props: StatusProps): JSX.Element {
	function status(): TStatus {
		return props.status ?? "neutral";
	}
	function iconName(): string {
		return status() === "neutral"
			? (props.neutralIconName ?? iconByStatus.neutral)
			: iconByStatus[status()];
	}

	return (
		<StatusContext.Provider value={iconName}>
			<div data-status={status()} class={props.class}>
				{props.children}
			</div>
		</StatusContext.Provider>
	);
}
