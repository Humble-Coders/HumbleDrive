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
    overview: "Overview",
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
    // The left panel exists to say what this is to someone who has never seen
    // it — a supervisor opening a link, or a panel watching a demo.
    pitch: "Plan the journey. Watch it happen.",
    pitchBody:
      "One place to plan a run, brief the driver, and see how the day actually went.",
    point1: "Compare real routes before you commit",
    point1Body: "Live driving times, so a plan reflects the road rather than a guess.",
    point2: "Brief the driver in one message",
    point2Body: "A single-use code opens the whole run on their phone. No accounts, no passwords.",
    point3: "Rest stops are part of the plan",
    point3Body: "Breaks carry a planned duration, so the day adds up honestly.",

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

  dashboard: {
    title: "Fleet overview",
    description: "Everything happening right now, and what came before it.",
    onTheRoad: "On the road",
    awaitingStart: "Awaiting start",
    activeDrivers: "Active drivers",
    completedRuns: "Completed",
    movingNow: "Being driven now",
    noneMoving: "Nothing moving",
    codeSentHint: "Code sent, not started",
    deliveredHint: "All time",
    recent: "Recent runs",
    viewAll: "View all",
    quickPlan: "Plan a run",
    quickDrivers: "Manage drivers",
    nothingLive: "No runs in progress",
    nothingLiveBody: "When a driver starts a run it appears here.",
    firstRun: "Plan your first run",
    firstRunBody: "Pick a route, add the driver's break stops, and send them a code.",
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

  plan: {
    title: "Plan a run",
    step1: "Where to and from",
    step2: "Choose a route",
    step3: "Add break stops",
    step4: "Consignment and driver",
    stepOf: "Step",
    next: "Next",
    back: "Back",

    origin: "Starting from",
    destination: "Going to",
    searchPlaceholder: "Search for a place in India",
    noMatches: "No matches",
    searching: "Searching…",

    routesTitle: "Routes",
    routesHint: "Pick the corridor you want. You'll add break stops next.",
    selected: "Selected",
    // Adding a stop means Google can no longer return alternatives, so the
    // cards collapse. Said plainly, because a supervisor should never wonder
    // where their options went.
    refinedNotice:
      "Stops refine the route you chose. Alternatives aren't available once a run has stops — remove them all to compare routes again.",
    noRoutes: "No routes found between those places.",

    stopsTitle: "Break stops",
    stopsHint: "Rest, food and fuel stops for the driver. Nothing is dropped off here.",
    addStop: "Add stop",
    stopType: "Type",
    stopMinutes: "Planned minutes",
    moveUp: "Move up",
    moveDown: "Move down",
    remove: "Remove",
    noStops: "No stops yet. A run without breaks is fine.",
    maxStops: "A run can have at most 10 stops.",
    typeBreak: "Rest",
    typeFood: "Food",
    typeFuel: "Fuel",
    typeOther: "Other",

    driveTime: "Drive time",
    breakTime: "Break time",
    totalTime: "Total run time",

    consignmentTitle: "Consignment",
    ref: "Reference",
    description: "Description",
    weight: "Weight (kg)",
    receiverName: "Receiver name",
    receiverPhone: "Receiver phone",
    driver: "Driver",
    chooseDriver: "Choose a driver",
    noFreeDrivers: "Every driver is either inactive or already on a run.",
    summaryTitle: "Before you send",
    send: "Assign and send code",
    sending: "Creating the run…",
    createdTitle: "Run created",
    createdBody: "The code is on its way to the driver.",
    createdNoEmail:
      "The run was created, but the code didn't send. Open it from Trips and use Resend.",
    planAnother: "Plan another run",
    viewTrips: "Go to Trips",
  },

  map: {
    // The browser key is a separate, render-only Google key. Until it exists
    // the route is fully described in text beside where the map will be.
    unavailable: "Map not available yet",
    unavailableBody:
      "The map needs a Google Maps browser key. Everything about the route is listed here in the meantime.",
  },

  trips: {
    title: "Trips",
    description: "Every run, live ones first.",
    filterStatus: "Status",
    all: "All",
    pending: "Awaiting start",
    active: "On the road",
    completed: "Delivered",
    cancelled: "Cancelled",
    driver: "Driver",
    route: "Route",
    planned: "Planned",
    stops: "Stops",
    created: "Created",
    code: "Code",
    codeSent: "Sent",
    codeNotSent: "Not sent",
    empty: "No runs yet",
    emptyBody: "Plan a run and it will appear here.",
    noMatches: "No runs match these filters",
    noMatchesBody: "Try widening the status or driver filter.",
    clearFilters: "Clear filters",
    planRun: "Plan a run",
    showing: "Showing",
    of: "of",
    prev: "Previous",
    next: "Next",

    detailTitle: "Run",
    consignment: "Consignment",
    receiver: "Receiver",
    resend: "Resend code",
    resendTitle: "Send a new code?",
    // A resend mints a fresh code and kills the old one. Said plainly, because
    // a supervisor who does not realise will wonder why the first stopped.
    resendBody:
      "A new code is generated and emailed. The code they were sent before stops working immediately.",
    resendDone: "A new code is on its way.",
    resendFailed: "The new code didn't send. Try again in a moment.",
    cancelRun: "Cancel run",
    cancelTitle: "Cancel this run?",
    cancelPendingBody: "Nobody has started it, so nothing is lost. The driver's code stops working.",
    // Cancelling an active run stops someone who is currently driving.
    cancelActiveBody:
      "This driver is on the road right now. They'll be told the run is cancelled. Say why — it goes on the record.",
    cancelReason: "Reason",
    cancelReasonRequired: "A reason is required when the driver is already on the road.",
    cancelledOn: "Cancelled",
    // Tracking is ticket 13; an unexplained blank panel reads as a bug.
    trackingSoon: "Live tracking and the recorded trail arrive in ticket 13.",
    notFound: "That run doesn't exist",
    notFoundBody: "It may have been removed, or the link may be wrong.",
    backToTrips: "Back to Trips",
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
