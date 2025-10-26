# Mobile integration guide — Backend switched to Email-first notifications

This document explains what changed on the backend (server now sends email for domain events) and what the mobile team should do to keep UX consistent.

Audience: Mobile developers (Android / iOS / React Native)

---

## Summary

The backend no longer relies solely on push notifications for key events. Instead, it sends transactional emails for events such as:

- Budget alerts (budget.threshold_reached)
- Saving goal contributions (goal.contribution_added)
- Payment verified / failed
- Recommendations generated

The server still supports notification audit records (recommended) but primary delivery is email. This guide explains minimal changes you may want to make to the app to keep a good UX and to support user preferences.

## High-level implications for mobile

- If the app previously relied on receiving push notifications only, users will now get emails instead of push messages. App behavior will continue to work, but users won't see push toasts if the app doesn't show an email-sent acknowledgment.
- Recommended: keep device token registration endpoints in place (do not remove) so push can be re-enabled later without forcing an app update.
- Recommended: add a settings screen for Notification Preferences and ensure the app displays notices when emails are sent (e.g., a toast, snackbar, or inline message).

## Minimal changes (no required server change)

If you want to do nothing now, this is acceptable. But consider the following UX improvements:

- Show an inline toast when actions happen that trigger email ("Thông báo đã gửi vào email của bạn").
- Keep the device token registration code unchanged (no need to delete API calls).
- If the app polls a `GET /api/notifications` endpoint and the server still writes audit records, there is no change for notification center.

## Recommended changes (strongly suggested)

1. Add / update Notification Preferences UI
   - Allow users to toggle types of notifications and the channel (Email / Push).
   - Persist preferences with server endpoints (examples below). Mobile should read/write these preferences at login and via Settings.

2. Ensure the app collects a verified email
   - If you allowed optional email earlier, prompt the user to add/verify an email address to receive transactional emails.

3. Notify the user in-app when an email is sent
   - For actions that previously produced immediate push notifications, show a short success toast: "Thông báo đã được gửi vào email của bạn".

4. Keep device-token registration but optionally stop prompting for push permission
   - If you will not use push for a while, avoid asking for push permissions on first-run; request permission later when you decide to re-enable push.

5. Handle Notification Center data source
   - Option A (recommended): Backend persists `Notification` audit records. App continues to list notifications from `GET /api/v1/notifications`.
   - Option B: If audit records are removed server-side, change Notification Center to display a different history (e.g., local events + email history endpoint).

## API surface (examples)

Below are suggested server endpoints (if not already present). If backend already exposes similar endpoints, use them.

- GET user notification preferences
  - GET /api/v1/users/:id/notification-preferences
- Update user notification preferences
  - PUT /api/v1/users/:id/notification-preferences
  - Body example:
    ```json
    {
      "preferences": {
        "budget": { "email": true, "push": false },
        "payment": { "email": true, "push": false },
        "goal": { "email": true, "push": false }
      }
    }
    ```
- Notification history (audit)
  - GET /api/v1/notifications?limit=20&skip=0
  - Response item example:
    ```json
    {
      "_id": "...",
      "userId": "...",
      "type": "goal.contribution_added",
      "channel": "email",
      "subject": "Cập nhật mục tiêu tiết kiệm",
      "body": "...html...",
      "deliveredAt": "2025-10-21T...",
      "deliveryStatus": "sent"
    }
    ```

If you want, I can add these endpoints server-side and persist a Notification record when send-email completes.

## UI/UX copy suggestions (Vietnamese)

- Success toast after an action that triggers an email:
  - "Thông báo đã được gửi vào email của bạn"
  - Optional extra: "Kiểm tra hộp thư đến hoặc mục Quảng cáo nếu không thấy trong inbox."

- In Settings → Notifications:
  - Title: "Thông báo"
  - Subtitle: "Chọn cách bạn muốn nhận thông báo"
  - Options per type: toggle for Email, toggle for Push

- If email not verified:
  - Show CTA: "Nhập email để nhận thông báo" → dẫn tới screen cập nhật email + gửi mail xác thực

## Testing checklist (mobile)

1. Verify email exists on the user account and is verified.
2. From the app, perform an action that would trigger an email (e.g., contribute to saving goal). Expect:
   - App updates its UI (goal amount updated)
   - App shows toast: "Thông báo đã được gửi vào email của bạn"
   - The user receives an email in their inbox
3. Cross-check server logs (or ask backend dev) for the sent email messageId.
4. If Notification Center should show the event, confirm the GET /notifications reflects the new audit entry.

## How to trigger tests from backend (developer-friendly)

- Quick script (already in repo) sends a test email using templates:

  ```powershell
  node ./scripts/sendTestEmail.js
  ```

  - This will send to `vuduc870@gmail.com` by default. Change script to send to a different address if required.

- Publish domain event in-process (dev endpoint) to exercise full event flow → email:
  ```powershell
  curl -X POST http://localhost:8080/__dev/publish-test-events `
    -H "Content-Type: application/json" `
    -H "X-DEV-SECRET: <your-dev-secret>" `
    -d '{"events":[{"name":"goal.contribution_added","payload":{"userId":"<userId>","amount":50000}}]}'
  ```

  - Replace `<your-dev-secret>` and `<userId>` accordingly.

## Edge cases & errors

- If email sending fails (SMTP error):
  - Server should log and retry (recommended). Mobile sees nothing special; you can show a temporary message if the app expects immediate confirmation.
- If user has no email set: prompt them to add/verify email before relying on email-only notifications.
- If user unsubscribes/unchecks email in settings: server should honor preferences and not send emails for those types.

## Rollout plan (recommended)

1. Short-term (safe): Keep device token registration and backend audit records; update mobile UI to display a toast when email is sent and add a Settings notice explaining the change.
2. Medium-term: Add Notification Preferences API and a Settings UI so users can opt in/out per channel/type.
3. Long-term: Re-enable push or use both push+email for critical alerts. Make DKIM/SPF and deliverability improvements on server.

## Mobile PR checklist (suggested)

- [ ] Add/toast/snackbar when actions trigger email
- [ ] Add Settings UI for notification preferences (email/push per type)
- [ ] Add email verification flow where needed
- [ ] Keep device token registration (do not remove) OR gate push permission prompt behind a feature flag
- [ ] Add analytics events for email-sent (useful to track deliverability/engagement)
- [ ] Add tests for Notification Center listing (if audit records are persisted)

## Example client-side snippet (React Native pseudo)

```js
// After calling contribution API and getting 200 OK:
showToast('Thông báo đã được gửi vào email của bạn');

// Settings screen: toggle handler
async function updatePref(type, channel, enabled) {
  await api.put(`/api/v1/users/${userId}/notification-preferences`, {
    preferences: { [type]: { [channel]: enabled } },
  });
}
```

---

If you want, I can:

- Create a PR with a short `CHANGELOG` entry for mobile devs and a sample code diff (Android/iOS/React Native).
- Implement server endpoints (`/notification-preferences`, persist Notification audit) and add unsubscribe links in email templates.

Chọn 1: "Tạo PR cho mobile" (mình sẽ tạo PR content & diff), hoặc 2: "Tôi muốn bạn thêm endpoints + persist audit" — tôi sẽ tiếp tục thực hiện server-side.
