# Appointment Reminder CRON Service

This is a standalone microservice that handles appointment reminders for The Royal Barber. It runs on a schedule (default: every 15 minutes) and sends Expo push notifications to both clients and barbers 15 minutes before their appointments.

## Features

- **Standalone Service**: Runs independently of the main API.
- **Dual Notification**: Notifies both Client and Barber.
- **Expo Push Notifications**: Uses Expo for reliable push notifications.
- **Health Checks**: HTTP server for health monitoring (useful for Railway).
- **Graceful Shutdown**: Handles SIGTERM/SIGINT correctly.
- **Manual Trigger**: Endpoint to manually trigger the job for testing.

## Prerequisites

- Node.js or Bun
- PostgreSQL database (shared with main API)
- Environment variables configured

## Configuration

Create a `.env` file in the `cron-service` directory (or configure in Railway) with the following variables:

```env
DATABASE_URL=postgresql://user:password@host:port/dbname
CRON_SCHEDULE=*/15 * * * *
NODE_ENV=production
PORT=3001
```

- `DATABASE_URL`: Connection string to the main application database.
- `CRON_SCHEDULE`: Crontab expression for the schedule (default: every 15 mins).
- `PORT`: Port for the health check server (default: 3001).

## Development

1. Install dependencies:
   ```bash
   cd cron-service
   bun install
   ```

2. Run in development mode:
   ```bash
   bun dev
   ```

## Deployment on Railway

This service is optimized for Railway deployment.

1. **Create a New Service** in your Railway project.
2. **Connect Repo**: Select this repository.
3. **Configure Settings**:
   - **Root Directory**: Leave as `/` (Root) so it can access shared files in `src/`.
   - **Build Command**: `cd cron-service && bun install && bun run build`
   - **Start Command**: `cd cron-service && bun dist/index.js`
   - **Watch Paths**: `cron-service/**` (optional)
4. **Environment Variables**: Add `DATABASE_URL`, `CRON_SCHEDULE`, etc.
5. **Health Check Path**: Set to `/health`.

## API Endpoints

The service exposes a lightweight HTTP server:

- `GET /health`: Returns 200 OK if running.
- `GET /status`: Returns details about the last run, next run estimation, and statistics.
- `POST /trigger`: Manually triggers the reminder job immediately.

## Testing

### Option 1: Test Script (Recommended)

Use the included test script to send a notification directly to your device:

```bash
cd cron-service

# Test with your Expo push token directly
bun test-notification.ts --token ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]

# Test with your user ID (fetches token from database)
bun test-notification.ts --user-id YOUR_USER_ID

# Trigger the cron job (checks for appointments 14-16 min away)
bun test-notification.ts --trigger
```

### Option 2: Manual Trigger via API

To test the logic without waiting for the schedule:

1. **In Production**: Send a POST request to your production cron service:
   ```bash
   curl -X POST https://your-cron-service.railway.app/trigger
   ```

2. **Locally**: Start the service and trigger it:
   ```bash
   bun dev
   # In another terminal:
   curl -X POST http://localhost:3001/trigger
   ```

3. Check logs for output.

### Option 3: Create Test Appointment

To test the full flow:

1. Create an appointment scheduled for **15 minutes from now**
2. Make sure your user has:
   - A valid Expo push token registered
   - Push notifications enabled
3. Trigger the cron job manually or wait for the scheduled run
4. Check your device for the notification

### Getting Your Expo Push Token

Your Expo push token should be registered when you use the app. To check or get it:

1. **From the app**: The token is automatically registered when you enable push notifications
2. **From the database**: Query your user record to see the `expo_push_token` field
3. **From the API**: Use the `/users/push-token` endpoint to register/update your token

## Logic Details

- The job checks for confirmed appointments scheduled between **14 and 16 minutes** from the current time.
- It sends a reminder only if the user/barber has a valid Expo Push Token and has notifications enabled.

