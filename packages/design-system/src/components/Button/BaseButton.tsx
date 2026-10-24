import clsx from "clsx";
import {
	type Accessor,
	createContext,
	createSignal,
	splitProps,
	useContext,
	type JSX,
	type ValidComponent,
} from "solid-js";
import { Dynamic } from "solid-js/web";

import {
	type DisablingState,
	separateDisablingProps,
	type PropsWithDisabling,
} from "../../utils/disablingProps.ts";
import { MakeDisablable } from "../MakeDisablable/MakeDisablable.tsx";

import styles from "./Button.module.scss";

type ButtonClickEvent = Parameters<
	JSX.EventHandler<HTMLButtonElement, MouseEvent>
>[0];

export type BaseButtonProps = {
	/**
	 * Render as a different element/component (Solid port of EmboUI's
	 * `asChild`). `disabled` does nothing on a link, so a loading or disabled
	 * `as="a"` gets `aria-disabled`, loses its `href` (no middle click or
	 * context menu opens it) and has its click prevented instead.
	 */
	as?: ValidComponent;
	/** Controlled loading state. */
	isLoading?: boolean;
	/** A returned promise keeps the button loading until it settles. */
	// eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- it's a return type
	onClick?: (event: ButtonClickEvent) => void | Promise<unknown>;
	/** The rendered element, which `as` can make something other than a button. */
	ref?: JSX.HTMLAttributes<HTMLElement>["ref"];
} & PropsWithDisabling &
	Pick<
		JSX.AnchorHTMLAttributes<HTMLAnchorElement>,
		"href" | "target" | "rel"
	> &
	Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "ref">;

const LoadingContext = createContext<Accessor<boolean>>(() => false);

/** Whether the enclosing BaseButton is loading (its `isLoading`, or an async
 *  click still pending), for content that swaps while it is. */
export function useButtonLoading(): Accessor<boolean> {
	return useContext(LoadingContext);
}

/**
 * A wrapper's disabling props once an outer machine (an Ark trigger bag) can
 * disable the button too. Builds the strict {@link PropsWithDisabling} branch
 * explicitly, so the bag's loose `disabled` never meets the union. A disabled
 * button with no reason of its own takes `fallbackReason`, or opts out.
 */
export function disablingWith(
	disabling: DisablingState,
	isDisabled: boolean,
	fallbackReason?: string
): PropsWithDisabling & { disabled: boolean } {
	const tooltipId = {
		disabledReasonTooltipId: disabling.disabledReasonTooltipId,
	};
	if (!isDisabled) {
		return { ...tooltipId, disabled: false };
	}
	const reason = disabling.disabledReason ?? fallbackReason;
	if (disabling.shamefullyOmitDisabledReason || reason === undefined) {
		return {
			...tooltipId,
			disabled: true,
			shamefullyOmitDisabledReason: true,
		};
	}
	return { ...tooltipId, disabled: true, disabledReason: reason };
}

export function BaseButton(props: BaseButtonProps): JSX.Element {
	const [others, disabling] = separateDisablingProps(props);
	// `disabled` is split off so only the button branch below sets it: Solid's
	// event delegation skips any node whose `disabled` property is set, which
	// would let a disabled link's click through unprevented.
	const [local, rest] = splitProps(others, [
		"disabled",
		"as",
		"isLoading",
		"class",
		"children",
		"onClick",
		"ref",
		"href",
	]);

	let element: HTMLElement | undefined;
	function setElement(node: HTMLElement) {
		element = node;
		if (typeof local.ref === "function") local.ref(node);
	}

	const [isClickHandlerExecuting, setClickHandlerExecuting] =
		createSignal(false);

	function combinedIsLoading(): boolean {
		return (
			!disabling.disabled &&
			((local.isLoading ?? false) || isClickHandlerExecuting())
		);
	}

	/** A loading button must not act: blocking the handler is not enough, a
	 *  `type="submit"` button submits through the click's default action. */
	function isDisabled(): boolean | undefined {
		return combinedIsLoading() ? true : disabling.disabled;
	}

	/** Disabling the focused button while it loads drops focus to the body;
	 *  hand it back once the click settles, unless the user moved it on. */
	function settle() {
		setClickHandlerExecuting(false);
		if (document.activeElement === document.body) element?.focus();
	}

	function handleClick(event: ButtonClickEvent) {
		if (isDisabled()) {
			// Reached only by a link: a disabled native button fires no click.
			event.preventDefault();
			return;
		}
		if (!local.onClick) {
			return;
		}

		const result = local.onClick(event);

		if (!(result instanceof Promise)) {
			return;
		}

		setClickHandlerExecuting(true);
		void result.finally(settle);
	}

	// `type="button"` and `disabled` are only meaningful (and valid) on an
	// actual <button>; a pill rendered `as="a"` must not carry them.
	function isNativeButton(): boolean {
		return (local.as ?? "button") === "button";
	}

	return (
		<MakeDisablable {...disabling}>
			<Dynamic
				component={local.as ?? "button"}
				type={isNativeButton() ? "button" : undefined}
				{...rest}
				ref={setElement}
				href={isDisabled() ? undefined : local.href}
				onClick={handleClick}
				aria-busy={combinedIsLoading() ? true : undefined}
				aria-disabled={isDisabled()}
				aria-description={
					disabling.disabled ? disabling.disabledReason : undefined
				}
				disabled={isNativeButton() ? isDisabled() : undefined}
				data-loading={combinedIsLoading()}
				class={clsx(local.class, combinedIsLoading() && styles.loading)}
			>
				<span class={styles.singleChildWrapper}>
					<LoadingContext.Provider value={combinedIsLoading}>
						{local.children}
					</LoadingContext.Provider>
				</span>
			</Dynamic>
		</MakeDisablable>
	);
}
