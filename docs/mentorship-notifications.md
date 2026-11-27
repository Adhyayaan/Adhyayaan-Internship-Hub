# Mentorship unread messages and notifications

Students and assigned guides have a separate read-through cursor for each conversation. Opening its message history records the newest message as read. The conversation list counts later messages from the other participant as unread; a participant's own messages do not count.

Browser notifications are an optional, account-level preference and are off by default. Enabling them asks the browser for permission. When a new message arrives, the server sends a private server-sent event to the other participant. If the Adhyayaan tab is visible, the app shows an in-app alert. If the tab is in the background and browser notifications are enabled and permitted, it shows a browser alert without message contents. Selecting that alert opens the conversation.

Delivery is live only while the app is open and connected. No email or operating-system push delivery is configured, and browser alerts do not arrive while the app is closed. If an event is missed during a connection interruption, the unread count remains stored and is refreshed when the event stream reconnects or the conversation list is opened. Event streams use the API server's in-memory connections, so this delivery path assumes the existing single-process API service.

The read-cursor ordering and participant-targeting rules are covered by `artifacts/api-server/src/lib/mentorship-notifications.test.mjs`.
