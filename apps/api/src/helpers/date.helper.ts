/**
 * Date and time formatting helpers for Mexican users
 */

/**
 * Format date to DD/MM/YYYY format for Mexican users
 * @param date - Date object or date string
 * @returns Formatted date string in DD/MM/YYYY format
 */
export function formatDateForMexico(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  // Check if date is valid
  if (isNaN(dateObj.getTime())) {
    return 'Fecha no válida';
  }

  const day = dateObj.getDate().toString().padStart(2, '0');
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const year = dateObj.getFullYear();

  return `${day}/${month}/${year}`;
}

/**
 * Format date with day name for Mexican users
 * @param date - Date object or date string
 * @returns Formatted date string with day name in Spanish
 */
export function formatDateWithDayName(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  // Check if date is valid
  if (isNaN(dateObj.getTime())) {
    return 'Fecha no válida';
  }

  const dayNames = [
    'Domingo', 'Lunes', 'Martes', 'Miércoles', 
    'Jueves', 'Viernes', 'Sábado'
  ];

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const dayName = dayNames[dateObj.getDay()];
  const day = dateObj.getDate();
  const month = monthNames[dateObj.getMonth()];
  const year = dateObj.getFullYear();

  return `${dayName}, ${day} de ${month} de ${year}`;
}

/**
 * Format time from HH:MM format to 12-hour format for Mexican users
 * @param timeSlot - Time in HH:MM format (e.g., "14:30")
 * @returns Formatted time in 12-hour format (e.g., "2:30 PM")
 */
export function formatTimeForMexico(timeSlot: string): string {
  if (!timeSlot || !timeSlot.includes(':')) {
    return timeSlot || 'Hora no válida';
  }

  try {
    const parts = timeSlot.split(':');
    if (parts.length !== 2) {
      return 'Hora no válida';
    }

    const hours = parseInt(parts[0] || '0', 10);
    const minutes = parseInt(parts[1] || '0', 10);
    
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return 'Hora no válida';
    }

    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    const displayMinutes = minutes.toString().padStart(2, '0');

    return `${displayHours}:${displayMinutes} ${period}`;
  } catch (error) {
    return 'Hora no válida';
  }
}

/**
 * Format appointment date and time for display in messages
 * @param appointmentDate - Appointment date from database
 * @param timeSlot - Time slot from database (HH:MM format)
 * @returns Formatted date and time string
 */
export function formatAppointmentDateTime(appointmentDate: string | Date, timeSlot: string): string {
  const formattedDate = formatDateWithDayName(appointmentDate);
  const formattedTime = formatTimeForMexico(timeSlot);
  
  return `${formattedDate} a las ${formattedTime}`;
}

/**
 * Check if a date is today (in CDMX timezone)
 * @param date - Date to check
 * @returns True if the date is today
 */
export function isToday(date: Date | string): boolean {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  
  return dateObj.toDateString() === today.toDateString();
}

/**
 * Get current time in CDMX timezone (America/Mexico_City)
 * @returns Current date in CDMX timezone
 */
export function getCurrentCDMXTime(): Date {
  const now = new Date();
  // Convert to Mexico City timezone
  const mexicoTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
  return mexicoTime;
}

/**
 * Get current time components in Mexico City timezone
 * @returns Object with hours, minutes, and total minutes in Mexico City timezone
 */
export function getCurrentCDMXTimeComponents(): {
  hours: number;
  minutes: number;
  totalMinutes: number;
  date: Date;
} {
  const now = new Date();
  // Get time string in Mexico City timezone
  const mexicoTimeString = now.toLocaleString('en-US', { 
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  const [hours, minutes] = mexicoTimeString.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;
  
  return {
    hours,
    minutes,
    totalMinutes,
    date: now
  };
} 