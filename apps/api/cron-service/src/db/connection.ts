import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

let db: ReturnType<typeof drizzle> | null = null;
let client: ReturnType<typeof postgres> | null = null;

export async function initializeDatabase() {
    if (db) {
        return db; // Already initialized
    }

    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is not set');
    }

    try {
        // Create the connection with better timeout handling
        client = postgres(connectionString, {
            max: 10, // Maximum number of connections
            idle_timeout: 20, // Close idle connections after 20 seconds
            connect_timeout: 10, // Connection timeout
            connection: {
                application_name: 'the_royal_barber_cron'
            },
            onnotice: () => {}, // Suppress notice messages
            onparameter: () => {}, // Suppress parameter messages
        });

        // Create the database instance
        db = drizzle(client, { schema });

        // Test the connection
        await client`SELECT 1`;
        console.log('✅ Database connection established successfully');

        return db;
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        throw error;
    }
}

export async function getDatabase() {
    if (!db) {
        await initializeDatabase();
    }
    return db!;
}

/**
 * Close all database connections
 * This should be called before the process exits to ensure proper cleanup
 */
export async function closeDatabase(): Promise<void> {
    if (client) {
        try {
            await client.end();
            client = null;
            db = null;
            console.log('✅ Database connections closed successfully');
        } catch (error) {
            console.error('❌ Error closing database connections:', error);
            throw error;
        }
    }
}

export * from './schema.js';

