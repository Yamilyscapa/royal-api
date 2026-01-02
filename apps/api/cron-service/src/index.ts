import { checkAndSendReminders } from './reminder-job.js';
import winstonLogger from './helpers/logger.js';
import dotenv from 'dotenv';
import { closeDatabase } from './db/connection.js';

// Load environment variables
dotenv.config();

// Main execution function
async function main() {
  const startTime = new Date();
  winstonLogger.info('Starting reminder job execution', {
    timestamp: startTime.toISOString()
  });

  try {
    const result = await checkAndSendReminders();
    
    winstonLogger.info('Reminder job completed successfully', {
      durationMs: Date.now() - startTime.getTime(),
      result
    });

    // Close database connections before exiting
    await closeDatabase();
    
    process.exit(0);
  } catch (error) {
    winstonLogger.error('Reminder job failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Close database connections even on error
    try {
      await closeDatabase();
    } catch (closeError) {
      winstonLogger.error('Error closing database connection', {
        error: closeError instanceof Error ? closeError.message : 'Unknown error'
      });
    }
    
    process.exit(1);
  }
}

// Handle graceful shutdown signals
const shutdown = async () => {
  winstonLogger.info('Received shutdown signal, closing database connections...');
  try {
    await closeDatabase();
    process.exit(0);
  } catch (error) {
    winstonLogger.error('Error during shutdown', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Execute the job
main();
