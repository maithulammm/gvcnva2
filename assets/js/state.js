"use strict";

// Shared application state; initialized once before feature scripts.

const auth = {
  client: null,
  account: null,
  email: "",
  assignment: null,
  config: null,
  initializing: false,
};

let appData;

let ui = {
  role: "gvcn",
  grade: "6",
  classId: "6A1",
  month: MONTH_DEFAULT,
  page: "dashboard",
  search: "",
  workFilter: "all",
  workFilterScope: "",
  profileId: "",
  editing: null,
  preview: null,
  adminMenuOpen: false,
};

let toastTimer = null;

const cloud = {
  ready: false,
  busy: false,
  worker: null,
  error: "",
  revisions: {},
  baselines: {},
  summaries: {},
  checks: {},
  assignment: null,
  pending: new Set(),
  timer: null,
  poll: null,
  epoch: 0,
  lastSync: "",
  unassignedDrafts: {},
};
