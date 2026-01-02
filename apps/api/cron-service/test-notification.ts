#!/usr/bin/env bun

/**
 * Test script to verify push notifications from the cron service
 * 
 * Usage:
 *   bun test-notification.ts --token YOUR_EXPO_PUSH_TOKEN
 *   bun test-notification.ts --trigger (triggers the cron job)
 *   bun test-notification.ts --user-id YOUR_USER_ID (sends test notification to your user)
 */

import { sendPushNotification, generateAppointmentReminderNotification } from './src/helpers/expo-push.helper.js';
import { checkAndSendReminders } from './src/reminder-job.js';
import { getDatabase } from './src/db/connection.js';
import { users } from './src/db/schema.js';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

async function testDirectNotification(expoPushToken: string) {
  console.log('🧪 Testing direct push notification...');
  console.log(`📱 Token: ${expoPushToken.substring(0, 20)}...`);

  const testNotification = generateAppointmentReminderNotification({
    appointmentId: 'test-123',
    serviceName: 'Test Service',
    appointmentDate: 'hoy',
    timeSlot: '10:00',
    barberName: 'Test Barber',
    customerName: 'You'
  });

  const result = await sendPushNotification(expoPushToken, testNotification);

  if (result.success) {
    console.log('✅ Notification sent successfully!');
    console.log(`   Message ID: ${result.messageId}`);
    console.log(`   Ticket ID: ${result.ticketId}`);
    console.log('\n📱 Check your device - you should receive a notification!');
  } else {
    console.error('❌ Failed to send notification');
    console.error(`   Error: ${result.error}`);
  }

  return result;
}

async function testWithUserId(userId: string) {
  console.log('🧪 Testing notification for user ID...');
  console.log(`👤 User ID: ${userId}`);

  try {
    const db = await getDatabase();
    const userData = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        expoPushToken: users.expoPushToken,
        pushNotificationsEnabled: users.pushNotificationsEnabled
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userData.length === 0) {
      console.error('❌ User not found');
      return;
    }

    const user = userData[0];

    if (!user.expoPushToken) {
      console.error('❌ User has no Expo push token registered');
      console.log('💡 Make sure you have registered your push token in the app');
      return;
    }

    if (!user.pushNotificationsEnabled) {
      console.error('❌ User has push notifications disabled');
      console.log('💡 Enable push notifications in your app settings');
      return;
    }

    console.log(`✅ Found user: ${user.firstName} ${user.lastName}`);
    console.log(`📱 Push token: ${user.expoPushToken.substring(0, 20)}...`);
    console.log(`🔔 Notifications enabled: ${user.pushNotificationsEnabled}`);

    return await testDirectNotification(user.expoPushToken);
  } catch (error) {
    console.error('❌ Error fetching user:', error);
  }
}

async function triggerCronJob() {
  console.log('🧪 Triggering cron job manually...');
  console.log('⏰ This will check for appointments 14-16 minutes from now\n');

  try {
    const result = await checkAndSendReminders();

    console.log('\n📊 Cron Job Results:');
    console.log(`   Success: ${result.success}`);
    console.log(`   Reminders Sent: ${result.remindersSent}`);
    
    if (result.errors.length > 0) {
      console.log(`   Errors: ${result.errors.length}`);
      result.errors.forEach((error, i) => {
        console.log(`     ${i + 1}. ${error}`);
      });
    }

    if (result.remindersSent > 0) {
      console.log('\n✅ Notifications sent! Check your device.');
    } else {
      console.log('\n⚠️  No reminders were sent.');
      console.log('💡 This could mean:');
      console.log('   - No appointments are scheduled 14-16 minutes from now');
      console.log('   - Users don\'t have push tokens registered');
      console.log('   - Push notifications are disabled for those users');
    }

    return result;
  } catch (error) {
    console.error('❌ Error triggering cron job:', error);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const tokenIndex = args.indexOf('--token');
  const userIdIndex = args.indexOf('--user-id');
  const triggerIndex = args.indexOf('--trigger');

  console.log('🚀 Testing Cron Service Push Notifications\n');

  if (tokenIndex !== -1 && args[tokenIndex + 1]) {
    const token = args[tokenIndex + 1];
    await testDirectNotification(token);
  } else if (userIdIndex !== -1 && args[userIdIndex + 1]) {
    const userId = args[userIdIndex + 1];
    await testWithUserId(userId);
  } else if (triggerIndex !== -1) {
    await triggerCronJob();
  } else {
    console.log('Usage:');
    console.log('  bun test-notification.ts --token YOUR_EXPO_PUSH_TOKEN');
    console.log('  bun test-notification.ts --user-id YOUR_USER_ID');
    console.log('  bun test-notification.ts --trigger');
    console.log('\nExamples:');
    console.log('  # Test with your Expo push token directly');
    console.log('  bun test-notification.ts --token ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]');
    console.log('\n  # Test with your user ID (fetches token from DB)');
    console.log('  bun test-notification.ts --user-id 123e4567-e89b-12d3-a456-426614174000');
    console.log('\n  # Trigger the cron job (checks for appointments 14-16 min away)');
    console.log('  bun test-notification.ts --trigger');
    process.exit(1);
  }
}

main().catch(console.error);

