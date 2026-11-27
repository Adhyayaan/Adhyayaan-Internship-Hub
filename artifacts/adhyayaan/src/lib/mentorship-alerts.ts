export type MentorshipAlertChannel = 'browser' | 'toast' | 'none';

export function getMentorshipAlertChannel({
  notificationsEnabled,
  browserPermissionGranted,
  tabHidden,
  threadOpen,
}: {
  notificationsEnabled: boolean;
  browserPermissionGranted: boolean;
  tabHidden: boolean;
  threadOpen: boolean;
}): MentorshipAlertChannel {
  if (tabHidden) {
    return notificationsEnabled && browserPermissionGranted ? 'browser' : 'none';
  }
  return threadOpen ? 'none' : 'toast';
}
