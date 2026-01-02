# Appointment Reminder CRON Service

This is a standalone microservice that handles appointment reminders for The Royal Barber. It runs as a Railway cron job every 5 minutes and sends Expo push notifications to both clients and barbers 15 minutes before their appointments.

## Features

- **Standalone Service**: Runs independently of the main API.
- **Dual Notification**: Notifies both Client and Barber.
- **Expo Push Notifications**: Uses Expo for reliable push notifications.
- **Railway Cron Jobs**: Uses Railway's native cron job system for efficient resource usage.
- **Graceful Shutdown**: Handles SIGTERM/SIGINT correctly and closes database connections properly.

## Prerequisites

- Node.js or Bun
- PostgreSQL database (shared with main API)
- Environment variables configured
- Railway account for deployment

## Configuration

Create a `.env` file in the `cron-service` directory (or configure in Railway) with the following variables:

```env
DATABASE_URL=postgresql://user:password@host:port/dbname
NODE_ENV=production
```

- `DATABASE_URL`: Connection string to the main application database.
- `NODE_ENV`: Environment mode (production/development).

**Note**: The cron schedule is configured in `railway.json` and is set to run every 5 minutes (`*/5 * * * *`). All schedules are in UTC timezone.

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

   The service will execute the reminder job once and exit. To test multiple runs, execute it again manually.

## Deployment on Railway

This service is configured to use Railway's native cron job system, which executes the service on a schedule and allows it to exit after completing the task.

### Configuration

The service is configured via `railway.json`:

- **Cron Schedule**: `*/5 * * * *` (every 5 minutes in UTC)
- **Build Command**: `bun install && bun run build`
- **Start Command**: `bun dist/index.js`

### Deployment Steps

1. **Create a New Service** in your Railway project.
2. **Connect Repo**: Select this repository.
3. **Configure Settings**:
   - **Root Directory**: Leave as `/` (Root) so it can access shared files in `src/`.
   - The build and start commands are already configured in `railway.json`.
4. **Environment Variables**: Add `DATABASE_URL` and other required variables in Railway dashboard.
5. **Cron Schedule**: The schedule is configured in `railway.json`. Railway will automatically execute the service every 5 minutes.

### Manual Execution

To manually trigger the job for testing:

1. **Via Railway Dashboard**: Use the "Deploy" button or trigger a new deployment.
2. **Via Railway CLI**: 
   ```bash
   railway run bun dist/index.js
   ```

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

### Option 2: Local Execution

To test the logic locally:

1. **Run the service**:
   ```bash
   bun dev
   ```

2. The service will execute the reminder job and exit. Check logs for output.

3. **Run again** to test multiple executions:
   ```bash
   bun dev
   ```

### Option 3: Create Test Appointment

To test the full flow:

1. Create an appointment scheduled for **15 minutes from now**
2. Make sure your user has:
   - A valid Expo push token registered
   - Push notifications enabled
3. Wait for the next cron execution (every 5 minutes) or trigger manually via Railway
4. Check your device for the notification

### Getting Your Expo Push Token

Your Expo push token should be registered when you use the app. To check or get it:

1. **From the app**: The token is automatically registered when you enable push notifications
2. **From the database**: Query your user record to see the `expo_push_token` field
3. **From the API**: Use the `/users/push-token` endpoint to register/update your token

## Logic Details

- The job checks for confirmed appointments scheduled between **now and 20 minutes** from the current time.
- It sends a reminder only if the user/barber has a valid Expo Push Token and has notifications enabled.
- The service executes the job and exits immediately after completion, ensuring efficient resource usage.

## Architecture

This service uses Railway's cron job system:

- Railway executes the service every 5 minutes based on the cron schedule
- The service runs the reminder job on startup
- Database connections are properly closed before the process exits
- Railway starts a new instance for each execution

## Benefits

- **Resource Efficiency**: Service only runs when executing, not 24/7
- **Simpler Architecture**: No scheduling library or web server needed
- **Railway Native**: Uses Railway's built-in cron functionality
- **Cost Savings**: Reduced compute time compared to a continuously running service
