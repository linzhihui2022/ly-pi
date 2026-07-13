# Notification System Redesign

We need to redesign the in-app notification system to support real-time push, in-app inbox, and email digest channels.

Users should receive timely notifications across their preferred channels, so that they never miss important updates.

Real-time push must integrate with Apple Push Notification service (APNs) and Firebase Cloud Messaging (FCM). Users should get push notifications within 5 seconds of a triggering event. The system must handle token invalidation and refresh gracefully, and fall back to the in-app inbox when push delivery fails. See https://developer.apple.com/documentation/usernotifications and https://firebase.google.com/docs/cloud-messaging for provider documentation.

The in-app inbox lets users view, archive, and mark notifications as read. Pagination should respond within 50ms. Read and archive state must sync across devices. The unread badge should update in real time. The React Native FlatList docs are relevant: https://reactnative.dev/docs/flatlist.

Email digests compile daily or weekly unread notifications for users who opt in. Users can choose immediate, daily, or weekly frequency. Emails must render consistently across Gmail, Outlook, and Apple Mail, and include an unsubscribe link. AMP for Email documentation is at https://www.ampproject.org/documentation/.

Out of scope: SMS, WhatsApp, custom notification sounds per channel.
