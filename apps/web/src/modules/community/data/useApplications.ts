// Re-export from the shared community-data module. The board console subscribes
// to applications once in a session-level provider (see communityData.tsx) so the
// table doesn't re-suspend on every visit; this hook reads that warm context.
export { useApplications } from "./communityData.tsx";
