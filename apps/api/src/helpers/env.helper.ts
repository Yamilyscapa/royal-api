import logger from './logger.js';

interface EnvironmentConfig {
  // Database
  DATABASE_URL: string;
  
  // JWT Configuration
  JWT_SECRET: string;
  REFRESH_SECRET: string;
  INTERNAL_API_SECRET: string;
  
  // Stripe Configuration
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  
  // Server Configuration
  NODE_ENV: string;
  PORT: string;
  API_BASE_URL?: string;
  
  // Feature Flags
  DEBUG_MODE?: string;
  ENABLE_NOTIFICATIONS?: string;
  
  // Resend Configuration (optional - only needed for email)
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
}

const requiredEnvVars: (keyof EnvironmentConfig)[] = [
  'DATABASE_URL',
  'JWT_SECRET',
  'REFRESH_SECRET',
  'INTERNAL_API_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NODE_ENV',
  'PORT'
];

const optionalEnvVars: (keyof EnvironmentConfig)[] = [
  'API_BASE_URL',
  'DEBUG_MODE',
  'ENABLE_NOTIFICATIONS',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL'
];

/**
 * Validates that all required environment variables are present
 * @returns Validated environment configuration
 * @throws Error if required variables are missing
 */
export function validateEnvironment(): EnvironmentConfig {
  const missing: string[] = [];
  const config: Partial<EnvironmentConfig> = {};
  
  // Check required variables
  for (const envVar of requiredEnvVars) {
    const value = process.env[envVar];
    if (!value || value.trim() === '') {
      missing.push(envVar);
    } else {
      config[envVar] = value;
    }
  }
  
  // Add optional variables
  for (const envVar of optionalEnvVars) {
    const value = process.env[envVar];
    if (value) {
      config[envVar] = value;
    }
  }
  
  // Validate NODE_ENV
  if (config.NODE_ENV && !['development', 'DEV', 'DEVELOPMENT', 'production'].includes(config.NODE_ENV)) {
    logger.warn(`NODE_ENV is set to '${config.NODE_ENV}'. Expected: 'development', 'DEV', 'DEVELOPMENT', or 'production'`);
  }
  
  // Set default values for optional variables
  config.DEBUG_MODE = config.DEBUG_MODE || (config.NODE_ENV === 'development' || config.NODE_ENV === 'DEV' ? 'true' : 'false');
  config.ENABLE_NOTIFICATIONS = config.ENABLE_NOTIFICATIONS || 'true';
  config.API_BASE_URL = config.API_BASE_URL || `http://localhost:${config.PORT || '3001'}`;
  
  if (missing.length > 0) {
    const errorMessage = `Missing required environment variables: ${missing.join(', ')}`;
    logger.error('Environment validation failed', { missingVariables: missing });
    
    console.error('\n🚨 ENVIRONMENT CONFIGURATION ERROR 🚨');
    console.error('═'.repeat(50));
    console.error(`Missing required environment variables:`);
    missing.forEach(variable => {
      console.error(`  ❌ ${variable}`);
    });
    console.error('\n💡 To fix this:');
    console.error('  1. Copy env.example to .env');
    console.error('  2. Fill in all required values');
    console.error('  3. Restart the server');
    console.error('═'.repeat(50));
    
    throw new Error(errorMessage);
  }
  
  // Validate JWT secrets length for security
  if (config.JWT_SECRET && config.JWT_SECRET.length < 32) {
    logger.warn('JWT_SECRET is shorter than 32 characters. Consider using a longer secret for better security.');
  }
  
  if (config.REFRESH_SECRET && config.REFRESH_SECRET.length < 32) {
    logger.warn('REFRESH_SECRET is shorter than 32 characters. Consider using a longer secret for better security.');
  }
  
  // Log configuration status
  logger.info('Environment validation successful', {
    nodeEnv: config.NODE_ENV,
    port: config.PORT,
    debugMode: config.DEBUG_MODE,
    enableNotifications: config.ENABLE_NOTIFICATIONS
  });
  
  return config as EnvironmentConfig;
}

/**
 * Gets the validated environment configuration
 * Caches the result to avoid re-validation
 */
let cachedConfig: EnvironmentConfig | null = null;

export function getEnvironmentConfig(): EnvironmentConfig {
  if (!cachedConfig) {
    cachedConfig = validateEnvironment();
  }
  return cachedConfig;
}

/**
 * Type-safe access to environment variables
 */
export const env = {
  get DATABASE_URL() { return getEnvironmentConfig().DATABASE_URL; },
  get JWT_SECRET() { return getEnvironmentConfig().JWT_SECRET; },
  get REFRESH_SECRET() { return getEnvironmentConfig().REFRESH_SECRET; },
  get INTERNAL_API_SECRET() { return getEnvironmentConfig().INTERNAL_API_SECRET; },
  get STRIPE_SECRET_KEY() { return getEnvironmentConfig().STRIPE_SECRET_KEY; },
  get STRIPE_WEBHOOK_SECRET() { return getEnvironmentConfig().STRIPE_WEBHOOK_SECRET; },
  get NODE_ENV() { return getEnvironmentConfig().NODE_ENV; },
  get PORT() { return getEnvironmentConfig().PORT; },
  get API_BASE_URL() { return getEnvironmentConfig().API_BASE_URL; },
  get DEBUG_MODE() { return getEnvironmentConfig().DEBUG_MODE === 'true'; },
  get ENABLE_NOTIFICATIONS() { return getEnvironmentConfig().ENABLE_NOTIFICATIONS === 'true'; },
  
  // Helper methods
  isDevelopment() { return this.NODE_ENV === 'development' || this.NODE_ENV === 'DEV' || this.NODE_ENV === 'DEVELOPMENT'; },
  isProduction() { return this.NODE_ENV === 'production'; }
};
