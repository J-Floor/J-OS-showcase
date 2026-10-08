import { Button, SignaturePad } from "@j-os/design-system";
import { useAction } from "convex-solidjs";
import { createSignal, onCleanup, onMount, Show } from "solid-js";

import { api } from "../../../../../convex/_generated/api";
import { StepActions } from "../../StepActions.tsx";
import type { OnboardingStepProps } from "../../types.ts";

import styles from "./DocumentStep.module.scss";

/**
 * Onboarding step A: read + sign the J floor agreement. Shows an unsigned
 * preview PDF (the signer's details + today's date stamped onto the template,
 * via `previewAgreement`), pre-fills read-only signer details, captures a drawn
 * signature, and submits to `signAgreement` — which generates the countersigned
 * PDF, stores it, emails it, and marks this step complete.
 */
export function DocumentStep(props: OnboardingStepProps) {
	const sign = useAction(api.agreements.signAgreement);
	const preview = useAction(api.agreements.previewAgreement);
	const [sig, setSig] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	// Inline embed is hidden by default: <object>/inline PDF is unreliable on
	// iOS Safari / Android Chrome (and the embed is bulky), so we gate it behind
	// "View inline" and make "Download PDF" — which works everywhere — primary.
	const [showPdf, setShowPdf] = createSignal(false);
	// Blob URL of the filled-but-unsigned preview, generated once on mount.
	const [previewUrl, setPreviewUrl] = createSignal<string | null>(null);

	function variant() {
		return props.person.tier === "guest" ? "guest" : "member";
	}
	function templateUrl() {
		return `/agreements/${variant()}.pdf`;
	}
	// Prefer the filled preview; fall back to the blank template until it's ready
	// (or if generation failed).
	function docUrl() {
		return previewUrl() ?? templateUrl();
	}
	function canSign() {
		return Boolean(sig()) && !busy();
	}

	onMount(() => {
		void (async () => {
			try {
				const b64 = await preview.mutateAsync({});
				if (!b64) return;
				const bytes = Uint8Array.from(atob(b64), (c) =>
					c.charCodeAt(0)
				);
				const url = URL.createObjectURL(
					new Blob([bytes], { type: "application/pdf" })
				);
				setPreviewUrl(url);
			} catch {
				// Leave previewUrl null — docUrl() falls back to the blank template.
			}
		})();
	});
	onCleanup(() => {
		const u = previewUrl();
		if (u) URL.revokeObjectURL(u);
	});

	function downloadPdf() {
		const a = document.createElement("a");
		a.href = docUrl();
		a.download = "J floor agreement.pdf";
		document.body.appendChild(a);
		a.click();
		a.remove();
	}

	async function submit() {
		const png = sig();
		if (!png) return;
		setBusy(true);
		setError(null);
		try {
			await sign.mutateAsync({ signaturePng: png });
			// signAgreement marks the document step complete server-side; the
			// wizard advances reactively off the person query.
		} catch {
			setError("Couldn't submit your signature — please try again.");
			setBusy(false);
		}
	}

	return (
		<div class={styles.wrap}>
			<p>
				Read the J floor agreement and privacy policy, then sign to
				accept both.
			</p>
			<div class={styles.pdfActions}>
				<Button
					variant="secondary"
					onClick={() => {
						setShowPdf((v) => !v);
					}}
				>
					{showPdf() ? "Hide inline" : "Read inline"}
				</Button>
				<Button variant="primary" onClick={downloadPdf}>
					Download PDF
				</Button>
			</div>
			<Button
				variant="tertiary"
				onClick={() => {
					window.open("/privacy", "_blank", "noopener");
				}}
			>
				Read privacy policy
			</Button>
			<Show when={showPdf()}>
				<object
					class={styles.doc}
					data={docUrl()}
					type="application/pdf"
					aria-label="J floor agreement"
				/>
			</Show>
			<dl class={styles.fields}>
				<dt>Name</dt>
				<dd>
					{props.person.firstName} {props.person.lastName}
				</dd>
				<dt>Company</dt>
				<dd>{props.person.venture?.name}</dd>
				<dt>Email</dt>
				<dd>{props.person.email}</dd>
			</dl>
			<SignaturePad label="Your signature" onChange={setSig} />
			<Show when={error()}>
				<p class={styles.error}>{error()}</p>
			</Show>
			<StepActions>
				<Button
					disabled={!canSign()}
					disabledReason="Add your signature first"
					onClick={() => void submit()}
				>
					Sign &amp; continue
				</Button>
			</StepActions>
		</div>
	);
}
