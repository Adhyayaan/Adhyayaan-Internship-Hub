import test from "node:test";
import assert from "node:assert/strict";
import { getMentorshipAlertChannel } from "./mentorship-alerts.ts";

test("visible users get an in-app alert unless they already have the thread open", () => {
  assert.equal(getMentorshipAlertChannel({
    notificationsEnabled: false,
    browserPermissionGranted: false,
    tabHidden: false,
    threadOpen: false,
  }), "toast");
  assert.equal(getMentorshipAlertChannel({
    notificationsEnabled: true,
    browserPermissionGranted: true,
    tabHidden: false,
    threadOpen: true,
  }), "none");
});

test("background browser alerts require both the saved preference and browser permission", () => {
  assert.equal(getMentorshipAlertChannel({
    notificationsEnabled: true,
    browserPermissionGranted: true,
    tabHidden: true,
    threadOpen: false,
  }), "browser");
  assert.equal(getMentorshipAlertChannel({
    notificationsEnabled: true,
    browserPermissionGranted: false,
    tabHidden: true,
    threadOpen: false,
  }), "none");
  assert.equal(getMentorshipAlertChannel({
    notificationsEnabled: false,
    browserPermissionGranted: true,
    tabHidden: true,
    threadOpen: true,
  }), "none");
});
