import { z } from 'zod';
import { formatPhoneNumber } from './phone.helper.js';

// Base schemas
export const emailSchema = z.string()
  .email('Invalid email format')
  .min(1, 'Email is required')
  .max(255, 'Email too long')
  .toLowerCase();

export const passwordSchema = z.string()
  .min(6, 'Password must be at least 6 characters')
  .max(128, 'Password too long')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number');

// Phone schema with E.164 format validation
export const phoneSchema = z.string()
  .min(1, 'Phone number is required')
  .max(20, 'Phone number too long')
  .transform((val) => {
    const result = formatPhoneNumber(val);
    if (!result.isValid) {
      throw new Error(result.error || 'Invalid phone number format');
    }
    return result.formatted;
  })
  .refine((val) => {
    const result = formatPhoneNumber(val);
    return result.isValid;
  }, {
    message: 'Phone number must be in international format (e.g., +1234567890)'
  });

// User schemas
export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string()
    .min(1, 'First name is required')
    .max(50, 'First name too long')
    .regex(/^[a-zA-Z\s]+$/, 'First name can only contain letters and spaces'),
  lastName: z.string()
    .min(1, 'Last name is required')
    .max(50, 'Last name too long')
    .regex(/^[a-zA-Z\s]+$/, 'Last name can only contain letters and spaces'),
  phone: phoneSchema,
  role: z.enum(['customer', 'staff', 'admin'], {
    errorMap: () => ({ message: 'Role must be customer, staff, or admin' })
  })
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required')
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

// Password Reset schemas
export const requestPasswordResetSchema = z.object({
  email: emailSchema
});

export const verifyResetTokenSchema = z.object({
  token: z.string().min(1, 'Token is required')
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: passwordSchema
});

// Service schemas
export const createServiceSchema = z.object({
  name: z.string()
    .min(1, 'Service name is required')
    .max(100, 'Service name too long')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Service name can only contain letters, numbers, spaces, hyphens, and underscores'),
  description: z.string()
    .max(500, 'Description too long')
    .optional(),
  price: z.number()
    .positive('Price must be positive')
    .max(10000, 'Price too high')
    .multipleOf(0.01, 'Price must have at most 2 decimal places'),
  duration: z.number()
    .int('Duration must be a whole number')
    .positive('Duration must be positive')
    .max(480, 'Duration too long (max 8 hours)')
    .min(15, 'Duration too short (min 15 minutes)')
});

// Schedule schemas
export const dayOfWeekSchema = z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
export const timeSlotSchema = z.enum([
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', 
  '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'
]);

export const createScheduleSchema = z.object({
  barberId: z.string().min(1, 'Barber ID is required'),
  dayOfWeek: dayOfWeekSchema,
  availableTimeSlots: z.array(timeSlotSchema).min(1, 'At least one time slot is required')
});

export const updateScheduleSchema = z.object({
  availableTimeSlots: z.array(timeSlotSchema).optional(),
  isActive: z.boolean().optional()
});

export const getAvailabilitySchema = z.object({
  barberId: z.string().min(1, 'Barber ID is required'),
  date: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, 'Date must be in dd/mm/yyyy format')
});

// Appointment schemas
export const createAppointmentSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  barberId: z.string().min(1, 'Barber ID is required'),
  serviceId: z.string().min(1, 'Service ID is required'),
  appointmentDate: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, 'Date must be in dd/mm/yyyy format'),
  timeSlot: timeSlotSchema,
  notes: z.string().max(500, 'Notes too long').optional()
});

export const updateAppointmentStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed'], {
    errorMap: () => ({ message: 'Status must be pending, confirmed, cancelled, or completed' })
  })
});

// Date validation helper
export const validateDateFormat = (date: string): boolean => {
  const regex = /^\d{2}\/\d{2}\/\d{4}$/;
  if (!regex.test(date)) return false;
  
  const parts = date.split('/').map(Number);
  if (parts.length !== 3) return false;
  
  const [day, month, year] = parts;
  if (!day || !month || !year) return false;
  
  const dateObj = new Date(year, month - 1, day);
  
  return dateObj.getDate() === day && 
         dateObj.getMonth() === month - 1 && 
         dateObj.getFullYear() === year;
};

// Custom date schema
export const dateSchema = z.string().refine(validateDateFormat, {
  message: 'Invalid date format. Use dd/mm/yyyy'
});

// Pagination schema
export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20)
});

// Search schema
export const searchSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(100, 'Search query too long')
});

// Export all schemas
export const schemas = {
  createUser: createUserSchema,
  login: loginSchema,
  refreshToken: refreshTokenSchema,
  requestPasswordReset: requestPasswordResetSchema,
  verifyResetToken: verifyResetTokenSchema,
  resetPassword: resetPasswordSchema,
  createService: createServiceSchema,
  createSchedule: createScheduleSchema,
  updateSchedule: updateScheduleSchema,
  getAvailability: getAvailabilitySchema,
  createAppointment: createAppointmentSchema,
  updateAppointmentStatus: updateAppointmentStatusSchema,
  pagination: paginationSchema,
  search: searchSchema
};
