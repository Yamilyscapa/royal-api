import { ContextLogger } from './logger.js';

// Standard HTTP status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

// Application error codes for better client-side handling
export const ERROR_CODES = {
  // Authentication errors
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_REFRESH_TOKEN_INVALID: 'AUTH_REFRESH_TOKEN_INVALID',
  AUTH_INSUFFICIENT_PERMISSIONS: 'AUTH_INSUFFICIENT_PERMISSIONS',
  
  // User errors
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',
  USER_EMAIL_TAKEN: 'USER_EMAIL_TAKEN',
  USER_PHONE_TAKEN: 'USER_PHONE_TAKEN',
  
  // Appointment errors
  APPOINTMENT_NOT_FOUND: 'APPOINTMENT_NOT_FOUND',
  APPOINTMENT_SLOT_UNAVAILABLE: 'APPOINTMENT_SLOT_UNAVAILABLE',
  APPOINTMENT_PAST_DATE: 'APPOINTMENT_PAST_DATE',
  APPOINTMENT_RESCHEDULE_LIMIT: 'APPOINTMENT_RESCHEDULE_LIMIT',
  APPOINTMENT_ALREADY_CONFIRMED: 'APPOINTMENT_ALREADY_CONFIRMED',
  
  // Service errors
  SERVICE_NOT_FOUND: 'SERVICE_NOT_FOUND',
  SERVICE_INACTIVE: 'SERVICE_INACTIVE',
  
  // Payment errors
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_AMOUNT_INVALID: 'PAYMENT_AMOUNT_INVALID',
  PAYMENT_METHOD_INVALID: 'PAYMENT_METHOD_INVALID',
  STRIPE_ERROR: 'STRIPE_ERROR',
  
  // Schedule errors
  SCHEDULE_NOT_FOUND: 'SCHEDULE_NOT_FOUND',
  SCHEDULE_CONFLICT: 'SCHEDULE_CONFLICT',
  
  // Validation errors
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // System errors
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export interface ErrorDetails {
  code: string;
  message: string;
  statusCode: number;
  details?: any;
  timestamp?: string;
  correlationId?: string;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: any;
  public readonly timestamp: string;
  public readonly correlationId?: string;

  constructor(
    code: string,
    message: string,
    statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    details?: any,
    correlationId?: string
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.correlationId = correlationId;

    // Maintain proper stack trace
    Error.captureStackTrace(this, AppError);
  }

  toJSON(): ErrorDetails {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
      correlationId: this.correlationId,
    };
  }
}

// Pre-defined error creators for common scenarios
export const createError = {
  // Authentication errors
  invalidCredentials: (correlationId?: string) =>
    new AppError(
      ERROR_CODES.AUTH_INVALID_CREDENTIALS,
      'Invalid email or password',
      HTTP_STATUS.UNAUTHORIZED,
      undefined,
      correlationId
    ),

  tokenExpired: (correlationId?: string) =>
    new AppError(
      ERROR_CODES.AUTH_TOKEN_EXPIRED,
      'Authentication token has expired',
      HTTP_STATUS.UNAUTHORIZED,
      undefined,
      correlationId
    ),

  tokenInvalid: (correlationId?: string) =>
    new AppError(
      ERROR_CODES.AUTH_TOKEN_INVALID,
      'Invalid authentication token',
      HTTP_STATUS.UNAUTHORIZED,
      undefined,
      correlationId
    ),

  insufficientPermissions: (correlationId?: string) =>
    new AppError(
      ERROR_CODES.AUTH_INSUFFICIENT_PERMISSIONS,
      'Insufficient permissions to access this resource',
      HTTP_STATUS.FORBIDDEN,
      undefined,
      correlationId
    ),

  // User errors
  userNotFound: (correlationId?: string) =>
    new AppError(
      ERROR_CODES.USER_NOT_FOUND,
      'User not found',
      HTTP_STATUS.NOT_FOUND,
      undefined,
      correlationId
    ),

  userAlreadyExists: (email: string, correlationId?: string) =>
    new AppError(
      ERROR_CODES.USER_ALREADY_EXISTS,
      'User with this email already exists',
      HTTP_STATUS.CONFLICT,
      { email },
      correlationId
    ),

  // Appointment errors
  appointmentNotFound: (correlationId?: string) =>
    new AppError(
      ERROR_CODES.APPOINTMENT_NOT_FOUND,
      'Appointment not found',
      HTTP_STATUS.NOT_FOUND,
      undefined,
      correlationId
    ),

  appointmentSlotUnavailable: (date: string, time: string, correlationId?: string) =>
    new AppError(
      ERROR_CODES.APPOINTMENT_SLOT_UNAVAILABLE,
      'The selected time slot is not available',
      HTTP_STATUS.CONFLICT,
      { date, time },
      correlationId
    ),

  // Payment errors
  paymentFailed: (reason: string, correlationId?: string) =>
    new AppError(
      ERROR_CODES.PAYMENT_FAILED,
      'Payment processing failed',
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      { reason },
      correlationId
    ),

  // Validation errors
  validationFailed: (errors: any[], correlationId?: string) =>
    new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      'Request validation failed',
      HTTP_STATUS.BAD_REQUEST,
      { errors },
      correlationId
    ),

  // Rate limiting
  rateLimitExceeded: (retryAfter?: number, correlationId?: string) =>
    new AppError(
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      'Too many requests. Please try again later.',
      HTTP_STATUS.TOO_MANY_REQUESTS,
      { retryAfter },
      correlationId
    ),

  // System errors
  databaseError: (operation: string, correlationId?: string) =>
    new AppError(
      ERROR_CODES.DATABASE_ERROR,
      'Database operation failed',
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      { operation },
      correlationId
    ),

  internalError: (message: string = 'An internal error occurred', correlationId?: string) =>
    new AppError(
      ERROR_CODES.INTERNAL_ERROR,
      message,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      undefined,
      correlationId
    ),
};

/**
 * Enhanced error handler with proper logging and monitoring
 */
export function handleError(error: Error | AppError, logger?: ContextLogger): ErrorDetails {
  const correlationId = logger ? (logger as any).correlationId : undefined;

  if (error instanceof AppError) {
    // Log application errors appropriately
    if (error.statusCode >= 500) {
      logger?.error('Application error', {
        code: error.code,
        message: error.message,
        details: error.details,
        stack: error.stack,
      });
    } else {
      logger?.warn('Client error', {
        code: error.code,
        message: error.message,
        details: error.details,
      });
    }

    return error.toJSON();
  }

  // Handle unexpected errors
  logger?.error('Unexpected error', {
    message: error.message,
    stack: error.stack,
    name: error.name,
  });

  // Don't expose internal error details in production
  const isDevelopment = process.env.NODE_ENV === 'development' || 
                       process.env.NODE_ENV === 'DEV' || 
                       process.env.NODE_ENV === 'DEVELOPMENT';

  return {
    code: ERROR_CODES.INTERNAL_ERROR,
    message: isDevelopment ? error.message : 'An internal error occurred',
    statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    details: isDevelopment ? { stack: error.stack } : undefined,
    timestamp: new Date().toISOString(),
    correlationId,
  };
}

/**
 * Async error wrapper for consistent error handling
 */
export function asyncErrorHandler<T extends any[], R>(
  fn: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      // Convert unexpected errors to AppError
      throw createError.internalError(
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  };
}