/**
 * Every user-facing string in the app.
 *
 * Not an i18n library — English only, no locale files (manager's decision,
 * ticket 3). The benefit being bought is that ticket 15's error-copy sweep is
 * one file to read rather than a hunt, and tone stays consistent because it is
 * all visible at once.
 *
 * CLAUDE.md: no user-facing string literal may live in a component.
 */

export const strings = {
  app: {
    name: "Humble Drive",
    tagline: "Consignment dispatch",
  },

  nav: {
    drivers: "Drivers",
    plan: "Plan a run",
    trips: "Trips",
    signOut: "Sign out",
    menu: "Menu",
    menuOpenLabel: "Open navigation",
    menuCloseLabel: "Close navigation",
    skipToContent: "Skip to content",
  },

  login: {
    title: "Sign in",
    subtitle: "Supervisor access only.",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    forgot: "Forgot your password?",
    resetSent: "If that address has an account, a reset link is on its way.",
    resetTitle: "Reset your password",
    resetSubmit: "Send reset link",
    backToSignIn: "Back to sign in",
    // Wrong credentials. Deliberately does not say which field was wrong.
    badCredentials: "That email and password don't match. Please try again.",
    // Authenticated, but not a supervisor. Not their fault, so the copy
    // doesn't blame them (ticket 3).
    notSupervisor:
      "This account isn't set up for Humble Drive. Ask your manager to add it, then sign in again.",
    checking: "Checking your access…",
  },

  /** Server errors return their own `message`; these are the fallbacks when a
   *  request fails before one arrives. Every code from PRD §4.7 is here,
   *  including ones no screen shows yet — a later ticket should find the copy
   *  written rather than invent it inline. */
  errors: {
    unauthorized: "Please sign in again to continue.",
    not_admin: "This account isn't set up for Humble Drive.",
    driver_inactive: "That driver is inactive. Reactivate them, or choose someone else.",
    driver_busy: "That driver is already on a run.",
    not_found: "We couldn't find that. It may have been removed.",
    invalid_transition: "This run has already moved on. Refresh to see where it is now.",
    places_failed: "We couldn't reach the address lookup just now. Please try again in a moment.",
    routes_failed: "We couldn't work out a route just now. Please try again in a moment.",
    email_failed: "The run was saved, but the code didn't send. Use Resend to try again.",
    bad_request: "That request didn't look right. Please check it and try again.",
    internal_error: "Something went wrong on our side. Please try again in a moment.",
    offline: "You appear to be offline. Check your connection and try again.",
    unknown: "Something went wrong. Please try again.",
  },

  common: {
    loading: "Loading…",
    retry: "Try again",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving…",
    close: "Close",
  },

  drivers: {
    title: "Drivers",
    description: "The people you can assign runs to. Drivers never sign in — they get a code by email.",
    add: "Add driver",
    edit: "Edit",
    filter: "Search drivers",
    filterPlaceholder: "Name, email or phone",
    name: "Name",
    email: "Email",
    phone: "Phone",
    phoneHint: "10-digit Indian mobile. Spaces and +91 are fine.",
    status: "Status",
    currentRun: "Current run",
    actions: "Actions",
    active: "Active",
    inactive: "Inactive",
    free: "Free",
    deactivate: "Deactivate",
    reactivate: "Reactivate",
    addTitle: "Add a driver",
    editTitle: "Edit driver",
    // Editing an email is allowed at any time, but a pending code went to the
    // old address, so the supervisor has to know a resend is needed.
    emailChangeWarning:
      "This driver has a code waiting. Changing their email means the code they were sent no longer reaches them — resend it from the trip.",
    deactivateTitle: "Deactivate this driver?",
    deactivateBody:
      "They stay in the list and keep their history, but you won't be able to assign them new runs.",
    // There is no delete, anywhere. Trips reference drivers and a completed run
    // has to keep naming who drove it.
    empty: "No drivers yet",
    emptyBody: "Add the first driver and they'll be available when you plan a run.",
    noMatches: "No drivers match your search",
    noMatchesBody: "Try a different name, email or phone number.",
    clearFilter: "Clear search",
  },

  placeholder: {
    // Stub pages name the ticket that fills them, so an empty screen reads as
    // "not built yet" rather than "broken".
    drivers: "Driver management arrives in ticket 5.",
    plan: "The planning wizard arrives in ticket 6.",
    trips: "The trips dashboard arrives in ticket 8.",
    tripDetail: "Trip detail arrives in ticket 8.",
    comingSoon: "Not built yet",
  },

  notFound: {
    title: "Page not found",
    body: "That page doesn't exist. It may have moved, or the link may be wrong.",
    back: "Go to Trips",
  },
} as const;
