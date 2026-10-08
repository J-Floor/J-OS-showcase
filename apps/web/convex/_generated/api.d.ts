/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accessLogRetention from "../accessLogRetention.js";
import type * as agreements from "../agreements.js";
import type * as agreements_coords from "../agreements/coords.js";
import type * as agreements_generated_fonts from "../agreements/generated/fonts.js";
import type * as agreements_generated_templates from "../agreements/generated/templates.js";
import type * as agreements_pdf from "../agreements/pdf.js";
import type * as agreements_seal from "../agreements/seal.js";
import type * as agreementsInternal from "../agreementsInternal.js";
import type * as applications from "../applications.js";
import type * as auth from "../auth.js";
import type * as backfillStageSince from "../backfillStageSince.js";
import type * as crons from "../crons.js";
import type * as dev from "../dev.js";
import type * as door from "../door.js";
import type * as doorActions from "../doorActions.js";
import type * as doorHealth from "../doorHealth.js";
import type * as doorInternal from "../doorInternal.js";
import type * as doorLog from "../doorLog.js";
import type * as doorRevoke from "../doorRevoke.js";
import type * as emails_escape from "../emails/escape.js";
import type * as emails_format from "../emails/format.js";
import type * as emails_generated_alreadyActive from "../emails/generated/alreadyActive.js";
import type * as emails_generated_alreadyUnderReview from "../emails/generated/alreadyUnderReview.js";
import type * as emails_generated_applicationReceived from "../emails/generated/applicationReceived.js";
import type * as emails_generated_approvalGuest from "../emails/generated/approvalGuest.js";
import type * as emails_generated_approvalGuestOpen from "../emails/generated/approvalGuestOpen.js";
import type * as emails_generated_approvalMember from "../emails/generated/approvalMember.js";
import type * as emails_generated_boardDoorAlert from "../emails/generated/boardDoorAlert.js";
import type * as emails_generated_boardLifecycleAlert from "../emails/generated/boardLifecycleAlert.js";
import type * as emails_generated_boardNewApplication from "../emails/generated/boardNewApplication.js";
import type * as emails_generated_confirmEmailChange from "../emails/generated/confirmEmailChange.js";
import type * as emails_generated_emailChanged from "../emails/generated/emailChanged.js";
import type * as emails_generated_eventInvite from "../emails/generated/eventInvite.js";
import type * as emails_generated_magicLink from "../emails/generated/magicLink.js";
import type * as emails_generated_memberUpgrade from "../emails/generated/memberUpgrade.js";
import type * as emails_generated_notice from "../emails/generated/notice.js";
import type * as emails_generated_projectAssigned from "../emails/generated/projectAssigned.js";
import type * as emails_generated_reapplyAfter from "../emails/generated/reapplyAfter.js";
import type * as emails_generated_rejection from "../emails/generated/rejection.js";
import type * as emails_generated_signedAgreement from "../emails/generated/signedAgreement.js";
import type * as emails_generated_taskAssigned from "../emails/generated/taskAssigned.js";
import type * as emails_generated_verifyApplication from "../emails/generated/verifyApplication.js";
import type * as emails_generated_verifyVisitor from "../emails/generated/verifyVisitor.js";
import type * as emails_urls from "../emails/urls.js";
import type * as eventCheckIn from "../eventCheckIn.js";
import type * as events from "../events.js";
import type * as fixImportedDates from "../fixImportedDates.js";
import type * as http from "../http.js";
import type * as invariants from "../invariants.js";
import type * as inventory from "../inventory.js";
import type * as lib_assetTag from "../lib/assetTag.js";
import type * as lib_attendance from "../lib/attendance.js";
import type * as lib_authGuard from "../lib/authGuard.js";
import type * as lib_authRecords from "../lib/authRecords.js";
import type * as lib_boardSignatories from "../lib/boardSignatories.js";
import type * as lib_confirmToken from "../lib/confirmToken.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_csv from "../lib/csv.js";
import type * as lib_currentPerson from "../lib/currentPerson.js";
import type * as lib_derive from "../lib/derive.js";
import type * as lib_devAdmin from "../lib/devAdmin.js";
import type * as lib_doorActuation from "../lib/doorActuation.js";
import type * as lib_doorLocks from "../lib/doorLocks.js";
import type * as lib_doorPresence from "../lib/doorPresence.js";
import type * as lib_doorProvider from "../lib/doorProvider.js";
import type * as lib_doorProviderEnv from "../lib/doorProviderEnv.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_emailAddress from "../lib/emailAddress.js";
import type * as lib_erasure from "../lib/erasure.js";
import type * as lib_fakeDoorProvider from "../lib/fakeDoorProvider.js";
import type * as lib_invariants from "../lib/invariants.js";
import type * as lib_lifecycle from "../lib/lifecycle.js";
import type * as lib_lifecycleDiagram from "../lib/lifecycleDiagram.js";
import type * as lib_lifecycleTypes from "../lib/lifecycleTypes.js";
import type * as lib_names from "../lib/names.js";
import type * as lib_nukiClient from "../lib/nukiClient.js";
import type * as lib_occupancy_index from "../lib/occupancy/index.js";
import type * as lib_occupancy_provider from "../lib/occupancy/provider.js";
import type * as lib_occupancy_providers_nukiDoorOpens from "../lib/occupancy/providers/nukiDoorOpens.js";
import type * as lib_onboardingSteps from "../lib/onboardingSteps.js";
import type * as lib_peopleRefs from "../lib/peopleRefs.js";
import type * as lib_personViews from "../lib/personViews.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_reapply from "../lib/reapply.js";
import type * as lib_recaptcha from "../lib/recaptcha.js";
import type * as lib_roles from "../lib/roles.js";
import type * as lib_routes from "../lib/routes.js";
import type * as lib_safeUrl from "../lib/safeUrl.js";
import type * as lib_time from "../lib/time.js";
import type * as lib_typeAssert from "../lib/typeAssert.js";
import type * as lib_validate from "../lib/validate.js";
import type * as lib_wifi from "../lib/wifi.js";
import type * as lifecycle from "../lifecycle.js";
import type * as linkSafety from "../linkSafety.js";
import type * as merge from "../merge.js";
import type * as migrateEventTimes from "../migrateEventTimes.js";
import type * as migrations from "../migrations.js";
import type * as notifications from "../notifications.js";
import type * as notify_alertOnChange from "../notify/alertOnChange.js";
import type * as notify_audience from "../notify/audience.js";
import type * as notify_backfill from "../notify/backfill.js";
import type * as notify_categories from "../notify/categories.js";
import type * as notify_channels_email from "../notify/channels/email.js";
import type * as notify_channels_push from "../notify/channels/push.js";
import type * as notify_channels_pushSender from "../notify/channels/pushSender.js";
import type * as notify_dispatch from "../notify/dispatch.js";
import type * as notify_doorPoll from "../notify/doorPoll.js";
import type * as notify_eventReminders from "../notify/eventReminders.js";
import type * as notify_guests from "../notify/guests.js";
import type * as notify_inbox from "../notify/inbox.js";
import type * as notify_kinds_doorAlert from "../notify/kinds/doorAlert.js";
import type * as notify_kinds_eventEndingSoon from "../notify/kinds/eventEndingSoon.js";
import type * as notify_kinds_eventStartingSoon from "../notify/kinds/eventStartingSoon.js";
import type * as notify_kinds_guestAccessChanged from "../notify/kinds/guestAccessChanged.js";
import type * as notify_kinds_guestAudience from "../notify/kinds/guestAudience.js";
import type * as notify_kinds_guestExpired from "../notify/kinds/guestExpired.js";
import type * as notify_kinds_guestExpiringSoon from "../notify/kinds/guestExpiringSoon.js";
import type * as notify_kinds_lifecycleAlert from "../notify/kinds/lifecycleAlert.js";
import type * as notify_kinds_newApplication from "../notify/kinds/newApplication.js";
import type * as notify_kinds_noticeEmail from "../notify/kinds/noticeEmail.js";
import type * as notify_kinds_projectAssigned from "../notify/kinds/projectAssigned.js";
import type * as notify_kinds_taskAssigned from "../notify/kinds/taskAssigned.js";
import type * as notify_notify from "../notify/notify.js";
import type * as notify_prefs from "../notify/prefs.js";
import type * as notify_recipients from "../notify/recipients.js";
import type * as notify_registry from "../notify/registry.js";
import type * as notify_subscriptions from "../notify/subscriptions.js";
import type * as notify_types from "../notify/types.js";
import type * as occupancy from "../occupancy.js";
import type * as onboarding from "../onboarding.js";
import type * as opsAlerts from "../opsAlerts.js";
import type * as people from "../people.js";
import type * as personEvents from "../personEvents.js";
import type * as projects from "../projects.js";
import type * as purge from "../purge.js";
import type * as remindUnsigned from "../remindUnsigned.js";
import type * as seed from "../seed.js";
import type * as tasks from "../tasks.js";
import type * as visitors from "../visitors.js";
import type * as wifi from "../wifi.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accessLogRetention: typeof accessLogRetention;
  agreements: typeof agreements;
  "agreements/coords": typeof agreements_coords;
  "agreements/generated/fonts": typeof agreements_generated_fonts;
  "agreements/generated/templates": typeof agreements_generated_templates;
  "agreements/pdf": typeof agreements_pdf;
  "agreements/seal": typeof agreements_seal;
  agreementsInternal: typeof agreementsInternal;
  applications: typeof applications;
  auth: typeof auth;
  backfillStageSince: typeof backfillStageSince;
  crons: typeof crons;
  dev: typeof dev;
  door: typeof door;
  doorActions: typeof doorActions;
  doorHealth: typeof doorHealth;
  doorInternal: typeof doorInternal;
  doorLog: typeof doorLog;
  doorRevoke: typeof doorRevoke;
  "emails/escape": typeof emails_escape;
  "emails/format": typeof emails_format;
  "emails/generated/alreadyActive": typeof emails_generated_alreadyActive;
  "emails/generated/alreadyUnderReview": typeof emails_generated_alreadyUnderReview;
  "emails/generated/applicationReceived": typeof emails_generated_applicationReceived;
  "emails/generated/approvalGuest": typeof emails_generated_approvalGuest;
  "emails/generated/approvalGuestOpen": typeof emails_generated_approvalGuestOpen;
  "emails/generated/approvalMember": typeof emails_generated_approvalMember;
  "emails/generated/boardDoorAlert": typeof emails_generated_boardDoorAlert;
  "emails/generated/boardLifecycleAlert": typeof emails_generated_boardLifecycleAlert;
  "emails/generated/boardNewApplication": typeof emails_generated_boardNewApplication;
  "emails/generated/confirmEmailChange": typeof emails_generated_confirmEmailChange;
  "emails/generated/emailChanged": typeof emails_generated_emailChanged;
  "emails/generated/eventInvite": typeof emails_generated_eventInvite;
  "emails/generated/magicLink": typeof emails_generated_magicLink;
  "emails/generated/memberUpgrade": typeof emails_generated_memberUpgrade;
  "emails/generated/notice": typeof emails_generated_notice;
  "emails/generated/projectAssigned": typeof emails_generated_projectAssigned;
  "emails/generated/reapplyAfter": typeof emails_generated_reapplyAfter;
  "emails/generated/rejection": typeof emails_generated_rejection;
  "emails/generated/signedAgreement": typeof emails_generated_signedAgreement;
  "emails/generated/taskAssigned": typeof emails_generated_taskAssigned;
  "emails/generated/verifyApplication": typeof emails_generated_verifyApplication;
  "emails/generated/verifyVisitor": typeof emails_generated_verifyVisitor;
  "emails/urls": typeof emails_urls;
  eventCheckIn: typeof eventCheckIn;
  events: typeof events;
  fixImportedDates: typeof fixImportedDates;
  http: typeof http;
  invariants: typeof invariants;
  inventory: typeof inventory;
  "lib/assetTag": typeof lib_assetTag;
  "lib/attendance": typeof lib_attendance;
  "lib/authGuard": typeof lib_authGuard;
  "lib/authRecords": typeof lib_authRecords;
  "lib/boardSignatories": typeof lib_boardSignatories;
  "lib/confirmToken": typeof lib_confirmToken;
  "lib/constants": typeof lib_constants;
  "lib/csv": typeof lib_csv;
  "lib/currentPerson": typeof lib_currentPerson;
  "lib/derive": typeof lib_derive;
  "lib/devAdmin": typeof lib_devAdmin;
  "lib/doorActuation": typeof lib_doorActuation;
  "lib/doorLocks": typeof lib_doorLocks;
  "lib/doorPresence": typeof lib_doorPresence;
  "lib/doorProvider": typeof lib_doorProvider;
  "lib/doorProviderEnv": typeof lib_doorProviderEnv;
  "lib/email": typeof lib_email;
  "lib/emailAddress": typeof lib_emailAddress;
  "lib/erasure": typeof lib_erasure;
  "lib/fakeDoorProvider": typeof lib_fakeDoorProvider;
  "lib/invariants": typeof lib_invariants;
  "lib/lifecycle": typeof lib_lifecycle;
  "lib/lifecycleDiagram": typeof lib_lifecycleDiagram;
  "lib/lifecycleTypes": typeof lib_lifecycleTypes;
  "lib/names": typeof lib_names;
  "lib/nukiClient": typeof lib_nukiClient;
  "lib/occupancy/index": typeof lib_occupancy_index;
  "lib/occupancy/provider": typeof lib_occupancy_provider;
  "lib/occupancy/providers/nukiDoorOpens": typeof lib_occupancy_providers_nukiDoorOpens;
  "lib/onboardingSteps": typeof lib_onboardingSteps;
  "lib/peopleRefs": typeof lib_peopleRefs;
  "lib/personViews": typeof lib_personViews;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/reapply": typeof lib_reapply;
  "lib/recaptcha": typeof lib_recaptcha;
  "lib/roles": typeof lib_roles;
  "lib/routes": typeof lib_routes;
  "lib/safeUrl": typeof lib_safeUrl;
  "lib/time": typeof lib_time;
  "lib/typeAssert": typeof lib_typeAssert;
  "lib/validate": typeof lib_validate;
  "lib/wifi": typeof lib_wifi;
  lifecycle: typeof lifecycle;
  linkSafety: typeof linkSafety;
  merge: typeof merge;
  migrateEventTimes: typeof migrateEventTimes;
  migrations: typeof migrations;
  notifications: typeof notifications;
  "notify/alertOnChange": typeof notify_alertOnChange;
  "notify/audience": typeof notify_audience;
  "notify/backfill": typeof notify_backfill;
  "notify/categories": typeof notify_categories;
  "notify/channels/email": typeof notify_channels_email;
  "notify/channels/push": typeof notify_channels_push;
  "notify/channels/pushSender": typeof notify_channels_pushSender;
  "notify/dispatch": typeof notify_dispatch;
  "notify/doorPoll": typeof notify_doorPoll;
  "notify/eventReminders": typeof notify_eventReminders;
  "notify/guests": typeof notify_guests;
  "notify/inbox": typeof notify_inbox;
  "notify/kinds/doorAlert": typeof notify_kinds_doorAlert;
  "notify/kinds/eventEndingSoon": typeof notify_kinds_eventEndingSoon;
  "notify/kinds/eventStartingSoon": typeof notify_kinds_eventStartingSoon;
  "notify/kinds/guestAccessChanged": typeof notify_kinds_guestAccessChanged;
  "notify/kinds/guestAudience": typeof notify_kinds_guestAudience;
  "notify/kinds/guestExpired": typeof notify_kinds_guestExpired;
  "notify/kinds/guestExpiringSoon": typeof notify_kinds_guestExpiringSoon;
  "notify/kinds/lifecycleAlert": typeof notify_kinds_lifecycleAlert;
  "notify/kinds/newApplication": typeof notify_kinds_newApplication;
  "notify/kinds/noticeEmail": typeof notify_kinds_noticeEmail;
  "notify/kinds/projectAssigned": typeof notify_kinds_projectAssigned;
  "notify/kinds/taskAssigned": typeof notify_kinds_taskAssigned;
  "notify/notify": typeof notify_notify;
  "notify/prefs": typeof notify_prefs;
  "notify/recipients": typeof notify_recipients;
  "notify/registry": typeof notify_registry;
  "notify/subscriptions": typeof notify_subscriptions;
  "notify/types": typeof notify_types;
  occupancy: typeof occupancy;
  onboarding: typeof onboarding;
  opsAlerts: typeof opsAlerts;
  people: typeof people;
  personEvents: typeof personEvents;
  projects: typeof projects;
  purge: typeof purge;
  remindUnsigned: typeof remindUnsigned;
  seed: typeof seed;
  tasks: typeof tasks;
  visitors: typeof visitors;
  wifi: typeof wifi;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
