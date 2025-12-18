import { Hono } from 'hono';
import { sendAppointmentConfirmation, sendAppointmentReminder, checkAndSendReminders, sendBarberNotification } from './notifications.controller.js';
import { successResponse, errorResponse } from '../helpers/response.helper.js';
import { sendPushNotification, generateBarberNotificationPushNotification } from '../helpers/expo-push.helper.js';
import cronService from '../services/cron.service.js';
import { getDatabase } from '../db/connection.js';
import { appointments, users, services } from '../db/schema.js';

const notificationsRoute = new Hono();

// Send confirmation message for a specific appointment
notificationsRoute.post('/confirm/:appointmentId', async (c) => {
  try {
    const appointmentId = c.req.param('appointmentId');
    
    if (!appointmentId) {
      return c.json(errorResponse(400, 'Missing appointment ID'), 400);
    }
    
    const result = await sendAppointmentConfirmation(appointmentId);
    
    if (result.success) {
      return c.json(successResponse(200, {
        message: 'Confirmation notification sent successfully',
        messageId: result.messageId,
        appointmentId
      }));
    } else {
      return c.json(errorResponse(400, 'Failed to send confirmation notification', result.error), 400);
    }
  } catch (error) {
    return c.json(errorResponse(500, 'Internal server error', error), 500);
  }
});

// Send reminder message for a specific appointment
notificationsRoute.post('/remind/:appointmentId', async (c) => {
  try {
    const appointmentId = c.req.param('appointmentId');
    
    if (!appointmentId) {
      return c.json(errorResponse(400, 'Missing appointment ID'), 400);
    }
    
    const result = await sendAppointmentReminder(appointmentId);
    
    if (result.success) {
      return c.json(successResponse(200, {
        message: 'Reminder notification sent successfully',
        messageId: result.messageId,
        appointmentId
      }));
    } else {
      return c.json(errorResponse(400, 'Failed to send reminder notification', result.error), 400);
    }
  } catch (error) {
    return c.json(errorResponse(500, 'Internal server error', error), 500);
  }
});

// Check and send reminders for all upcoming appointments (cron job endpoint)
notificationsRoute.post('/check-reminders', async (c) => {
  try {
    const result = await checkAndSendReminders();
    
    if (result.success) {
      return c.json(successResponse(200, {
        message: 'Reminder check completed',
        remindersSent: result.remindersSent,
        errors: result.errors,
        timestamp: new Date().toISOString()
      }));
    } else {
      return c.json(errorResponse(500, 'Failed to check reminders', result.errors), 500);
    }
  } catch (error) {
    return c.json(errorResponse(500, 'Internal server error', error), 500);
  }
});

// Send barber notification for a specific appointment
notificationsRoute.post('/barber/:appointmentId', async (c) => {
  try {
    const appointmentId = c.req.param('appointmentId');
    
    if (!appointmentId) {
      return c.json(errorResponse(400, 'Missing appointment ID'), 400);
    }
    
    const result = await sendBarberNotification(appointmentId);
    
    if (result.success) {
      return c.json(successResponse(200, {
        message: 'Barber notification sent successfully',
        messageId: result.messageId,
        appointmentId
      }));
    } else {
      return c.json(errorResponse(400, 'Failed to send barber notification', result.error), 400);
    }
  } catch (error) {
    return c.json(errorResponse(500, 'Internal server error', error), 500);
  }
});

// Test barber notification with mock data
notificationsRoute.post('/barber-test', async (c) => {
  try {
    const db = await getDatabase();
    
    // Create test user (customer) first
    const testUser = await db.insert(users).values({
      email: 'test@example.com',
      password: 'test',
      firstName: 'Test',
      lastName: 'Customer',
      phone: '+1234567890'
    }).returning().catch(() => []); // Ignore if user already exists

    // Create test barber
    const testBarber = await db.insert(users).values({
      email: 'barber@example.com',
      password: 'test',
      firstName: 'Carlos',
      lastName: 'Rodriguez',
      phone: '+1234567890',
      role: 'staff'
    }).returning().catch(() => []); // Ignore if barber already exists

    // Create test service
    const testService = await db.insert(services).values({
      name: 'Classic Haircut',
      description: 'Test service',
      price: '25.00',
      duration: 30,
      isActive: true
    }).returning().catch(() => []); // Ignore if service already exists

    // Get the created IDs
    const userId = testUser[0]?.id || '00000000-0000-0000-0000-000000000001';
    const barberId = testBarber[0]?.id || '00000000-0000-0000-0000-000000000002';
    const serviceId = testService[0]?.id || '00000000-0000-0000-0000-000000000003';

    // Create a test appointment with mock data
    const testAppointment = await db.insert(appointments).values({
      userId: userId,
      barberId: barberId,
      serviceId: serviceId,
      appointmentDate: new Date('2025-01-25'),
      timeSlot: '10:00',
      status: 'confirmed',
      notes: 'Test appointment for barber notification'
    }).returning();

    if (!testAppointment[0]) {
      return c.json(errorResponse(500, 'Failed to create test appointment'), 500);
    }

    // Test the barber notification
    const result = await sendBarberNotification(testAppointment[0].id);
    
    if (result.success) {
      return c.json(successResponse(200, {
        message: 'Barber notification test completed successfully',
        messageId: result.messageId,
        appointmentId: testAppointment[0].id
      }));
    } else {
      return c.json(errorResponse(400, 'Failed to send barber notification', result.error), 400);
    }
  } catch (error) {
    return c.json(errorResponse(500, 'Internal server error', error), 500);
  }
});

// Test barber push notification with Expo push token
notificationsRoute.post('/barber-push-test', async (c) => {
  try {
    const { expoPushToken } = await c.req.json();
    
    if (!expoPushToken) {
      return c.json(errorResponse(400, 'Expo push token is required'), 400);
    }

    // Test the barber notification with a simple message
    const testNotification = generateBarberNotificationPushNotification({
      customerName: 'Test',
      customerLastName: 'Customer',
      serviceName: 'Classic Haircut',
      appointmentDate: '25 de enero de 2025 a las 10:00 AM',
      timeSlot: '10:00',
      customerPhone: '+1234567890',
      paymentAmount: '25.00'
    });

    // Send test push notification
    const result = await sendPushNotification(expoPushToken, testNotification);
    
    if (result.success) {
      return c.json(successResponse(200, {
        message: 'Barber push notification test completed successfully',
        messageId: result.messageId,
        ticketId: result.ticketId
      }));
    } else {
      return c.json(errorResponse(400, 'Failed to send barber push notification', result.error), 400);
    }
  } catch (error) {
    return c.json(errorResponse(500, 'Internal server error', error), 500);
  }
});

// Health check for notifications system
notificationsRoute.get('/health', async (c) => {
  try {
    const cronStatus = cronService.getStatus();
    
    return c.json(successResponse(200, {
      service: 'Push Notifications',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      cronJob: {
        isRunning: cronStatus.isRunning,
        schedule: cronStatus.schedule,
        timezone: cronStatus.timezone
      }
    }));
  } catch (error) {
    return c.json(errorResponse(500, 'Health check failed', error), 500);
  }
});

// Get cron service status
notificationsRoute.get('/cron/status', async (c) => {
  try {
    const status = cronService.getStatus();
    
    return c.json(successResponse(200, {
      message: 'Cron service status retrieved successfully',
      status,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    return c.json(errorResponse(500, 'Failed to get cron status', error), 500);
  }
});

// Manually trigger reminder check
notificationsRoute.post('/cron/trigger', async (c) => {
  try {
    const result = await cronService.triggerReminderCheck();
    
    return c.json(successResponse(200, {
      message: 'Manual reminder check triggered successfully',
      result,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    return c.json(errorResponse(500, 'Failed to trigger reminder check', error), 500);
  }
});

export default notificationsRoute;
