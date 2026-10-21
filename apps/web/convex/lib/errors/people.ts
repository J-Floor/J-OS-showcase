import type { EventType, StateId } from "../lifecycleTypes.ts";

export type PeopleError =
	| { type: "ReadBudgetExceeded"; where: string }
	| { type: "InvalidEmail" }
	| { type: "EmailInUse" }
	| { type: "IllegalTransition"; from: StateId; event: EventType }
	| { type: "MergeSelf" }
	| { type: "MergePersonNotFound" }
	| { type: "MergePatchNotObject" }
	| { type: "MergeInvalid"; violations: string }
	| { type: "MergeStrandsBreakGlassKey" }
	| { type: "DryRunRollback" }
	| { type: "NoOnboardingInProgress" }
	| { type: "NotOnboarding" }
	| { type: "DocumentStepNeedsSignature" }
	| { type: "InvalidApplication" }
	| { type: "ApplicationBlocked" };

export const peopleMessages: Record<PeopleError["type"], string> = {
	ReadBudgetExceeded: "There is too much data to process in one go.",
	InvalidEmail: "That is not a valid email address.",
	EmailInUse: "Another person already uses that email address.",
	IllegalTransition: "That change is not possible from the current state.",
	MergeSelf: "Cannot merge a person into itself.",
	MergePersonNotFound: "Person not found.",
	MergePatchNotObject: "The patch must be an object.",
	MergeInvalid: "The merged person would be in an invalid state.",
	MergeStrandsBreakGlassKey:
		"The dropped person is board or admin with door access granted, so their personal door key is a break-glass key and would never be revoked. Shut off their door access or demote them first.",
	DryRunRollback: "Dry run finished and was rolled back.",
	NoOnboardingInProgress: "No onboarding is in progress for you.",
	NotOnboarding: "You are not in an onboarding state.",
	DocumentStepNeedsSignature:
		"The document step is completed by signing the agreement.",
	InvalidApplication: "That application is not valid.",
	ApplicationBlocked: "You cannot apply right now.",
};
