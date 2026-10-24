import { BrandReveal } from "@j-os/design-system";
import {
	Navigate,
	Route,
	useCurrentMatches,
	useLocation,
} from "@solidjs/router";
import { useMutation } from "convex-solidjs";
import {
	type Accessor,
	createEffect,
	createSignal,
	For,
	onCleanup,
	onMount,
	type ParentProps,
	Show,
} from "solid-js";

import { api } from "../../convex/_generated/api";
import { isAccessTier } from "../../convex/lib/roles.ts";
import { AbilityProvider, Can } from "../lib/ability.tsx";
import { authClient } from "../lib/auth.ts";
import { ignoreFailure } from "../lib/call.ts";
import { APP_NAME } from "../lib/constants.ts";
import { ottPending } from "../lib/convex.ts";
import { isUpdating } from "../lib/pwaUpdates.ts";
import { modules } from "../modules/registry.ts";
import { AppErrorBoundary } from "../shared/AppErrorBoundary.tsx";
import { railLanding } from "../shared/components/Sidebar/brandLanding.ts";
import { useQuery } from "../shared/data/useQuery.ts";
import { LoadingScreen } from "../shared/LoadingScreen.tsx";
import { NoAccess } from "../shared/NoAccess.tsx";
import { Splash } from "../shared/Splash.tsx";

import { useRole } from "./useRole.ts";

type RoleData = ReturnType<ReturnType<typeof useRole>["data"]>;

export function ModuleRoutes() {
	// Per-route boundary (rather than relying on AuthedGate's coarse catch-all):
	// a crash in one module's view shows the fallback in the content area while
	// the surrounding shell (Sidebar + topbar) stays alive and navigable, and
	// switching routes mounts a fresh boundary. Each route is also gated on the
	// module's ability subject, so direct navigation to a module the role can't
	// view (e.g. a non-board user opening /tasks) is blocked, not just hidden
	// from the sidebar.
	return (
		<For each={modules}>
			{(entry) => (
				<Route
					path={entry.path}
					info={{ title: entry.label }}
					component={() => {
						const View = entry.view;
						// A path change within one module keeps this boundary
						// mounted, so the path is its reset key.
						const location = useLocation();
						return (
							<AppErrorBoundary resetKey={location.pathname}>
								<Can
									I="view"
									the={entry.subject}
									fallback={<NoAccess />}
								>
									<View />
								</Can>
							</AppErrorBoundary>
						);
					}}
				/>
			)}
		</For>
	);
}

const SPLASH_MIN_MS = 900;

// Routes worth remembering as a landing target. `/` and `/signin` are excluded
// so we never redirect into a loop or away from a signed-out user.
const MODULE_PATHS = new Set(modules.map((entry) => entry.path));

/**
 * Index route (`/`): send the user to the last module route they viewed,
 * falling back to the first module. Reads it from `people.getLastPath`.
 */
export function LandingRedirect() {
	const lastPath = useQuery(api.people.getLastPath, {});
	const fallback = modules[0]?.path ?? "/";
	const location = useLocation();
	function target() {
		const last = lastPath.data();
		return last && MODULE_PATHS.has(last) ? last : fallback;
	}
	return (
		// Gate on data presence, not `!isLoading()`: convex-solidjs returns
		// undefined with isLoading=false on the first render (before the live
		// query resolves), so `!isLoading()` would navigate to the fallback
		// before the path loads — making last-visited restore never work.
		// The query returns null, never undefined, once it has loaded.
		<Show when={lastPath.data() !== undefined} fallback={<LoadingScreen />}>
			{/* Carry the query along: `/?notifications=open` (the email footer
			    link) must still open the sheet on whichever page this lands. */}
			<Navigate href={`${target()}${location.search}`} />
		</Show>
	);
}

/**
 * Keeps the document title as `J floor | <Page>` for the active route, reading
 * the page name from the matched route's `info.title` (set where each route is
 * declared). Falls back to `J floor` when the route carries no title (e.g. the
 * `/` redirect). One central place; renders nothing.
 */
export function PageTitleTracker() {
	const matches = useCurrentMatches();
	createEffect(() => {
		const title = matches()
			.map((entry) => entry.route.info?.title as string | undefined)
			.filter((candidate): candidate is string => Boolean(candidate))
			.at(-1);
		document.title = title ? `${APP_NAME} | ${title}` : APP_NAME;
	});
	return null;
}

/**
 * Persists the current route to the user's person row whenever it changes,
 * so `LandingRedirect` can restore it later (cross-device). Renders nothing.
 */
export function LastPathTracker() {
	const location = useLocation();
	const setLastPath = useMutation(api.people.setLastPath);
	createEffect(() => {
		const path = location.pathname;
		if (MODULE_PATHS.has(path))
			// Remembering the page is best effort: a failure has nobody to tell.
			ignoreFailure(setLastPath.mutateAsync({ path }));
	});
	return null;
}

/**
 * Boot gate. Resolves session + role + onboarding up front and shows the
 * {@link Splash} until ALL are known, so the app never flashes an intermediate
 * state (e.g. <NoAccess /> while the role query is still loading) on the way in.
 * Once resolved, the decision is made in one pass:
 *  - signed out        → /signin (not a permission problem)
 *  - needs onboarding  → /onboarding
 *  - insufficient role → <NoAccess />
 *  - otherwise         → the app, with the CASL ability provided
 */
export function RoleGate(props: ParentProps) {
	const session = authClient.useSession();
	const role = useRole();
	const onboarding = useQuery(api.onboarding.getState, {});

	// Hold the splash for at least the reveal animation's length, so a fast boot
	// (data ready in <1s) doesn't cut the animation off mid-play. The timer
	// starts when the splash first mounts (app start).
	const [minElapsed, setMinElapsed] = createSignal(false);
	onMount(() => {
		const timer = setTimeout(() => setMinElapsed(true), SPLASH_MIN_MS);
		onCleanup(() => {
			clearTimeout(timer);
		});
	});

	function showSplash(): boolean {
		// Signed out → redirect, no splash hold. Signed in: keep the splash
		// until both queries' first result AND the minimum animation time.
		// The `useQuery` wrapper's default `keepPreviousData` keeps `data()`
		// defined across later refetches, so this never re-splashes
		// mid-session (e.g. on nav).
		return (
			session().isPending ||
			ottPending() ||
			(Boolean(session().data) &&
				(role.data() === undefined ||
					onboarding.data() === undefined ||
					!minElapsed()))
		);
	}

	// The signed-in shell, the one with the sidebar the splash unfolds into.
	function landsOnRail(): boolean {
		return (
			Boolean(session().data) &&
			!(onboarding.data()?.needsOnboarding ?? false) &&
			isAccessTier(role.data())
		);
	}

	return (
		// The splash's logo unfolds into the sidebar, or on a phone its
		// frame grows into the screen. Without the sidebar's shell to land
		// on, or while the app is updating (its overlay covers everything),
		// the swap is instant.
		<BrandReveal
			ready={!showSplash()}
			animate={landsOnRail() && !isUpdating()}
			splash={<Splash />}
			landing={railLanding}
		>
			<Show when={session().data} fallback={<Navigate href="/signin" />}>
				<AuthedContent
					role={role.data}
					needsOnboarding={() =>
						onboarding.data()?.needsOnboarding ?? false
					}
				>
					{props.children}
				</AuthedContent>
			</Show>
		</BrandReveal>
	);
}

/**
 * The signed-in decision, rendered only after {@link RoleGate} has resolved both
 * queries — so `role`/`needsOnboarding` are settled values, never transient
 * `undefined`. Every role shares the same shell; what each sees is
 * gated per-affordance via the CASL ability provided here.
 */
function AuthedContent(
	props: ParentProps & {
		role: Accessor<RoleData>;
		needsOnboarding: Accessor<boolean>;
	}
) {
	function hasAccess(): boolean {
		return isAccessTier(props.role());
	}
	return (
		<AppErrorBoundary>
			<Show
				when={!props.needsOnboarding()}
				fallback={<Navigate href="/onboarding" />}
			>
				<Show when={hasAccess()} fallback={<NoAccess />}>
					<AbilityProvider role={props.role() ?? "none"}>
						{props.children}
					</AbilityProvider>
				</Show>
			</Show>
		</AppErrorBoundary>
	);
}
