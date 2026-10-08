import { Button, Dialog } from "@j-os/design-system";
import {
	type JSX,
	type ParentProps,
	Show,
	createContext,
	createSignal,
	useContext,
} from "solid-js";

import styles from "./confirm.module.scss";

/** Options for a single confirmation prompt. */
export type ConfirmOptions = {
	title: string;
	message?: string;
	/** Label for the confirm button (defaults to "Confirm"). */
	confirmLabel?: string;
	/** "danger" styles the confirm button as a destructive/secondary action. */
	tone?: "default" | "danger";
};

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

// Default (no provider): auto-confirm. The app shell mounts the one
// <ConfirmProvider> (see ShellBody in app.tsx), around the topbar and every
// page, so this fallback only applies to a component rendered standalone (e.g.
// a unit test mounting a single tab), where the action should still fire
// without a dialog.
function autoConfirm(): Promise<boolean> {
	return Promise.resolve(true);
}

const ConfirmContext = createContext<Confirm>(autoConfirm);

/** Returns an async `confirm(options)` that resolves true if the user confirms,
 * false if they cancel/dismiss. Under a {@link ConfirmProvider} it opens the
 * shared dialog; without one it auto-confirms. */
export function useConfirm(): Confirm {
	return useContext(ConfirmContext);
}

/**
 * Provides a single shared confirmation dialog. Any descendant calls
 * `useConfirm()(options)` to prompt and awaits the boolean result, so triage
 * actions can gate an irreversible mutation behind a yes/no step without each
 * wiring its own dialog.
 */
export function ConfirmProvider(props: ParentProps): JSX.Element {
	const [open, setOpen] = createSignal(false);
	const [opts, setOpts] = createSignal<ConfirmOptions>({ title: "" });
	let resolver: ((value: boolean) => void) | null = null;
	let confirmRef: HTMLElement | undefined = undefined;

	function confirm(options: ConfirmOptions): Promise<boolean> {
		setOpts(options);
		setOpen(true);
		return new Promise<boolean>((resolve) => {
			resolver = resolve;
		});
	}

	function settle(value: boolean): void {
		setOpen(false);
		resolver?.(value);
		resolver = null;
	}

	return (
		<ConfirmContext.Provider value={confirm}>
			{props.children}
			<Dialog.Root
				open={open()}
				initialFocusEl={() => confirmRef ?? null}
				onOpenChange={(d) => {
					// Dismissing (Esc / backdrop / Cancel) counts as "no".
					if (!d.open) settle(false);
				}}
			>
				<Dialog.Content>
					<Dialog.Title>{opts().title}</Dialog.Title>
					<Show when={opts().message}>
						<Dialog.Description>
							{opts().message}
						</Dialog.Description>
					</Show>
					<div class={styles.footer}>
						<Dialog.CloseTrigger
							asChild={(closeProps) => (
								<Button
									{...(closeProps() as object)}
									variant="tertiary"
								>
									Cancel
								</Button>
							)}
						/>
						{/**
						 * The CONFIRM button takes focus, not Cancel.
						 *
						 * Every decision can now be fired by key, and a keyed decision
						 * that opens a dialog whose default action is "no" makes the
						 * key feel broken — you press D, press Enter, and nothing
						 * happened. Esc still cancels, and the dialog itself is the
						 * confirmation, so the safe exit is one keystroke away either
						 * way.
						 */}
						<Button
							ref={(el: HTMLElement) => (confirmRef = el)}
							variant={
								opts().tone === "danger"
									? "secondary"
									: "primary"
							}
							onClick={() => {
								settle(true);
							}}
						>
							{opts().confirmLabel ?? "Confirm"}
						</Button>
					</div>
				</Dialog.Content>
			</Dialog.Root>
		</ConfirmContext.Provider>
	);
}
