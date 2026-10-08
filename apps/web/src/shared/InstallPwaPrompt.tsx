import { Button, Icon, IconButton, Popover } from "@j-os/design-system";
import { type JSX, Match, Show, Switch } from "solid-js";

import { createDismissed } from "../lib/dismissed.ts";

import { ICONS } from "./icons.ts";
import styles from "./InstallPwaPrompt.module.scss";
import {
	appInstalled,
	type InstallMethod,
	installMethod,
	installPrompt,
	isStandalone,
	runInstallPrompt,
} from "./pwaInstall.ts";

const DISMISSED_KEY = "jf-pwa-install-dismissed";

/** Menu steps per browser that offers no install prompt. */
type StepsMethod = Exclude<InstallMethod, "prompt" | "none">;

const STEPS: Record<StepsMethod, () => JSX.Element> = {
	samsung: () => (
		<>
			Tap the ≡ menu, then <strong>Add page to</strong> →{" "}
			<strong>Home screen</strong>.
		</>
	),
	firefox: () => (
		<>
			Tap the ⋮ menu, then <strong>Add app to Home screen</strong>.
		</>
	),
	"other-android": () => (
		<>
			Open your browser menu and tap <strong>Add to Home screen</strong>{" "}
			or <strong>Install</strong>.
		</>
	),
};

function PillButton(props: {
	onClick?: () => void;
	triggerProps?: object;
}): JSX.Element {
	return (
		<Button
			{...props.triggerProps}
			class={styles.install}
			variant="tertiary"
			onClick={props.onClick}
		>
			<Icon>install_mobile</Icon>Install app
		</Button>
	);
}

/**
 * Small dismissable "Install app" pill, floated at the foot of the content
 * column (above the phone bottom bar, which lives outside `.main`). Browsers no
 * longer pop a full install prompt on their own, so this surfaces it:
 *
 * - Android / desktop Chromium: capture `beforeinstallprompt` and drive the
 *   real prompt from the pill (a user gesture, which the API requires).
 * - Android browsers that never fire it (Samsung Internet 27+, Firefox): the
 *   pill opens the menu steps for that browser.
 * - iOS: nothing. An iOS home-screen app keeps its own storage, apart from
 *   Safari, and email sign-in links always open in Safari, so an installed
 *   app can never finish a magic-link sign-in.
 * - Already installed, or dismissed before (✕ is permanent): nothing.
 */
export function InstallPwaPrompt() {
	const [dismissed, dismiss] = createDismissed(DISMISSED_KEY);

	// `beforeinstallprompt` is captured at module load (see ./pwaInstall) — long
	// before this pill mounts inside the authed shell — so the event is not
	// missed. Here we only read the captured state.
	function method() {
		return installMethod(
			navigator.userAgent,
			installPrompt() !== undefined,
			navigator.maxTouchPoints
		);
	}
	function stepsMethod(): StepsMethod | undefined {
		const current = method();
		return current === "prompt" || current === "none" ? undefined : current;
	}
	function installed(): boolean {
		return isStandalone() || appInstalled();
	}
	function show(): boolean {
		return !installed() && !dismissed() && method() !== "none";
	}

	return (
		<Show when={show()}>
			<div class={styles.pill}>
				<Switch>
					<Match when={method() === "prompt"}>
						<PillButton onClick={() => void runInstallPrompt()} />
					</Match>
					<Match when={stepsMethod()}>
						{(current) => (
							<Popover.Root>
								<Popover.ClickTrigger
									asChild={(triggerProps) => (
										<PillButton
											triggerProps={
												triggerProps() as object
											}
										/>
									)}
								/>
								<Popover.Content>
									<Popover.Title>
										Add to Home screen
									</Popover.Title>
									<Popover.Description>
										{STEPS[current()]()}
									</Popover.Description>
								</Popover.Content>
							</Popover.Root>
						)}
					</Match>
				</Switch>
				<IconButton tooltipLabel="Dismiss" onClick={dismiss}>
					{ICONS.close}
				</IconButton>
			</div>
		</Show>
	);
}
