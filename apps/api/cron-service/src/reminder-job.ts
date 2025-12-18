import { getDatabase } from './db/connection.js';
import { eq } from 'drizzle-orm';
import { appointments, users, services } from './db/schema.js';
import { 
  sendPushNotification, 
  generateAppointmentReminderNotification 
} from './helpers/expo-push.helper.js';
import winstonLogger from './helpers/logger.js';
import { formatAppointmentDateTime } from './helpers/date.helper.js';

/**
 * Convert 24-hour time format to 12-hour format with AM/PM
 * @param timeSlot - Time in "HH:MM" or "H:MM" format (e.g., "18:00", "9:30")
 * @returns Time in 12-hour format (e.g., "6:00 PM", "9:30 AM")
 */
function formatTime12Hour(timeSlot: string): string {
  const [hoursStr, minutes] = timeSlot.split(':');
  let hours = parseInt(hoursStr, 10);
  
  if (isNaN(hours) || !minutes) {
    return timeSlot; // Return original if invalid
  }
  
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12; // Convert 0 to 12, and 13-23 to 1-11
  
  return `${hours}:${minutes} ${period}`;
}

/**
 * Calculate time remaining until appointment and format it in Spanish
 * @param appointmentDate - The appointment date
 * @param timeSlot - Time in "HH:MM" format
 * @param now - Current time
 * @returns Formatted time remaining (e.g., "15 min", "5 min", "menos de 1 min")
 */
function getTimeRemaining(appointmentDate: Date, timeSlot: string, now: Date): string {
  const timeParts = timeSlot.split(':');
  const hours = parseInt(timeParts[0], 10);
  const minutes = parseInt(timeParts[1], 10);
  
  const dateStr = appointmentDate.toISOString().split('T')[0];
  const [year, month, day] = dateStr.split('-').map(Number);
  const appointmentDateTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
  
  const diffMs = appointmentDateTime.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  
  if (diffMinutes <= 0) {
    return 'ahora';
  } else if (diffMinutes < 1) {
    return 'menos de 1 min';
  } else {
    return `${diffMinutes} min`;
  }
}

/**
 * Check for upcoming appointments and send reminders to both barbers and clients
 * This function should be called by a cron job every 15 minutes
 */
export async function checkAndSendReminders(): Promise<{
  success: boolean;
  remindersSent: number;
  errors: string[];
}> {
  try {
    const db = await getDatabase();
    const now = new Date();
    
    // Match appointments happening in the next 20 minutes or less
    const targetTimeStart = new Date(now.getTime()); // Now
    const targetTimeEnd = new Date(now.getTime() + 20 * 60 * 1000); // 20 minutes from now

    winstonLogger.info('Checking for appointments in reminder window', {
      now: now.toISOString(),
      targetWindowStart: targetTimeStart.toISOString(),
      targetWindowEnd: targetTimeEnd.toISOString()
    });

    // Strategy: 
    // 1. Fetch all confirmed appointments (the date filter happens in JS due to timezone complexity)
    // 2. In JS, combine appointmentDate + timeSlot to get the actual Date object
    // 3. Check if that Date is in our target window
    
    // Fetch confirmed appointments with customer and service data
    const potentialAppointments = await db
      .select({
        id: appointments.id,
        userId: appointments.userId,
        barberId: appointments.barberId,
        serviceId: appointments.serviceId,
        appointmentDate: appointments.appointmentDate,
        timeSlot: appointments.timeSlot,
        status: appointments.status,
        customerName: users.firstName,
        customerLastName: users.lastName,
        customerExpoPushToken: users.expoPushToken,
        customerPushNotificationsEnabled: users.pushNotificationsEnabled,
        serviceName: services.name
      })
      .from(appointments)
      .leftJoin(users, eq(appointments.userId, users.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .where(eq(appointments.status, 'confirmed'));

    winstonLogger.info(`Found ${potentialAppointments.length} potential appointments in date range`);
    
    // Filter appointments that are within 20 minutes or less by combining date + time
    const upcomingAppointments = potentialAppointments.filter(app => {
      // Parse timeSlot "HH:MM" or "H:MM" format
      const timeParts = app.timeSlot.split(':');
      if (timeParts.length !== 2) {
        winstonLogger.warn(`Invalid timeSlot format for appointment ${app.id}: ${app.timeSlot}`);
        return false;
      }

      const hours = parseInt(timeParts[0], 10);
      const minutes = parseInt(timeParts[1], 10);

      if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        winstonLogger.warn(`Invalid timeSlot values for appointment ${app.id}: ${app.timeSlot}`);
        return false;
      }

      // IMPORTANT: appointmentDate is stored as UTC midnight (e.g., 2025-12-17T00:00:00.000Z)
      // We need to extract the date parts and create a new Date with local time
      const dateStr = app.appointmentDate.toISOString().split('T')[0]; // "2025-12-17"
      const [year, month, day] = dateStr.split('-').map(Number);
      
      // Create appointment datetime in local timezone
      const appointmentDateTime = new Date(year, month - 1, day, hours, minutes, 0, 0);

      // Check if the appointment is in our target window (next 20 minutes or less)
      const isInWindow = appointmentDateTime >= targetTimeStart && appointmentDateTime <= targetTimeEnd;
      
      winstonLogger.debug(`Appointment ${app.id} check`, {
        appointmentDateTime: appointmentDateTime.toISOString(),
        timeSlot: app.timeSlot,
        dateStr,
        isInWindow,
        nowTime: now.toISOString()
      });

      return isInWindow;
    });

    winstonLogger.info(`Found ${upcomingAppointments.length} appointments for reminders (from ${potentialAppointments.length} candidates)`);

    let remindersSent = 0;
    const errors: string[] = [];

    // Process each appointment
    for (const appointment of upcomingAppointments) {
      try {
        // Fetch barber details
        const barberData = await db
          .select({
            firstName: users.firstName,
            lastName: users.lastName,
            expoPushToken: users.expoPushToken,
            pushNotificationsEnabled: users.pushNotificationsEnabled
          })
          .from(users)
          .where(eq(users.id, appointment.barberId))
          .limit(1);

        const barber = barberData[0];
        const barberName = barber ? `${barber.firstName || ''} ${barber.lastName || ''}`.trim() || 'Tu Barbero' : 'Tu Barbero';
        const customerName = `${appointment.customerName || ''} ${appointment.customerLastName || ''}`.trim() || 'Cliente';
        const serviceName = appointment.serviceName || 'Servicio';

        const commonNotificationData = {
          appointmentId: appointment.id,
          serviceName: serviceName,
          appointmentDate: formatAppointmentDateTime(appointment.appointmentDate, appointment.timeSlot),
          timeSlot: appointment.timeSlot,
          barberName,
          customerName
        };

        // 1. Send Client Notification
        if (
          appointment.customerExpoPushToken && 
          appointment.customerPushNotificationsEnabled
        ) {
          try {
            const clientNotification = generateAppointmentReminderNotification(commonNotificationData);
            
            const clientResult = await sendPushNotification(
              appointment.customerExpoPushToken, 
              clientNotification
            );

            if (clientResult.success) {
              remindersSent++;
              winstonLogger.info(`✅ Client reminder sent for appointment ${appointment.id}`, {
                appointmentId: appointment.id,
                customerName,
                timeSlot: appointment.timeSlot
              });
            } else {
              const errorMsg = clientResult.error || 'Unknown error';
              errors.push(`Client reminder failed for appointment ${appointment.id}: ${errorMsg}`);
              winstonLogger.warn(`❌ Failed to send client reminder for appointment ${appointment.id}`, {
                error: errorMsg,
                appointmentId: appointment.id
              });
            }
          } catch (clientErr) {
            const errorMsg = clientErr instanceof Error ? clientErr.message : 'Unknown error';
            errors.push(`Client reminder error for appointment ${appointment.id}: ${errorMsg}`);
            winstonLogger.error(`Error sending client reminder for appointment ${appointment.id}`, { 
              error: errorMsg,
              appointmentId: appointment.id
            });
          }
        } else {
          winstonLogger.debug(`⏭️ Skipping client reminder for appointment ${appointment.id}: No token or disabled`, {
            hasToken: !!appointment.customerExpoPushToken,
            notificationsEnabled: appointment.customerPushNotificationsEnabled
          });
        }

        // 2. Send Barber Notification
        if (
          barber && 
          barber.expoPushToken && 
          barber.pushNotificationsEnabled
        ) {
          try {
            const barberNotification = {
              title: '⏰ Próxima Cita',
              body: `Tienes una cita en ${getTimeRemaining(appointment.appointmentDate, appointment.timeSlot, now)} con ${customerName} para ${serviceName} a las ${formatTime12Hour(appointment.timeSlot)}.`,
              data: {
                type: 'barber_appointment_reminder',
                appointmentId: appointment.id,
                timeSlot: appointment.timeSlot,
                serviceName: serviceName,
                customerName: customerName
              },
              sound: 'default' as const,
              badge: 1,
              channelId: 'default'
            };

            const barberResult = await sendPushNotification(
              barber.expoPushToken, 
              barberNotification
            );

            if (barberResult.success) {
              remindersSent++;
              winstonLogger.info(`✅ Barber reminder sent for appointment ${appointment.id}`, {
                appointmentId: appointment.id,
                barberName,
                customerName,
                timeSlot: appointment.timeSlot
              });
            } else {
              const errorMsg = barberResult.error || 'Unknown error';
              errors.push(`Barber reminder failed for appointment ${appointment.id}: ${errorMsg}`);
              winstonLogger.warn(`❌ Failed to send barber reminder for appointment ${appointment.id}`, {
                error: errorMsg,
                appointmentId: appointment.id
              });
            }
          } catch (barberErr) {
            const errorMsg = barberErr instanceof Error ? barberErr.message : 'Unknown error';
            errors.push(`Barber reminder error for appointment ${appointment.id}: ${errorMsg}`);
            winstonLogger.error(`Error sending barber reminder for appointment ${appointment.id}`, { 
              error: errorMsg,
              appointmentId: appointment.id
            });
          }
        } else {
          winstonLogger.debug(`⏭️ Skipping barber reminder for appointment ${appointment.id}: No token or disabled`, {
            hasBarber: !!barber,
            hasToken: barber ? !!barber.expoPushToken : false,
            notificationsEnabled: barber ? barber.pushNotificationsEnabled : false
          });
        }

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`Error processing appointment ${appointment.id}: ${errorMsg}`);
        winstonLogger.error(`❌ Error processing reminder for appointment ${appointment.id}`, { 
          error: errorMsg,
          appointmentId: appointment.id
        });
      }
    }

    winstonLogger.info('Reminder check completed', {
      totalAppointments: upcomingAppointments.length,
      remindersSent,
      errorsCount: errors.length,
      errors: errors.length > 0 ? errors : undefined
    });

    return {
      success: true,
      remindersSent,
      errors
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    winstonLogger.error('❌ Error checking and sending reminders', {
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined
    });

    return {
      success: false,
      remindersSent: 0,
      errors: [errorMsg]
    };
  }
}
