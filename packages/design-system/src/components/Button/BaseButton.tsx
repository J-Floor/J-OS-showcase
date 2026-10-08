import clsx from "clsx";
import {
	createSignal,
	splitProps,
	type JSX,
	type ValidComponent,
} from "solid-js";
import { Dynamic } from "solid-js/web";

import {
	separateDisablingProps,
	type PropsWithDisabling,
} from "../../utils/disablingProps.ts";
import { MakeDisablable } from "../MakeDisablable/MakeDisablable.tsx";

import styles from "./Button.module.scss";

export type BaseButtonProps = {
	/** Render as a different element/component (Solid port of EmboUI's `asChild`). */
	as?: ValidComponent;
	/** Link target when rendered `as="a"`. */
	href?: string;
	/** Anchor `target`, e.g. `"_blank"`, when rendered `as="a"`. */
	target?: JSX.AnchorHTMLAttributes<HTMLAnchorElement>["target"];
	/** Anchor `rel`, e.g. `"noreferrer"`, when rendered `as="a"`. */
	rel?: string;
	/** Controlled loading state. */
	isLoading?: boolean;
	/**
	 * Notified when the internal async-click loading state changes, letting a
	 * styled wrapper (e.g. Button) drive its own `data-loading`.
	 */
	setIsLoading?: (isLoading: boolean) => void;
	class?: string;
	children?: JSX.Element;
	onClick?: (
		event: MouseEvent & {
			currentTarget: HTMLButtonElement;
			target: Element;
		}
		// eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- it's a return type
	) => void | Promise<unknown>;
	ref?: HTMLElement | ((el: HTMLElement) => void);
} & PropsWithDisabling &
	Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "ref">;

export function BaseButton(props: BaseButtonProps): JSX.Element {
	const [others, disabling] = separateDisablingProps(props);
	const [local, rest] = splitProps(others, [
		"as",
		"isLoading",
		"setIsLoading",
		"class",
		"children",
		"onClick",
		"ref",
	]);

	const [isClickHandlerExecuting, setClickHandlerExecuting] =
		createSignal(false);

	function combinedIsLoading(): boolean {
		return (
			!disabling.disabled &&
			((local.isLoading ?? false) || isClickHandlerExecuting())
		);
	}

	function handleClick(
		event: MouseEvent & {
			currentTarget: HTMLButtonElement;
			target: Element;
		}
	) {
		if (!local.onClick || combinedIsLoading()) {
			return;
		}

		const result = local.onClick(event);

		if (result instanceof Promise) {
			setClickHandlerExecuting(true);
			local.setIsLoading?.(true);
			// eslint-disable-next-line solid/reactivity -- promise-completion callback, behaves like an event handler
			void result.finally(() => {
				setClickHandlerExecuting(false);
				local.setIsLoading?.(false);
			});
		}
	}

	// `type="button"` is only meaningful (and valid) on an actual <button>; a
	// pill rendered `as="a"` must not carry it.
	function isNativeButton(): boolean {
		return (local.as ?? "button") === "button";
	}

	return (
		<MakeDisablable
			disabled={disabling.disabled}
			disabledReason={disabling.disabledReason}
			shamefullyOmitDisabledReason={
				disabling.shamefullyOmitDisabledReason
			}
			disabledReasonTooltipId={disabling.disabledReasonTooltipId}
		>
			<Dynamic
				component={local.as ?? "button"}
				type={isNativeButton() ? "button" : undefined}
				{...rest}
				ref={local.ref}
				onClick={handleClick}
				aria-disabled={disabling.disabled}
				aria-description={
					disabling.disabled ? disabling.disabledReason : undefined
				}
				disabled={disabling.disabled}
				class={clsx(local.class, combinedIsLoading() && styles.loading)}
			>
				<span class={styles.singleChildWrapper}>{local.children}</span>
			</Dynamic>
		</MakeDisablable>
	);
}
