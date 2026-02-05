import type { Context } from 'hono';
import { getDatabase } from "../db/connection.js";
import { schedules, appointments, users } from "../db/schema.js";
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import type { 
  Schedule, 
  CreateScheduleRequest, 
  UpdateScheduleRequest, 
  ScheduleAvailability,
  GetAvailabilityRequest,
  TimeSlot,
  DayOfWeek
} from './schedules.d.js';
import { successResponse, errorResponse } from '../helpers/response.helper.js';
import { getCurrentCDMXTimeComponents } from '../helpers/date.helper.js';

// Helper function to get day of week from date
function getDayOfWeek(date: Date): DayOfWeek {
  const days: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[date.getDay()] || 'monday'; // fallback to monday if undefined
}

// Create or update a schedule for a barber
export async function setBarberSchedule(barberId: string, dayOfWeek: DayOfWeek, availableTimeSlots: TimeSlot[]) {
  const res = {
    data: null as Schedule | null,
    error: null as string | null,
  };

  try {
    const db = await getDatabase();

    // Validate barber exists and is staff
    const barber = await db.select().from(users).where(eq(users.id, barberId)).limit(1);
    if (barber.length === 0) {
      res.error = 'Barber not found';
      return res;
    }

    if (barber[0]?.role !== 'staff') {
      res.error = 'User is not a barber';
      return res;
    }

    // Check if schedule already exists for this barber and day
    const existingSchedule = await db
      .select()
      .from(schedules)
      .where(and(eq(schedules.barberId, barberId), eq(schedules.dayOfWeek, dayOfWeek)))
      .limit(1);

    let result;
    if (existingSchedule.length > 0 && existingSchedule[0]?.id) {
      // Update existing schedule
      result = await db
        .update(schedules)
        .set({
          availableTimeSlots,
          updatedAt: new Date()
        })
        .where(eq(schedules.id, existingSchedule[0].id))
        .returning();
    } else {
      // Create new schedule
      result = await db.insert(schedules).values({
        barberId,
        dayOfWeek,
        availableTimeSlots,
        isActive: true
      }).returning();
    }

    if (!result[0]) {
      res.error = 'Failed to set schedule';
      return res;
    }
    
    res.data = result[0] as Schedule;
    return res;
  } catch (error) {
    console.error('Error setting barber schedule:', error);
    res.error = 'Internal server error';
    return res;
  }
}

// Get all schedules for a barber
export async function getBarberSchedules(barberId: string) {
  const res = {
    data: null as Schedule[] | null,
    error: null as string | null,
  };

  try {
    const db = await getDatabase();

    const barberSchedules = await db
      .select()
      .from(schedules)
      .where(eq(schedules.barberId, barberId))
      .orderBy(schedules.dayOfWeek);

    res.data = barberSchedules as Schedule[];
    return res;
  } catch (error) {
    console.error('Error fetching barber schedules:', error);
    res.error = 'Internal server error';
    return res;
  }
}

// Check if a barber has any schedules
export async function hasBarberSchedules(barberId: string): Promise<boolean> {
  try {
    const db = await getDatabase();

    const barberSchedules = await db
      .select()
      .from(schedules)
      .where(eq(schedules.barberId, barberId))
      .limit(1);

    return barberSchedules.length > 0;
  } catch (error) {
    console.error('Error checking barber schedules:', error);
    return false;
  }
}

// Get availability for a specific date
export async function getAvailability(barberId: string, date: string) {
  const res = {
    data: null as ScheduleAvailability | null,
    error: null as string | null,
  };

  try {
    const db = await getDatabase();

    // Validate barber exists
    const barber = await db.select().from(users).where(eq(users.id, barberId)).limit(1);
    if (barber.length === 0) {
      res.error = 'Barbero no encontrado';
      return res;
    }

    // Convert dd/mm/yyyy to Date object
    const dateParts = date.split('/');
    if (dateParts.length !== 3) {
      res.error = 'Formato de fecha inválido. Se espera dd/mm/yyyy';
      return res;
    }
    
    const [day, month, year] = dateParts;
    if (!day || !month || !year) {
      res.error = 'Formato de fecha inválido. Se espera dd/mm/yyyy';
      return res;
    }
    
    const targetDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    
    // Check if date is valid
    if (isNaN(targetDate.getTime())) {
      res.error = 'Fecha inválida';
      return res;
    }
    
    // Check if date is in the past (using Mexico City timezone)
    const mexicoTimeComponents = getCurrentCDMXTimeComponents();
    const now = mexicoTimeComponents.date;
    // Create today's date in Mexico City timezone
    const mexicoDateString = now.toLocaleString('en-US', { 
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const mexicoDateParts = mexicoDateString.split('/');
    if (mexicoDateParts.length !== 3) {
      res.error = 'Error al obtener la fecha actual';
      return res;
    }
    const mexicoMonth = parseInt(mexicoDateParts[0] || '1', 10);
    const mexicoDay = parseInt(mexicoDateParts[1] || '1', 10);
    const mexicoYear = parseInt(mexicoDateParts[2] || '2000', 10);
    const today = new Date(mexicoYear, mexicoMonth - 1, mexicoDay);
    if (targetDate < today) {
      res.error = 'No se pueden consultar horarios para fechas pasadas';
      return res;
    }
    
    const dayOfWeek = getDayOfWeek(targetDate);

    // Debug logs
    console.log('[getAvailability] targetDate:', targetDate, 'dayOfWeek:', dayOfWeek);

    // Get the barber's schedule for that day
    const schedule = await db
      .select()
      .from(schedules)
      .where(and(eq(schedules.barberId, barberId), eq(schedules.dayOfWeek, dayOfWeek)))
      .limit(1);

    console.log('[getAvailability] schedule for', dayOfWeek, ':', schedule);

    if (schedule.length === 0) {
      const availability: ScheduleAvailability = {
        barberId,
        dayOfWeek,
        date,
        availableSlots: [],
        bookedSlots: []
      };
      res.data = availability;
      return res;
    }

    // Get all appointments for that barber on that date
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const appointmentsList = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.barberId, barberId),
          gte(appointments.appointmentDate, startOfDay),
          lte(appointments.appointmentDate, endOfDay)
        )
      );

    // Normalize function
    function normalizeSlot(slot: string) {
      if (/^\d{1,2}$/.test(slot)) {
        return (slot.padStart(2, '0') + ':00') as TimeSlot;
      }
      if (/^\d{1,2}:\d{1,2}$/.test(slot)) {
        const [h, m] = slot.split(':');
        if (!h || !m) return slot as TimeSlot;
        return (h.padStart(2, '0') + ':' + m.padEnd(2, '0')) as TimeSlot;
      }
      return slot as TimeSlot;
    }

    // Get booked time slots and normalize them
    // Only exclude cancelled appointments - all others (pending, confirmed, completed) are considered booked
    const bookedSlots = appointmentsList
      .filter(apt => apt.status !== 'cancelled')
      .map(apt => normalizeSlot(apt.timeSlot));

    console.log('[getAvailability] Found appointments:', appointmentsList.map(apt => ({
      id: apt.id,
      timeSlot: apt.timeSlot,
      status: apt.status,
      date: apt.appointmentDate
    })));
    console.log('[getAvailability] Booked slots after filtering:', bookedSlots);

    // Get available slots from schedule and normalize them
    const scheduleAvailableSlots = (schedule[0]?.availableTimeSlots || []).map(normalizeSlot);

    // Calculate available slots (filter out booked ones)
    let availableSlots = scheduleAvailableSlots.filter(
      slot => !bookedSlots.includes(slot)
    ) as TimeSlot[];

    // Don't filter past slots in backend - let frontend handle it based on device timezone
    // This ensures compatibility with frontend's existing filtering logic
    // Backend only filters out booked slots, frontend will filter past times
    // Note: Frontend uses > (not >=) and has 30min buffer in AppointmentDatePicker
    // So backend sends all available slots and frontend filters them

    console.log('[getAvailability] Schedule available slots:', scheduleAvailableSlots);
    console.log('[getAvailability] Final available slots (before frontend filtering):', availableSlots);
    console.log('[getAvailability] Slots count:', availableSlots.length);
    console.log('[getAvailability] Slots include 19:00:', availableSlots.includes('19:00'));
    console.log('[getAvailability] Slots include 20:00:', availableSlots.includes('20:00'));

    const availability: ScheduleAvailability = {
      barberId,
      dayOfWeek,
      date,
      availableSlots,
      bookedSlots
    };

    res.data = availability;
    return res;
  } catch (error) {
    console.error('Error getting availability:', error);
    res.error = 'Error interno del servidor. Por favor, intenta nuevamente más tarde.';
    return res;
  }
}

// Get all schedules
export async function getAllSchedules() {
  const res = {
    data: null as any[] | null,
    error: null as string | null,
  };

  try {
    const db = await getDatabase();
    
    const allSchedules = await db
      .select({
        id: schedules.id,
        barberId: schedules.barberId,
        dayOfWeek: schedules.dayOfWeek,
        availableTimeSlots: schedules.availableTimeSlots,
        isActive: schedules.isActive,
        createdAt: schedules.createdAt,
        updatedAt: schedules.updatedAt,
        barber: {
          id: users.id,
          name: sql`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
          email: users.email,
        }
      })
      .from(schedules)
      .leftJoin(users, eq(schedules.barberId, users.id))
      .orderBy(schedules.barberId, schedules.dayOfWeek);

    res.data = allSchedules;
    return res;
  } catch (error) {
    console.error('Error fetching all schedules:', error);
    res.error = 'Internal server error';
    return res;
  }
}

// Check if a time slot is available for booking
export async function isTimeSlotAvailable(barberId: string, date: string, timeSlot: TimeSlot, excludeAppointmentId?: string): Promise<boolean> {
  try {
    const db = await getDatabase();
    
    // Convert dd/mm/yyyy to Date object
    const dateParts = date.split('/');
    if (dateParts.length !== 3) {
      return false;
    }
    
    const [day, month, year] = dateParts;
    if (!day || !month || !year) {
      return false;
    }
    
    const targetDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const dayOfWeek = getDayOfWeek(targetDate);
    
    console.log(`[isTimeSlotAvailable] Date parsing:`, {
      inputDate: date,
      parsedParts: { day, month, year },
      targetDate: targetDate.toISOString(),
      dayOfWeek,
      barberId,
      timeSlot
    });

    // Normalize timeSlot to 'HH:00' format
    let normalizedTimeSlot = timeSlot;
    if (/^\d{1,2}$/.test(timeSlot)) {
      normalizedTimeSlot = (`${timeSlot.padStart(2, '0')}:00`) as TimeSlot;
    }

    // Get the barber's schedule for that day
    const schedule = await db
      .select()
      .from(schedules)
      .where(and(eq(schedules.barberId, barberId), eq(schedules.dayOfWeek, dayOfWeek)))
      .limit(1);

    if (schedule.length === 0) {
      console.log('[isTimeSlotAvailable] No schedule for this day', { barberId, dayOfWeek });
      return false; // No schedule for this day
    }

    // Check if the time slot is in the available slots
    const availableSlots = schedule[0]?.availableTimeSlots || [];
    console.log('[isTimeSlotAvailable] Params', { barberId, date, timeSlot, normalizedTimeSlot });
    console.log('[isTimeSlotAvailable] availableSlots', availableSlots);
    if (!availableSlots.includes(normalizedTimeSlot)) {
      console.log('[isTimeSlotAvailable] Slot not in availableSlots', { normalizedTimeSlot, availableSlots });
      return false; // Time slot not available in schedule
    }

    // Check if the time slot is already booked
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingAppointment = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.barberId, barberId),
          eq(appointments.timeSlot, normalizedTimeSlot),
          gte(appointments.appointmentDate, startOfDay),
          lte(appointments.appointmentDate, endOfDay),
          sql`${appointments.status} != 'cancelled'`, // Only exclude cancelled appointments
          excludeAppointmentId ? sql`${appointments.id} != ${excludeAppointmentId}` : sql`1=1`
        )
      )
      .limit(1);
    
    console.log('[isTimeSlotAvailable] existingAppointment', { 
      normalizedTimeSlot, 
      found: existingAppointment.length > 0, 
      appointment: existingAppointment[0] ? {
        id: existingAppointment[0].id,
        status: existingAppointment[0].status,
        timeSlot: existingAppointment[0].timeSlot,
        date: existingAppointment[0].appointmentDate
      } : null 
    });
    
    return existingAppointment.length === 0; // Available if no existing appointment
  } catch (error) {
    console.error('Error checking time slot availability:', error);
    return false;
  }
}

// Update a schedule
export async function updateSchedule(scheduleId: string, updateData: Partial<Schedule>) {
  const res = {
    data: null as Schedule | null,
    error: null as string | null,
  };

  try {
    const db = await getDatabase();
    
    // Check if schedule exists
    const existingSchedule = await db.select().from(schedules).where(eq(schedules.id, scheduleId)).limit(1);
    if (existingSchedule.length === 0) {
      res.error = 'Schedule not found';
      return res;
    }

    const [updatedSchedule] = await db
      .update(schedules)
      .set({
        ...updateData,
        updatedAt: new Date()
      })
      .where(eq(schedules.id, scheduleId))
      .returning();

    if (!updatedSchedule) {
      res.error = 'Failed to update schedule';
      return res;
    }

    res.data = updatedSchedule as Schedule;
    return res;
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.error = 'Internal server error';
    return res;
  }
}

// Delete a schedule
export async function deleteSchedule(scheduleId: string) {
  const res = {
    data: null as Schedule | null,
    error: null as string | null,
  };

  try {
    const db = await getDatabase();
    
    // Check if schedule exists
    const existingSchedule = await db.select().from(schedules).where(eq(schedules.id, scheduleId)).limit(1);
    if (existingSchedule.length === 0) {
      res.error = 'Schedule not found';
      return res;
    }

    await db.delete(schedules).where(eq(schedules.id, scheduleId));
    
    res.data = existingSchedule[0] as Schedule; // Return the deleted schedule data
    return res;
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.error = 'Internal server error';
    return res;
  }
} 