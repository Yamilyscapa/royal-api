# Expo Push Notifications Integration

This document describes the push notification system implemented using the Expo Server SDK.

## Overview

The Royal Barber API uses **expo-server-sdk** (v3.7.0) to send push notifications to mobile app users. The system supports:

- ✅ Appointment confirmations
- ✅ Appointment reminders
- ✅ Barber notifications for new bookings
- ✅ Reschedule notifications
- ✅ Custom push notifications
- ✅ Spanish language support
- ✅ Multiple notification channels

## Installation

The expo-server-sdk is already included in the project dependencies:

```json
{
  "dependencies": {
    "expo-server-sdk": "^3.7.0"
  }
}
```

Install dependencies:
```bash
cd apps/api
npm install
```

## Architecture

### Core Components

1. **Helper Module**: `/apps/api/src/helpers/expo-push.helper.ts`
   - Main functions for sending push notifications
   - Notification data generators
   - Token validation utilities

2. **Database Schema**: `/apps/api/src/db/schema.ts`
   - `expoPushToken`: Stores user's Expo push token
   - `pushNotificationsEnabled`: User preference for notifications

3. **API Routes**: `/apps/api/src/notifications/notifications.route.ts`
   - Endpoints for sending notifications
   - Push notification testing endpoints

4. **User Routes**: `/apps/api/src/users/users.route.ts`
   - Token registration endpoint
   - Notification preferences endpoint

## Key Functions

### `sendPushNotification(expoPushToken, notification)`

Sends a push notification to a single device.

```typescript
import { sendPushNotification } from './helpers/expo-push.helper.js';

const result = await sendPushNotification(
  'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
  {
    title: 'Hello!',
    body: 'This is a test notification',
    data: { type: 'test' },
    sound: 'default',
    badge: 1,
    channelId: 'default'
  }
);

if (result.success) {
  console.log('Notification sent:', result.messageId);
} else {
  console.error('Error:', result.error);
}
```

### `sendPushNotificationToMultiple(expoPushTokens, notification)`

Sends a push notification to multiple devices in a single batch.

```typescript
const result = await sendPushNotificationToMultiple(
  ['token1', 'token2', 'token3'],
  {
    title: 'Bulk Notification',
    body: 'This goes to multiple users',
    data: { type: 'bulk' }
  }
);

console.log(`Sent: ${result.totalSent}, Failed: ${result.totalFailed}`);
```

### Notification Generators

Pre-built notification generators for common use cases:

#### Appointment Confirmation
```typescript
const notification = generateAppointmentConfirmationNotification({
  serviceName: 'Corte Clásico',
  appointmentDate: '25 de enero de 2025',
  timeSlot: '10:00',
  barberName: 'Carlos Rodriguez',
  customerName: 'Juan Pérez'
});
```

#### Appointment Reminder
```typescript
const notification = generateAppointmentReminderNotification({
  serviceName: 'Corte Clásico',
  appointmentDate: '25 de enero de 2025',
  timeSlot: '10:00',
  barberName: 'Carlos Rodriguez',
  customerName: 'Juan Pérez'
});
```

#### Barber Notification
```typescript
const notification = generateBarberNotificationPushNotification({
  customerName: 'Juan',
  customerLastName: 'Pérez',
  serviceName: 'Corte Clásico',
  appointmentDate: '25 de enero de 2025',
  timeSlot: '10:00',
  customerPhone: '+1234567890',
  paymentAmount: '25.00'
});
```

## API Endpoints

### Register Push Token
```
POST /api/users/push-token
Authorization: Bearer <token>

Body:
{
  "expoPushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
}
```

### Update Notification Preferences
```
POST /api/users/push-notification-preferences
Authorization: Bearer <token>

Body:
{
  "pushNotificationsEnabled": true
}
```

### Test Push Notification
```
POST /api/users/test-push
Authorization: Bearer <token>

Body:
{
  "message": "Test notification message"
}
```

### Send Appointment Confirmation
```
POST /api/notifications/confirm/:appointmentId
```

### Send Appointment Reminder
```
POST /api/notifications/remind/:appointmentId
```

### Send Barber Notification
```
POST /api/notifications/barber/:appointmentId
```

## Notification Channels

The system uses two notification channels:

1. **appointments**: Customer-facing notifications
   - Appointment confirmations
   - Appointment reminders
   - Reschedule confirmations

2. **barber_notifications**: Staff-facing notifications
   - New appointment alerts
   - Reschedule alerts

## Features

### Token Validation
All push tokens are validated before sending:
```typescript
if (!Expo.isExpoPushToken(token)) {
  // Invalid token - return error
}
```

### Error Handling
The system includes comprehensive error handling:
- Invalid token detection
- Network error handling
- Expo service error handling
- Logging of all errors and successes

### Logging
All notification activities are logged using Winston:
```typescript
winstonLogger.info('Push notification sent successfully', {
  appointmentId,
  messageId: result.messageId
});
```

### Cache Busting
Notifications include timestamps to prevent caching:
```typescript
data: {
  type: 'appointment_confirmation',
  timestamp: Date.now(),
  // ... other data
}
```

### Spanish Language Support
All notifications are in Spanish, matching the target audience:
- Title: "¡Cita Confirmada! 🎉"
- Body: "Tu cita para ... está confirmada..."

## Database Schema

Users table includes push notification fields:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  expo_push_token TEXT,
  push_notifications_enabled BOOLEAN DEFAULT true,
  -- ... other fields
);
```

## Integration with Appointments

Push notifications are automatically triggered during the appointment flow:

1. **Appointment Creation**: 
   - Confirmation sent to customer
   - Notification sent to barber

2. **Appointment Reminder**:
   - Sent via cron job 15 minutes before appointment

3. **Appointment Reschedule**:
   - Confirmation sent to customer
   - Update sent to barber

## Testing

Run the test suite:

```bash
# Basic SDK test
cd apps/api
node tests/test-push-notifications.js

# Comprehensive integration test
npx tsx tests/test-expo-integration.ts
```

### Test Coverage
- ✅ SDK initialization
- ✅ Token validation
- ✅ Message structure creation
- ✅ Notification data generation
- ✅ Error handling
- ✅ Spanish language support
- ✅ Channel configuration
- ✅ Timestamp generation

## Security Considerations

1. **Token Storage**: Expo push tokens are stored securely in the database
2. **Token Validation**: All tokens are validated before use
3. **User Consent**: Users can enable/disable push notifications
4. **Data Privacy**: Notification data includes only necessary information
5. **Access Control**: Push token endpoints require authentication

## Monitoring

Monitor push notification delivery:

1. Check Winston logs for success/failure messages
2. Use Expo's Push Notification Tool for testing
3. Monitor notification receipts (if implemented)

## Troubleshooting

### Common Issues

1. **Invalid Token Format**
   - Ensure token starts with `ExponentPushToken[`
   - Validate token using `Expo.isExpoPushToken()`

2. **Notification Not Received**
   - Check user has `pushNotificationsEnabled` set to true
   - Verify token is registered in database
   - Check Winston logs for errors

3. **Expo Service Errors**
   - Check network connectivity
   - Verify Expo service status
   - Review error messages in logs

## Future Enhancements

Potential improvements:

- [ ] Notification receipt tracking
- [ ] Rich notifications with images
- [ ] Action buttons in notifications
- [ ] Scheduled notifications
- [ ] Notification preferences per type
- [ ] Push notification analytics

## Resources

- [Expo Push Notifications Documentation](https://docs.expo.dev/push-notifications/overview/)
- [expo-server-sdk NPM Package](https://www.npmjs.com/package/expo-server-sdk)
- [Expo Push Notification Tool](https://expo.dev/notifications)

## Support

For issues or questions:
1. Check Winston logs at `/logs/`
2. Review test suite results
3. Consult Expo documentation
4. Check database for token registration
