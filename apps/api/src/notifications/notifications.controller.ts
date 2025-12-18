import { getDatabase } from "../db/connection.js";
import { eq, and, gte, lte } from "drizzle-orm";
import { appointments, users, services, payments } from "../db/schema.js";
import { sendPushNotification, generateAppointmentConfirmationNotification, generateAppointmentReminderNotification, generateBarberNotificationPushNotification } from "../helpers/expo-push.helper.js";
import winstonLogger from "../helpers/logger.js";
import { formatAppointmentDateTime } from '../helpers/date.helper.js';

/**
 * Send confirmation message when appointment is confirmed
 */
export async function sendAppointmentConfirmation(appointmentId: string, db?: any): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  try {
    const database = db || await getDatabase();

    // Get appointment with user and service details
    const appointmentData = await database
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
      .where(eq(appointments.id, appointmentId))
      .limit(1);

    if (appointmentData.length === 0) {
      return {
        success: false,
        error: 'Appointment not found'
      };
    }

    const appointment = appointmentData[0];
    
    if (!appointment) {
      return {
        success: false,
        error: 'Appointment not found'
      };
    }

    // Get barber information separately
    const barberData = await database
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName
      })
      .from(users)
      .where(eq(users.id, appointment.barberId))
      .limit(1);

    const barberName = barberData[0] ? `${barberData[0].firstName} ${barberData[0].lastName}`.trim() : 'Barbero';

    // Send push notification if user has push notifications enabled and has a token
    if (appointment.customerExpoPushToken && appointment.customerPushNotificationsEnabled) {
      try {
        const pushNotification = generateAppointmentConfirmationNotification({
          appointmentId: appointment.id,
          serviceName: appointment.serviceName || 'Servicio',
          appointmentDate: formatAppointmentDateTime(appointment.appointmentDate, appointment.timeSlot),
          timeSlot: appointment.timeSlot,
          barberName: barberName,
          customerName: appointment.customerName || 'Cliente'
        });

        const pushResult = await sendPushNotification(appointment.customerExpoPushToken, pushNotification);
        
        if (pushResult.success) {
          winstonLogger.info('Push notification sent successfully', {
            appointmentId,
            messageId: pushResult.messageId
          });
          return {
            success: true,
            messageId: pushResult.messageId
          };
        } else {
          winstonLogger.warn('Push notification failed', {
            appointmentId,
            error: pushResult.error
          });
          return {
            success: false,
            error: pushResult.error
          };
        }
      } catch (pushError) {
        winstonLogger.error('Error sending push notification', {
          appointmentId,
          error: pushError instanceof Error ? pushError.message : 'Unknown error'
        });
        return {
          success: false,
          error: pushError instanceof Error ? pushError.message : 'Unknown error'
        };
      }
    } else {
      winstonLogger.info('Skipping push notification - user has no token or notifications disabled', {
        appointmentId,
        hasToken: !!appointment.customerExpoPushToken,
        pushEnabled: appointment.customerPushNotificationsEnabled
      });
      // Return success even if no notification sent - appointment was still confirmed
      return {
        success: true,
        messageId: undefined
      };
    }

  } catch (error) {
    winstonLogger.error('Error sending appointment confirmation', {
      error: error instanceof Error ? error.message : 'Unknown error',
      appointmentId
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Send reminder message 15 minutes before appointment
 */
export async function sendAppointmentReminder(appointmentId: string): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  try {
    const db = await getDatabase();

    // Get appointment with user and service details
    const appointmentData = await db
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
      .where(eq(appointments.id, appointmentId))
      .limit(1);

    if (appointmentData.length === 0) {
      return {
        success: false,
        error: 'Appointment not found'
      };
    }

    const appointment = appointmentData[0];
    
    if (!appointment) {
      return {
        success: false,
        error: 'Appointment not found'
      };
    }

    // Get barber information separately
    const barberData = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName
      })
      .from(users)
      .where(eq(users.id, appointment.barberId))
      .limit(1);

    const barberName = barberData[0] ? `${barberData[0].firstName} ${barberData[0].lastName}`.trim() : 'Barbero';

    // Send push notification if user has push notifications enabled and has a token
    if (appointment.customerExpoPushToken && appointment.customerPushNotificationsEnabled) {
      try {
        const pushNotification = generateAppointmentReminderNotification({
          appointmentId: appointment.id,
          serviceName: appointment.serviceName || 'Servicio',
          appointmentDate: formatAppointmentDateTime(appointment.appointmentDate, appointment.timeSlot),
          timeSlot: appointment.timeSlot,
          barberName: barberName,
          customerName: appointment.customerName || 'Cliente'
        });

        const pushResult = await sendPushNotification(appointment.customerExpoPushToken, pushNotification);
        
        if (pushResult.success) {
          winstonLogger.info('Push notification reminder sent successfully', {
            appointmentId,
            messageId: pushResult.messageId
          });
          return {
            success: true,
            messageId: pushResult.messageId
          };
        } else {
          winstonLogger.warn('Push notification reminder failed', {
            appointmentId,
            error: pushResult.error
          });
          return {
            success: false,
            error: pushResult.error
          };
        }
      } catch (pushError) {
        winstonLogger.error('Error sending push notification reminder', {
          appointmentId,
          error: pushError instanceof Error ? pushError.message : 'Unknown error'
        });
        return {
          success: false,
          error: pushError instanceof Error ? pushError.message : 'Unknown error'
        };
      }
    } else {
      winstonLogger.info('Skipping push notification reminder - user has no token or notifications disabled', {
        appointmentId,
        hasToken: !!appointment.customerExpoPushToken,
        pushEnabled: appointment.customerPushNotificationsEnabled
      });
      return {
        success: true,
        messageId: undefined
      };
    }

  } catch (error) {
    winstonLogger.error('Error sending appointment reminder', {
      error: error instanceof Error ? error.message : 'Unknown error',
      appointmentId
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check for upcoming appointments and send reminders
 * This function should be called by a cron job every minute
 */
export async function checkAndSendReminders(): Promise<{
  success: boolean;
  remindersSent: number;
  errors: string[];
}> {
  try {
    const db = await getDatabase();
    const now = new Date();
    const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60 * 1000);

    winstonLogger.info('Checking for appointments in next 15 minutes', {
      now: now.toISOString(),
      fifteenMinutesFromNow: fifteenMinutesFromNow.toISOString()
    });

    // Get appointments that are confirmed and scheduled in the next 15 minutes
    const upcomingAppointments = await db
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
        barberName: users.firstName,
        barberLastName: users.lastName,
        serviceName: services.name
      })
      .from(appointments)
      .leftJoin(users, eq(appointments.userId, users.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .where(
        and(
          eq(appointments.status, 'confirmed'),
          gte(appointments.appointmentDate, now),
          lte(appointments.appointmentDate, fifteenMinutesFromNow)
        )
      );

    winstonLogger.info(`Found ${upcomingAppointments.length} appointments in next 15 minutes`);

    let remindersSent = 0;
    const errors: string[] = [];

    // Send reminders for each appointment
    for (const appointment of upcomingAppointments) {
      const result = await sendAppointmentReminder(appointment.id);
      
      if (result.success) {
        remindersSent++;
        winstonLogger.info(`Reminder sent for appointment ${appointment.id}`);
      } else {
        errors.push(`Appointment ${appointment.id}: ${result.error}`);
      }
    }

    winstonLogger.info('Reminder check completed', {
      totalAppointments: upcomingAppointments.length,
      remindersSent,
      errors: errors.length
    });

    return {
      success: true,
      remindersSent,
      errors
    };

  } catch (error) {
    winstonLogger.error('Error checking and sending reminders', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return {
      success: false,
      remindersSent: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

/**
 * Send barber notification when appointment is booked
 * Uses push notification to notify the barber
 */
export async function sendBarberNotification(appointmentId: string, db?: any): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  try {
    const database = db || await getDatabase();

    // Get appointment with user and service details
    const appointmentData = await database
      .select({
        id: appointments.id,
        userId: appointments.userId,
        barberId: appointments.barberId,
        serviceId: appointments.serviceId,
        appointmentDate: appointments.appointmentDate,
        timeSlot: appointments.timeSlot,
        status: appointments.status,
        customerPhone: users.phone,
        customerName: users.firstName,
        customerLastName: users.lastName,
        serviceName: services.name,
        servicePrice: services.price,
        paymentAmount: payments.amount
      })
      .from(appointments)
      .leftJoin(users, eq(appointments.userId, users.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .leftJoin(payments, eq(appointments.id, payments.appointmentId))
      .where(eq(appointments.id, appointmentId))
      .limit(1);

    if (appointmentData.length === 0) {
      return {
        success: false,
        error: 'Appointment not found'
      };
    }

    const appointment = appointmentData[0];
    
    if (!appointment) {
      return {
        success: false,
        error: 'Appointment not found'
      };
    }

    // Get barber information including push token
    const barberData = await database
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        expoPushToken: users.expoPushToken,
        pushNotificationsEnabled: users.pushNotificationsEnabled
      })
      .from(users)
      .where(eq(users.id, appointment.barberId))
      .limit(1);

    if (barberData.length === 0) {
      return {
        success: false,
        error: 'Barber not found'
      };
    }

    const barber = barberData[0];

    // Send push notification to barber if they have a token and notifications enabled
    if (barber.expoPushToken && barber.pushNotificationsEnabled) {
      try {
        const pushNotification = generateBarberNotificationPushNotification({
          customerName: appointment.customerName || 'Cliente',
          customerLastName: appointment.customerLastName || '',
          serviceName: appointment.serviceName || 'Servicio',
          appointmentDate: formatAppointmentDateTime(appointment.appointmentDate, appointment.timeSlot),
          timeSlot: appointment.timeSlot,
          customerPhone: appointment.customerPhone || 'N/A',
          paymentAmount: appointment.paymentAmount || appointment.servicePrice || undefined
        });

        const pushResult = await sendPushNotification(barber.expoPushToken, pushNotification);

        if (pushResult.success) {
          winstonLogger.info('Barber push notification sent successfully', {
            appointmentId,
            barberId: barber.id,
            messageId: pushResult.messageId
          });
          return {
            success: true,
            messageId: pushResult.messageId
          };
        } else {
          winstonLogger.warn('Barber push notification failed', {
            appointmentId,
            barberId: barber.id,
            error: pushResult.error
          });
          return {
            success: false,
            error: pushResult.error
          };
        }
      } catch (pushError) {
        winstonLogger.error('Error sending barber push notification', {
          appointmentId,
          barberId: barber.id,
          error: pushError instanceof Error ? pushError.message : 'Unknown error'
        });
        return {
          success: false,
          error: pushError instanceof Error ? pushError.message : 'Unknown error'
        };
      }
    } else {
      winstonLogger.info('Skipping barber notification - barber has no push token or notifications disabled', {
        appointmentId,
        barberId: barber.id,
        hasToken: !!barber.expoPushToken,
        pushEnabled: barber.pushNotificationsEnabled
      });
      // Return success - barber just doesn't have notifications enabled
      return {
        success: true,
        messageId: undefined
      };
    }

  } catch (error) {
    winstonLogger.error('Error sending barber notification', {
      error: error instanceof Error ? error.message : 'Unknown error',
      appointmentId
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
