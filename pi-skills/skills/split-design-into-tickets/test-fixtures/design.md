# Notification System Redesign

## Overview
Redesign the in-app notification system to support real-time push, in-app inbox, and email digest channels.

## User Story
As a user, I want to receive timely notifications across my preferred channels, so that I never miss important updates.

## Modules

### 1. Real-time Push Gateway
Integrate with Apple Push Notification service (APNs) and Firebase Cloud Messaging (FCM) to deliver real-time push notifications.

**Acceptance Criteria:**
- Users receive push notifications within 5 seconds of a triggering event.
- The system gracefully handles token invalidation and refresh.
- A fallback to in-app inbox occurs when push delivery fails.

**Related Documents:**
- https://developer.apple.com/documentation/usernotifications
- https://firebase.google.com/docs/cloud-messaging

### 2. In-App Inbox
Build a persistent inbox where users can view, archive, and mark notifications as read.

**Acceptance Criteria:**
- Users can paginate through inbox items with 50ms response time.
- Read/archive state syncs across devices.
- Unread count badge updates in real time.

**Related Documents:**
- https://reactnative.dev/docs/flatlist

### 3. Email Digest Engine
Compile daily/weekly digests of notifications and send them via email for users who opt in.

**Acceptance Criteria:**
- Users can configure digest frequency (immediate, daily, weekly).
- Email rendering is consistent across major clients (Gmail, Outlook, Apple Mail).
- Unsubscribe link is included in every email.

**Related Documents:**
- https://www.ampproject.org/documentation/

## Out of Scope
- SMS notifications
- WhatsApp integration
- Custom notification sounds per channel
