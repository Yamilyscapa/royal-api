import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import cron from 'node-cron';
import { checkAndSendReminders } from './reminder-job.js';
import winstonLogger from './helpers/logger.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = new Hono();
const port = parseInt(process.env.PORT || '3001');

// State tracking
let lastRunTime: string | null = null;
let nextRunTime: string | null = null;
let lastRunResult: any = null;
let isJobRunning = false;

// CRON Schedule: Default to every 15 minutes
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '*/15 * * * *';
const TIMEZONE = 'America/Mexico_City';

// Check if schedule uses seconds (6 fields) - node-cron v4 has timezone bugs with seconds
const scheduleFields = CRON_SCHEDULE.trim().split(/\s+/).length;
const useSecondsFormat = scheduleFields === 6;

// Function to run the reminder check
async function runJob(manual = false) {
  if (isJobRunning) {
    winstonLogger.warn('Reminder job skipped: Previous job still running');
    return { success: false, error: 'Job already running' };
  }

  isJobRunning = true;
  const startTime = new Date();
  winstonLogger.info(`Starting reminder job (${manual ? 'Manual' : 'Scheduled'})`, {
    timestamp: startTime.toISOString()
  });

  try {
    const result = await checkAndSendReminders();
    
    lastRunTime = startTime.toISOString();
    lastRunResult = result;
    
    winstonLogger.info('Reminder job completed', {
      durationMs: Date.now() - startTime.getTime(),
      result
    });

    return result;
  } catch (error) {
    winstonLogger.error('Reminder job failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    lastRunResult = { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  } finally {
    isJobRunning = false;
  }
}

// Setup CRON job
// Note: node-cron v4 has a bug with timezone + seconds format, so we skip timezone for seconds-based schedules
const job = cron.schedule(CRON_SCHEDULE, () => {
  runJob(false);
}, useSecondsFormat ? {
  scheduled: false
} : {
  timezone: TIMEZONE,
  scheduled: false
} as any);

// Update next run time helper
function updateNextRunTime() {
  try {
    // Cast to any because of version mismatch between @types/node-cron (v3) and node-cron (v4)
    // v4 supports nextDates()
    const nextDates = (job as any).nextDates(1);
    
    if (Array.isArray(nextDates) && nextDates.length > 0) {
      const next = nextDates[0];
      // Handle potential Moment object or Date object
      nextRunTime = next instanceof Date ? next.toISOString() : next.toString();
    } else {
      nextRunTime = 'Unknown';
    }
  } catch (e) {
    nextRunTime = 'Unknown';
  }
}

// API Endpoints for Health Checks and Monitoring

app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'appointment-reminder-cron' });
});

app.get('/status', (c) => {
  updateNextRunTime(); // Refresh next run time estimation
  return c.json({
    status: 'active',
    schedule: CRON_SCHEDULE,
    timezone: TIMEZONE,
    isJobRunning,
    lastRunTime,
    nextRunTime,
    lastRunResult
  });
});

app.post('/trigger', async (c) => {
  const result = await runJob(true);
  return c.json({
    message: 'Manual job execution completed',
    result
  });
});

// Start the server
winstonLogger.info(`Starting CRON service on port ${port}`);
winstonLogger.info(`Scheduled to run: ${CRON_SCHEDULE} (${useSecondsFormat ? 'local time - seconds format' : TIMEZONE})`);

serve({
  fetch: app.fetch,
  port
});

// Start the CRON job
job.start();
updateNextRunTime();
winstonLogger.info('CRON scheduler started');

// Graceful shutdown
const shutdown = () => {
  winstonLogger.info('Shutting down service...');
  job.stop();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

