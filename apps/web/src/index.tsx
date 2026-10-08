import "solid-devtools";
// Side-effect import: starts listening for `beforeinstallprompt` before render,
// so the install pill (which mounts late, inside the authed shell) doesn't miss
// the early-firing event. Must stay at the top, ahead of the first render.
import "./shared/pwaInstall.ts";
import { JFloorProvider } from "@j-os/design-system";
import { Route, Router } from "@solidjs/router";
import { ConvexProvider } from "convex-solidjs";
import type { ParentProps } from "solid-js";
import { render } from "solid-js/web";
// Registered from app code (vite.config.ts sets `injectRegister: false`) so
// pwaUpdates.ts can drive `registration.update()` on focus and hourly — see
// that module for why. Only resolves under `vite`/`vite build`; the plugin
// (and this import) is absent under Vitest (`mode === 'test'`), and no test
// renders this entry file.
import { registerSW } from "virtual:pwa-register";

import { App, ModuleRoutes } from "./app.tsx";
import { APP_ROOT_ID } from "./lib/constants.ts";
import { bindConvexAuth, convex } from "./lib/convex.ts";
import { startPwaUpdateChecks, startReloadOnUpdate } from "./lib/pwaUpdates.ts";
import { SignIn } from "./modules/auth/SignIn.tsx";
import { OnboardingRoute } from "./modules/onboarding/OnboardingRoute.tsx";
import { PrivacyRoute } from "./modules/privacy/PrivacyRoute.tsx";
import { ConfirmApplication } from "./modules/signup/ConfirmApplication.tsx";
import { SignUp } from "./modules/signup/SignUp.tsx";
import { EmailChangeConfirm } from "./modules/visitor/EmailChangeConfirm.tsx";
import { EventInviteConfirm } from "./modules/visitor/EventInviteConfirm.tsx";
import { VisitorConfirm } from "./modules/visitor/VisitorConfirm.tsx";
import { VisitorRegister } from "./modules/visitor/VisitorRegister.tsx";
import { LandingRedirect, PageTitleTracker } from "./routing/index.tsx";
import { AppErrorBoundary } from "./shared/AppErrorBoundary.tsx";
import { UpdatingOverlay } from "./shared/UpdatingOverlay.tsx";

function Root(props: ParentProps) {
	bindConvexAuth();
	return (
		<JFloorProvider>
			<ConvexProvider client={convex}>
				<PageTitleTracker />
				<AppErrorBoundary>{props.children}</AppErrorBoundary>
			</ConvexProvider>
			<UpdatingOverlay />
		</JFloorProvider>
	);
}

// PWA `registerType: 'autoUpdate'` purges old precaches on a new deploy. A tab
// left open across that deploy can then fail to `import()` a page chunk it
// has not visited yet (the file the browser/SW cached is gone), which Vite
// surfaces as a `vite:preloadError` on `window`. Reloading once recovers —
// the fresh HTML references the new chunk hashes — but a genuinely broken
// chunk (not a stale-deploy 404) must not reload forever, so a sessionStorage
// timestamp caps it to at most one forced reload per 10s.
window.addEventListener("vite:preloadError", () => {
	const key = "jf:lastPreloadErrorReload";
	try {
		const last = Number(sessionStorage.getItem(key) ?? "0");
		if (Date.now() - last < 10_000) return;
		sessionStorage.setItem(key, String(Date.now()));
	} catch {
		// sessionStorage unavailable (private mode / blocked) — there is no
		// loop guard without it, so do NOT reload: a genuinely broken chunk
		// would reload forever. Let the import rejection surface to the
		// route's <AppErrorBoundary> instead.
		return;
	}
	window.location.reload();
});

// Captures the controlling worker now, before registration can change it.
const watchRegistration = startReloadOnUpdate();

function onRegisteredSW(
	_swUrl: string,
	registration: ServiceWorkerRegistration | undefined
): void {
	startPwaUpdateChecks(registration);
	watchRegistration(registration);
}

registerSW({ onRegisteredSW });

render(
	() => (
		<Router root={Root}>
			<Route
				path="/signin"
				component={SignIn}
				info={{ title: "Sign in" }}
			/>
			<Route
				path="/sign-up"
				component={SignUp}
				info={{ title: "Sign up" }}
			/>
			<Route
				path="/apply/confirm"
				component={ConfirmApplication}
				info={{ title: "Confirm application" }}
			/>
			<Route
				path="/visitor"
				component={VisitorRegister}
				info={{ title: "Visitor registration" }}
			/>
			<Route
				path="/visitor/confirm"
				component={VisitorConfirm}
				info={{ title: "Confirm visit" }}
			/>
			<Route
				path="/event/confirm"
				component={EventInviteConfirm}
				info={{ title: "Confirm invite" }}
			/>
			<Route
				path="/email/confirm"
				component={EmailChangeConfirm}
				info={{ title: "Confirm email change" }}
			/>
			<Route
				path="/onboarding"
				component={OnboardingRoute}
				info={{ title: "Onboarding" }}
			/>
			<Route
				path="/privacy"
				component={PrivacyRoute}
				info={{ title: "Privacy" }}
			/>
			<Route path="/" component={App}>
				<Route path="/" component={LandingRedirect} />
				<ModuleRoutes />
				{/* Unknown URL under the app shell: send the user to their last
				    visited page (or the default module), same as `/`. */}
				<Route path="*" component={LandingRedirect} />
			</Route>
		</Router>
	),
	document.getElementById(APP_ROOT_ID)!
);
