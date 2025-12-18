import { Hono } from 'hono';
import { Buffer } from 'node:buffer';
import { getDatabase } from '../db/connection.js';
import { services, payments, appointments, users } from '../db/schema.js';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import Stripe from 'stripe';
import { errorResponse, successResponse } from '../helpers/response.helper.js';
import { PaymentHelper } from './payment.helper.js';
import { 
  createPayment, 
  updatePayment, 
  getPaymentById, 
  getPaymentByTransactionId, 
  getUserPayments 
} from './payments.controller.js';
import type { TimeSlot } from '../schedules/schedules.d.js';
import { sendAppointmentConfirmation, sendBarberNotification } from '../notifications/notifications.controller.js';
import { sendPushNotification, generatePaymentNotification } from '../helpers/expo-push.helper.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  // Use a stable, valid API version; or omit to use account default
  apiVersion: '2024-06-20',
});

export const paymentsRoute = new Hono();

type UserRecord = typeof users.$inferSelect;
type PaymentRecord = typeof payments.$inferSelect;
type AppointmentRecord = typeof appointments.$inferSelect;

async function sendPaymentPushNotificationIfPossible({
  user,
  payment,
  appointmentId
}: {
  user?: UserRecord | null;
  payment: PaymentRecord;
  appointmentId?: string | null;
}) {
  if (
    !user ||
    !user.expoPushToken ||
    !user.pushNotificationsEnabled ||
    payment.status !== 'completed'
  ) {
    return;
  }

  try {
    const notification = generatePaymentNotification({
      paymentId: payment.id,
      amount: payment.amount,
      status: payment.status,
      appointmentId
    });

    const result = await sendPushNotification(user.expoPushToken, notification);

    if (result.success) {
      console.log('✅ Payment push notification sent', {
        paymentId: payment.id,
        userId: user.id,
        appointmentId: appointmentId || null
      });
    } else {
      console.error('❌ Failed to send payment push notification', {
        paymentId: payment.id,
        userId: user.id,
        error: result.error
      });
    }
  } catch (error) {
    console.error('❌ Error sending payment push notification:', error);
  }
}

// Payment CRUD routes
paymentsRoute.post('/', async (c) => {
    try {
        const paymentData = await c.req.json();
        
        if (!paymentData.amount || !paymentData.paymentMethod || !paymentData.status || !paymentData.transactionId) {
            return c.json(errorResponse(400, 'Missing required fields'), 400);
        }

        const { data, error } = await createPayment(paymentData);

        if (error) {
            const statusCode = error.includes('Missing required fields') ? 400 : 500;
            return c.json(errorResponse(statusCode, error), statusCode);
        }

        if (!data) {
            return c.json(errorResponse(500, 'Failed to create payment'), 500);
        }

        return c.json(successResponse(201, data), 201);
    } catch (error) {
        console.error('Error creating payment:', error);
        return c.json(errorResponse(500, 'Internal server error'), 500);
    }
});

paymentsRoute.put('/:id', async (c) => {
    try {
        const { id } = c.req.param();
        const updateData = await c.req.json();
        
        if (!id) {
            return c.json(errorResponse(400, 'Payment ID is required'), 400);
        }

        const { data, error } = await updatePayment(id, updateData);

        if (error) {
            const statusCode = error.includes('not found') ? 404 : 
                              error.includes('required') ? 400 : 500;
            return c.json(errorResponse(statusCode, error), statusCode);
        }

        if (!data) {
            return c.json(errorResponse(500, 'Failed to update payment'), 500);
        }

        return c.json(successResponse(200, data), 200);
    } catch (error) {
        console.error('Error updating payment:', error);
        return c.json(errorResponse(500, 'Internal server error'), 500);
    }
});

/**
 * GET /payments/webhook-status
 * Simple endpoint to check if webhooks are being received
 */
paymentsRoute.get('/webhook-status', async (c) => {
  return c.json(successResponse(200, {
    message: 'Webhook endpoint is accessible',
    endpoint: '/payments/webhook',
    timestamp: new Date().toISOString(),
    note: 'Check server logs for actual webhook receipts'
  }), 200);
});

paymentsRoute.get('/:id', async (c) => {
    try {
        const { id } = c.req.param();
        
        if (!id) {
            return c.json(errorResponse(400, 'Payment ID is required'), 400);
        }

        const { data, error } = await getPaymentById(id);

        if (error) {
            const statusCode = error.includes('not found') ? 404 : 
                              error.includes('required') ? 400 : 500;
            return c.json(errorResponse(statusCode, error), statusCode);
        }

        if (!data) {
            return c.json(errorResponse(404, 'Payment not found'), 404);
        }

        return c.json(successResponse(200, data), 200);
    } catch (error) {
        console.error('Error getting payment:', error);
        return c.json(errorResponse(500, 'Internal server error'), 500);
    }
});

paymentsRoute.get('/transaction/:transactionId', async (c) => {
    try {
        const { transactionId } = c.req.param();
        
        if (!transactionId) {
            return c.json(errorResponse(400, 'Transaction ID is required'), 400);
        }

        const { data, error } = await getPaymentByTransactionId(transactionId);

        if (error) {
            const statusCode = error.includes('not found') ? 404 : 
                              error.includes('required') ? 400 : 500;
            return c.json(errorResponse(statusCode, error), statusCode);
        }

        if (!data) {
            return c.json(errorResponse(404, 'Payment not found'), 404);
        }

        return c.json(successResponse(200, data), 200);
    } catch (error) {
        console.error('Error getting payment by transaction ID:', error);
        return c.json(errorResponse(500, 'Internal server error'), 500);
    }
});

paymentsRoute.get('/user/:userId', async (c) => {
    try {
        const { userId } = c.req.param();
        
        if (!userId) {
            return c.json(errorResponse(400, 'User ID is required'), 400);
        }

        const { data, error } = await getUserPayments(userId);

        if (error) {
            const statusCode = error.includes('required') ? 400 : 500;
            return c.json(errorResponse(statusCode, error), statusCode);
        }

        if (!data) {
            return c.json(errorResponse(404, 'No payments found'), 404);
        }

        return c.json(successResponse(200, data), 200);
    } catch (error) {
        console.error('Error getting user payments:', error);
        return c.json(errorResponse(500, 'Internal server error'), 500);
    }
});

/**
 * POST /payments/checkout
 * Body: { 
 *   serviceId: string, 
 *   paymentType: 'full' | 'advance', 
 *   successUrl: string, 
 *   cancelUrl: string,
 *   userId?: string,
 *   appointmentData?: {
 *     barberId: string,
 *     appointmentDate: string,
 *     timeSlot: string,
 *     notes?: string
 *   }
 * }
 * Returns: { url: string }
 */
paymentsRoute.post('/checkout', async (c) => {
  try {
    const { 
      serviceId, 
      paymentType, 
      successUrl, 
      cancelUrl, 
      userId,
      appointmentData 
    } = await c.req.json();
    
    if (!serviceId || !paymentType || !successUrl || !cancelUrl) {
      return c.json(errorResponse(400, 'Missing required fields'), 400);
    }

    // In production, require HTTPS return URLs (Stripe live mode requirement)
    const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
    if (isProd) {
      const httpsRegex = /^https:\/\//i;
      const localhostRegex = /localhost|127\.0\.0\.1|::1/i;
      if (!httpsRegex.test(successUrl) || !httpsRegex.test(cancelUrl)) {
        return c.json(
          errorResponse(
            400,
            'In production, successUrl and cancelUrl must be HTTPS URLs.'
          ),
          400
        );
      }
      if (localhostRegex.test(successUrl) || localhostRegex.test(cancelUrl)) {
        return c.json(
          errorResponse(
            400,
            'In production, local URLs (localhost) are not allowed for Stripe Checkout.'
          ),
          400
        );
      }
    }

    const db = await getDatabase();
    const [service] = await db.select().from(services).where(eq(services.id, serviceId));
    if (!service) {
      return c.json(errorResponse(404, 'Service not found'), 404);
    }

    let priceId: string | undefined;
    if (paymentType === 'full') {
      priceId = service.stripePriceId || undefined;
    } else if (paymentType === 'advance') {
      priceId = service.stripeAdvancePriceId || undefined;
    }
    
    if (!priceId) {
      return c.json(errorResponse(400, 'Selected payment option is not available for this service'), 400);
    }

    // Prepare metadata for Stripe session
    const metadata: Record<string, string> = {
      serviceId,
      paymentType,
    };

    // Add appointment data to metadata if provided
    if (appointmentData) {
      metadata.barberId = appointmentData.barberId;
      metadata.appointmentDate = appointmentData.appointmentDate;
      metadata.timeSlot = appointmentData.timeSlot;
      if (appointmentData.notes) {
        metadata.notes = appointmentData.notes;
      }
    }

    if (userId) {
      metadata.userId = userId;
    }

    // Optional: Validate that price exists in current Stripe mode (helps catch test/live mixups)
    try {
      await stripe.prices.retrieve(priceId);
    } catch (e: any) {
      console.error('Stripe price validation failed:', {
        priceId,
        code: e?.code,
        message: e?.message,
      });
      return c.json(
        errorResponse(
          400,
          'Invalid Stripe price for current environment. Ensure prices are created with the same Stripe key (live vs test).'
        ),
        400
      );
    }

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
    });

    return c.json(successResponse(200, { url: session.url, sessionId: session.id }), 200);
  } catch (error) {
    console.error('Error creating Stripe Checkout session:', error);
    return c.json(errorResponse(500, 'Failed to create Stripe Checkout session'), 500);
  }
});

/**
 * POST /payments/webhook
 * Handles Stripe webhook events for payment confirmation
 */
paymentsRoute.post('/webhook', async (c) => {
  const timestamp = new Date().toISOString();
  console.log(`🔔 [${timestamp}] Webhook received`);
  
  const signature = c.req.header('stripe-signature');
  
  // IMPORTANT: For Stripe webhooks, we must use the RAW request clone to get exact bytes
  // Using c.req.text() or c.req.json() will modify the body and break signature verification
  const rawBody = await c.req.raw.arrayBuffer();
  const bodyBuffer = Buffer.from(rawBody);
  const body = bodyBuffer.toString('utf8');
  
  // Log webhook receipt for debugging
  console.log(`📋 [${timestamp}] Webhook details:`, {
    hasSignature: !!signature,
    bodyLength: body.length,
    bodyPreview: body.substring(0, 100) + '...',
    headers: {
      'content-type': c.req.header('content-type'),
      'user-agent': c.req.header('user-agent'),
      'stripe-signature': signature ? 'present' : 'missing'
    },
    secretConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
    secretLength: process.env.STRIPE_WEBHOOK_SECRET?.length || 0
  });

  console.log('Webhook headers:', {
    signature: signature ? 'present' : 'missing',
    contentType: c.req.header('content-type'),
    userAgent: c.req.header('user-agent')
  });

  let event: Stripe.Event;

  // Helper to check for development environment
  function isDevelopmentEnv() {
    const env = (process.env.NODE_ENV || '').toLowerCase();
    return env === 'development' || env === 'dev';
  }

  try {
    // In development, allow webhook processing without signature verification
    if (isDevelopmentEnv() && !signature) {
      console.log('Development mode: Processing webhook without signature verification');
      event = JSON.parse(body) as Stripe.Event;
    } else if (isDevelopmentEnv() && signature === 'test') {
      console.log('Development mode: Processing webhook with test signature');
      event = JSON.parse(body) as Stripe.Event;
    } else {
      if (!signature) {
        console.error('Missing Stripe signature');
        return c.json(errorResponse(400, 'Missing Stripe signature'), 400);
      }

      if (!process.env.STRIPE_WEBHOOK_SECRET) {
        console.error('Missing STRIPE_WEBHOOK_SECRET environment variable');
        // Still try to process if dev, otherwise fail
        if (isDevelopmentEnv()) {
             console.log('Development mode: Attempting parse without verification due to missing secret');
             event = JSON.parse(body) as Stripe.Event;
        } else {
             return c.json(errorResponse(500, 'Webhook configuration error'), 500);
        }
      } else {
        // Construct the event using the raw body string
        // Use the raw byte buffer to avoid any newline/encoding mutations
        event = await stripe.webhooks.constructEventAsync(bodyBuffer, signature, process.env.STRIPE_WEBHOOK_SECRET);
      }
    }
    
    console.log('✅ Webhook event parsed successfully:', {
      type: event.type,
      id: event.id,
      created: event.created
    });
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err);
    if (err instanceof Error) {
        console.error('Error message:', err.message);
        // Log signature details for debugging (be careful not to log full secrets in prod)
        if (isDevelopmentEnv()) {
            console.error('Debug info:', {
                signatureHeader: signature,
                secretPrefix: process.env.STRIPE_WEBHOOK_SECRET?.substring(0, 8) + '...',
                bodyLength: body.length
            });
        }
    }
    return c.json(errorResponse(400, 'Invalid signature'), 400);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session;
        
        console.log('🎯 Processing checkout.session.completed event:', {
          sessionId: session.id,
          amount: session.amount_total,
          metadata: session.metadata,
          paymentStatus: session.payment_status,
          status: session.status
        });
        
        // Log success for webhook monitoring
        console.log(`✅ [${timestamp}] PAYMENT COMPLETED: Session ${session.id} for $${(session.amount_total || 0) / 100}`);
        
        // Extract metadata
        const serviceId = session.metadata?.serviceId;
        const paymentType = session.metadata?.paymentType;
        const userId = session.metadata?.userId;
        const barberId = session.metadata?.barberId;
        const appointmentDate = session.metadata?.appointmentDate;
        const timeSlot = session.metadata?.timeSlot;
        const notes = session.metadata?.notes;
        
        console.log('📋 Extracted metadata:', {
          serviceId,
          paymentType,
          userId,
          barberId,
          appointmentDate,
          timeSlot,
          notes
        });
        
        if (!serviceId || !paymentType) {
          console.error('❌ Missing serviceId or paymentType in session metadata');
          return c.json(errorResponse(400, 'Invalid session metadata'), 400);
        }

        console.log('✅ Required metadata present, proceeding with appointment creation');

        const db = await getDatabase();
        try {
          // Use a transaction to ensure both payment and appointment are created together
          await db.transaction(async (tx) => {
            // Validate user exists
            let userRecord: UserRecord | null = null;
            if (userId) {
              const userRows = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
              if (!userRows || userRows.length === 0) {
                console.error(`❌ User not found: ${userId}`);
                throw new Error(`User not found: ${userId}`);
              }
              userRecord = userRows[0]!;
            }

            // Validate barber exists
            let barber = null;
            if (barberId) {
              barber = await tx.select().from(users).where(eq(users.id, barberId)).limit(1);
              if (!barber || barber.length === 0) {
                console.error(`❌ Barber not found: ${barberId}`);
                throw new Error(`Barber not found: ${barberId}`);
              }
            }

            // Validate service exists
            let service = null;
            if (serviceId) {
              service = await tx.select().from(services).where(eq(services.id, serviceId)).limit(1);
              if (!service || service.length === 0) {
                console.error(`❌ Service not found: ${serviceId}`);
                throw new Error(`Service not found: ${serviceId}`);
              }
            }

            // Validate appointment date format
            if (appointmentDate && timeSlot) {
              const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
              if (!dateRegex.test(appointmentDate)) {
                console.error(`❌ Invalid appointment date format. Expected dd/mm/yyyy, got: ${appointmentDate}`);
                throw new Error(`Invalid appointment date format. Expected dd/mm/yyyy, got: ${appointmentDate}`);
              }
            }

            // Check if the time slot is available before creating appointment
            if (barberId && appointmentDate && timeSlot) {
              console.log('🔍 Checking availability for:', {
                barberId,
                appointmentDate,
                timeSlot,
                dateFormat: 'dd/mm/yyyy'
              });
              
              const { isTimeSlotAvailable } = await import('../schedules/schedules.controller.js');
              const isAvailable = await isTimeSlotAvailable(barberId, appointmentDate, timeSlot as TimeSlot);
              
              console.log('📊 Availability check result:', {
                isAvailable,
                barberId,
                appointmentDate,
                timeSlot
              });
              
              if (!isAvailable) {
                console.error(`❌ Time slot not available: ${timeSlot} on ${appointmentDate} for barber ${barberId}`);
                throw new Error(`El horario seleccionado (${timeSlot}) no está disponible para la fecha ${appointmentDate}. Por favor, selecciona otro horario.`);
              }
              
              // Additional check: verify no duplicate appointments exist
              const dateParts = appointmentDate.split('/');
              if (dateParts.length === 3) {
                const [day, month, year] = dateParts;
                if (day && month && year) {
                  const targetDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                  const startOfDay = new Date(targetDate);
                  startOfDay.setHours(0, 0, 0, 0);
                  const endOfDay = new Date(targetDate);
                  endOfDay.setHours(23, 59, 59, 999);

                  const existingAppointment = await tx
                    .select()
                    .from(appointments)
                    .where(
                      and(
                        eq(appointments.barberId, barberId),
                        eq(appointments.timeSlot, timeSlot),
                        gte(appointments.appointmentDate, startOfDay),
                        lte(appointments.appointmentDate, endOfDay),
                        sql`${appointments.status} != 'cancelled'`
                      )
                    )
                    .limit(1);

                  if (existingAppointment.length > 0) {
                    console.error('❌ Duplicate appointment attempt in webhook:', {
                      barberId,
                      appointmentDate,
                      timeSlot,
                      existingAppointment: existingAppointment[0]
                    });
                    throw new Error(`El horario seleccionado (${timeSlot}) ya está reservado para la fecha ${appointmentDate}. Por favor, selecciona otro horario.`);
                  }
                }
              }
            }

            // Create appointment first if appointment data is provided
            let appointmentId: string | null = null;
            if (barberId && appointmentDate && timeSlot) {
              try {
                console.log('📅 Creating appointment with data:', {
                  barberId,
                  appointmentDate,
                  timeSlot,
                  userId,
                  serviceId,
                  notes
                });
                const dateParts = appointmentDate.split('/');
                if (dateParts.length === 3) {
                  const day = dateParts[0];
                  const month = dateParts[1];
                  const year = dateParts[2];
                  if (day && month && year) {
                    const dayNum = parseInt(day);
                    const monthNum = parseInt(month);
                    const yearNum = parseInt(year);
                    if (!isNaN(dayNum) && !isNaN(monthNum) && !isNaN(yearNum)) {
                      const appointmentDateObj = new Date(yearNum, monthNum - 1, dayNum);
                      const appointmentData = {
                        userId: userId || null,
                        barberId,
                        serviceId,
                        appointmentDate: appointmentDateObj,
                        timeSlot,
                        status: 'confirmed',
                        notes: notes || null
                      };
                      console.log('📝 Inserting appointment with data:', appointmentData);
                      const [appointment] = await tx.insert(appointments).values(appointmentData).returning();
                      if (appointment) {
                        console.log('✅ Appointment created successfully:', appointment.id);
                        appointmentId = appointment.id;
                        
                        // Send confirmation notification immediately after appointment creation
                        console.log('📱 Sending confirmation notification for appointment:', appointment.id);
                        try {
                          const notificationResult = await sendAppointmentConfirmation(appointment.id, tx);
                          if (notificationResult.success) {
                            console.log('✅ Confirmation notification sent successfully');
                          } else {
                            console.error('❌ Failed to send confirmation notification:', notificationResult.error);
                          }
                        } catch (notificationError) {
                          console.error('❌ Error sending confirmation notification:', notificationError);
                        }


                      } else {
                        console.error('❌ Failed to create appointment - no appointment returned');
                        throw new Error('Failed to create appointment');
                      }
                    } else {
                      console.error('❌ Invalid date parts:', { day, month, year });
                      throw new Error('Invalid date parts');
                    }
                  } else {
                    console.error('❌ Missing date parts:', { day, month, year });
                    throw new Error('Missing date parts');
                  }
                } else {
                  console.error('❌ Invalid date format:', appointmentDate);
                  throw new Error('Invalid date format');
                }
              } catch (err) {
                console.error('❌ Error during appointment creation:', err);
                throw err;
              }
            } else {
              console.log('⚠️ Missing appointment data:', {
                barberId: !!barberId,
                appointmentDate: !!appointmentDate,
                timeSlot: !!timeSlot
              });
            }

            // Log paymentType for debugging
            console.log('Webhook paymentType:', paymentType);
            // Create payment record - convert Stripe amount from cents to MXN
            const amountInCents = session.amount_total || 0;
            const amountInMXN = (amountInCents / 100).toFixed(2);
            const paymentData = {
              appointmentId,
              amount: amountInMXN, // Convert cents to MXN
              paymentMethod: 'stripe',
              paymentType: paymentType || 'full', // Fallback to 'full' if missing
              status: 'completed',
              transactionId: session.id
            };
            console.log('💰 Creating payment with data:', paymentData);
            const [payment] = await tx.insert(payments).values(paymentData).returning();
            if (!payment) {
              console.error('❌ Failed to create payment record');
              throw new Error('Failed to create payment record');
            }
            console.log('✅ Payment created successfully:', payment.id);

            await sendPaymentPushNotificationIfPossible({
              user: userRecord,
              payment,
              appointmentId
            });
            
            // Send barber notification after payment is created and linked
            if (appointmentId) {
              console.log('👨‍💼 Sending barber notification for appointment:', appointmentId);
              try {
                const barberNotificationResult = await sendBarberNotification(appointmentId, tx);
                if (barberNotificationResult.success) {
                  console.log('✅ Barber notification sent successfully');
                } else {
                  console.error('❌ Failed to send barber notification:', barberNotificationResult.error);
                }
              } catch (barberNotificationError) {
                console.error('❌ Error sending barber notification:', barberNotificationError);
              }
            }
            
            return { payment, appointment: appointmentId ? { id: appointmentId } : null };
          });
          console.log(`🎉 Payment completed successfully for service ${serviceId} with ${paymentType} payment`);
        } catch (err) {
          console.error('❌ Error in webhook transaction:', err);
          // Still return 200 to Stripe to prevent retries, but log the error
          console.error('🔄 Returning 200 to Stripe to prevent retries, but appointment creation failed');
          return c.json(successResponse(200, { 
            received: true, 
            error: 'Appointment creation failed but payment was processed',
            details: err instanceof Error ? err.message : String(err)
          }), 200);
        }
        break;

      case 'payment_intent.succeeded':
        console.log('Payment intent succeeded:', event.data.object.id);
        break;

      case 'payment_intent.payment_failed':
        console.log('Payment intent failed:', event.data.object.id);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return c.json(successResponse(200, { received: true }), 200);
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    // Return error response so Stripe knows to retry
    return c.json(errorResponse(500, 'Webhook processing failed'), 500);
  }
});

/**
 * POST /payments/test-webhook
 * Test endpoint to manually trigger payment completion logic
 */
paymentsRoute.post('/test-webhook', async (c) => {
  try {
    const { sessionId, serviceId, paymentType, userId, barberId, appointmentDate, timeSlot, notes, amount } = await c.req.json();
    
    if (!sessionId || !serviceId || !paymentType) {
      return c.json(errorResponse(400, 'Missing required fields'), 400);
    }

    console.log('Test webhook called with data:', {
      sessionId,
      serviceId,
      paymentType,
      userId,
      barberId,
      appointmentDate,
      timeSlot,
      notes,
      amount
    });

    const db = await getDatabase();
    
    // Use a transaction to ensure both payment and appointment are created together
    const result = await db.transaction(async (tx) => {
      let userRecord: UserRecord | null = null;
      let appointmentRecord: AppointmentRecord | null = null;

      if (userId) {
        const userRows = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!userRows || userRows.length === 0) {
          throw new Error(`User not found: ${userId}`);
        }
        userRecord = userRows[0]!;
      }

      // 1. Create payment record - convert amount from cents to MXN
      const amountInCents = amount || 2500;
      const amountInMXN = (amountInCents / 100).toFixed(2);
      const [payment] = await tx.insert(payments).values({
        amount: amountInMXN,
        paymentMethod: 'stripe',
        paymentType: paymentType, // Store the payment type
        status: 'completed',
        transactionId: sessionId,
      }).returning();

      if (!payment) {
        throw new Error('Failed to create payment record');
      }

      console.log(`Payment created with ID: ${payment.id}`);

      // 2. If appointment data is provided, create the appointment
      if (barberId && appointmentDate && timeSlot && userId) {
        console.log('Creating appointment with data:', {
          userId,
          barberId,
          serviceId,
          appointmentDate,
          timeSlot,
          notes
        });
        
        // Validate that all required entities exist
        const [barber] = await tx.select().from(users).where(eq(users.id, barberId)).limit(1);
        if (!barber) {
          throw new Error(`Barber not found: ${barberId}`);
        }
        
        const [service] = await tx.select().from(services).where(eq(services.id, serviceId)).limit(1);
        if (!service) {
          throw new Error(`Service not found: ${serviceId}`);
        }

        // Convert dd/mm/yyyy to Date object
        const dateParts = appointmentDate.split('/');
        if (dateParts.length !== 3) {
          throw new Error(`Invalid date format: ${appointmentDate}. Expected dd/mm/yyyy`);
        }
        
        const [day, month, year] = dateParts;
        if (!day || !month || !year) {
          throw new Error(`Invalid date parts: day=${day}, month=${month}, year=${year}`);
        }
        
        const targetDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        
        // Validate the date is valid
        if (isNaN(targetDate.getTime())) {
          throw new Error(`Invalid date: ${appointmentDate}`);
        }
        
        console.log('Parsed appointment date:', targetDate);
        
        // Check if the time slot is available before creating appointment
        const { isTimeSlotAvailable } = await import('../schedules/schedules.controller.js');
        const isAvailable = await isTimeSlotAvailable(barberId, appointmentDate, timeSlot as TimeSlot);
        
        if (!isAvailable) {
          throw new Error(`El horario seleccionado (${timeSlot}) no está disponible para la fecha ${appointmentDate}. Por favor, selecciona otro horario.`);
        }
        
        // Additional check: verify no duplicate appointments exist
        const appointmentDateParts = appointmentDate.split('/');
        if (appointmentDateParts.length === 3) {
          const [day, month, year] = appointmentDateParts;
          if (day && month && year) {
            const targetDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            const startOfDay = new Date(targetDate);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(targetDate);
            endOfDay.setHours(23, 59, 59, 999);

            const existingAppointment = await tx
              .select()
              .from(appointments)
              .where(
                and(
                  eq(appointments.barberId, barberId),
                  eq(appointments.timeSlot, timeSlot),
                  gte(appointments.appointmentDate, startOfDay),
                  lte(appointments.appointmentDate, endOfDay),
                  sql`${appointments.status} != 'cancelled'`
                )
              )
              .limit(1);

            if (existingAppointment.length > 0) {
              console.error('Duplicate appointment attempt in test-webhook:', {
                barberId,
                appointmentDate,
                timeSlot,
                existingAppointment: existingAppointment[0]
              });
              throw new Error(`El horario seleccionado (${timeSlot}) ya está reservado para la fecha ${appointmentDate}. Por favor, selecciona otro horario.`);
            }
          }
        }
        
        // Create appointment with confirmed status
        const [appointment] = await tx.insert(appointments).values({
          userId: userId as string,
          barberId: barberId as string,
          serviceId: serviceId as string,
          appointmentDate: targetDate,
          timeSlot: timeSlot as string,
          status: 'confirmed', // Automatically set to confirmed
          notes: notes || undefined,
        }).returning();

        if (!appointment) {
          throw new Error('Failed to create appointment record');
        }

        appointmentRecord = appointment;

        // 3. Update payment to link it to the appointment
        await tx.update(payments)
          .set({ appointmentId: appointment.id })
          .where(eq(payments.id, payment.id));

        console.log(`✅ Appointment created successfully with ID: ${appointment.id} and status: confirmed`);
        console.log(`✅ Payment ${payment.id} linked to appointment ${appointment.id}`);
        
        // Send barber notification for new appointment
        console.log('👨‍💼 Sending barber notification for appointment:', appointment.id);
        try {
          const barberNotificationResult = await sendBarberNotification(appointment.id, tx);
          if (barberNotificationResult.success) {
            console.log('✅ Barber notification sent successfully');
          } else {
            console.error('❌ Failed to send barber notification:', barberNotificationResult.error);
          }
        } catch (barberNotificationError) {
          console.error('❌ Error sending barber notification:', barberNotificationError);
        }
      } else {
        console.log('No appointment data provided, only payment created');
      }

      await sendPaymentPushNotificationIfPossible({
        user: userRecord,
        payment,
        appointmentId: appointmentRecord?.id || null
      });

      if (appointmentRecord) {
        return { payment, appointment: appointmentRecord };
      }

      return { payment };
    });

    if (result.appointment) {
      return c.json(successResponse(200, {
        payment: result.payment,
        appointment: result.appointment,
        message: 'Payment and appointment created successfully with confirmed status'
      }), 200);
    } else {
      return c.json(successResponse(200, {
        payment: result.payment,
        message: 'Payment created successfully'
      }), 200);
    }
    
  } catch (error) {
    console.error('❌ Error in test webhook:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return c.json(errorResponse(500, 'Test webhook failed'), 500);
  }
});

/**
 * GET /payments/session/:sessionId
 * Verify payment session status
 */
paymentsRoute.get('/session/:sessionId', async (c) => {
  try {
    const { sessionId } = c.req.param();
    
    if (!sessionId) {
      return c.json(errorResponse(400, 'Session ID is required'), 400);
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    return c.json(successResponse(200, {
      sessionId: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      metadata: session.metadata,
      amountTotal: session.amount_total,
      currency: session.currency,
    }), 200);
  } catch (error) {
    console.error('Error retrieving session:', error);
    return c.json(errorResponse(500, 'Failed to retrieve session'), 500);
  }
});

export default paymentsRoute; 
