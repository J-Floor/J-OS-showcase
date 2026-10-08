import {
	Navigate,
	Route,
	useCurrentMatches,
	useLocation,
} from "@solidjs/router";
import { useMutation, useQuery } from "convex-solidjs";
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
import { APP_NAME } from "../lib/constants.ts";
import { ottPending } from "../lib/convex.ts";
import { modules } from "../modules/registry.ts";
import { AppErrorBoundary } from "../shared/AppErrorBoundary.tsx";
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
			{(m) => (
				<Route
					path={m.path}
					info={{ title: m.label }}
					component={() => {
						const View = m.view;
						return (
							<AppErrorBoundary>
								<Can
									I="view"
									the={m.subject}
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

// Routes worth remembering as a landing target. `/` and `/signin` are excluded
// so we never redirect into a loop or away from a signed-out user.
const MODULE_PATHS = new Set(modules.map((m) => m.path));

/**
 * Index route (`/`): send the user to the last module route they viewed,
 * falling back to the first module. Reads `lastPath` off their person row.
 */
export function LandingRedirect() {
	const person = useQuery(api.people.getCurrentPerson, {});
	const fallback = modules[0]?.path ?? "/";
	const location = useLocation();
	function target() {
		const last = person.data()?.lastPath;
		return last && MODULE_PATHS.has(last) ? last : fallback;
	}
	return (
		// Gate on data presence, not `!isLoading()`: convex-solidjs returns
		// undefined with isLoading=false on the first render (before the live
		// query resolves), so `!isLoading()` would navigate to the fallback
		// before `lastPath` loads — making last-visited restore never work.
		<Show when={person.data() !== undefined} fallback={<LoadingScreen />}>
			{/* Carry the query along: `/?notifications=open` (the email footer
			    link) must still open the drawer on whichever page this lands. */}
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
			.map((m) => m.route.info?.title as string | undefined)
			.filter((t): t is string => Boolean(t))
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
			void setLastPath.mutateAsync({ path }).catch(() => undefined);
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
		const timer = setTimeout(() => setMinElapsed(true), 900);
		onCleanup(() => {
			clearTimeout(timer);
		});
	});

	function showSplash(): boolean {
		if (session().isPending || ottPending()) return true;
		if (!session().data) return false; // signed out → redirect, no splash hold
		// Signed in: keep the splash until both queries' first result AND the
		// minimum animation time. `keepPreviousData` keeps `data()` defined across
		// later refetches, so this never re-splashes mid-session (e.g. on nav).
		return (
			role.data() === undefined ||
			onboarding.data() === undefined ||
			!minElapsed()
		);
	}

	return (
		<Show when={!showSplash()} fallback={<Splash />}>
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
		</Show>
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
