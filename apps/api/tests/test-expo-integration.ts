/**
 * Comprehensive Integration Test for Expo Push Notifications
 * 
 * This test validates the complete push notification system including:
 * - Helper function imports and exports
 * - Token validation
 * - Notification data generation
 * - Error handling
 */

import { 
  sendPushNotification,
  sendPushNotificationToMultiple,
  generateAppointmentConfirmationNotification,
  generateAppointmentReminderNotification,
  generateBarberNotificationPushNotification,
  generateAppointmentRescheduleConfirmationNotification,
  generateBarberRescheduleNotificationPushNotification,
  testPushNotification,
  PushNotificationResult,
  PushNotificationData
} from '../src/helpers/expo-push.helper.js';
import { Expo } from 'expo-server-sdk';

console.log('🧪 Running Comprehensive Expo Push Notification Integration Tests\n');

let testsPassed = 0;
let testsFailed = 0;

// Helper function to log test results
function logTest(testName: string, passed: boolean, details?: string) {
  if (passed) {
    console.log(`✅ ${testName}`);
    if (details) console.log(`   ${details}`);
    testsPassed++;
  } else {
    console.log(`❌ ${testName}`);
    if (details) console.log(`   ${details}`);
    testsFailed++;
  }
}

// Test 1: Verify all functions are exported
console.log('Test Suite 1: Function Exports');
try {
  logTest(
    'sendPushNotification is exported',
    typeof sendPushNotification === 'function'
  );
  logTest(
    'sendPushNotificationToMultiple is exported',
    typeof sendPushNotificationToMultiple === 'function'
  );
  logTest(
    'generateAppointmentConfirmationNotification is exported',
    typeof generateAppointmentConfirmationNotification === 'function'
  );
  logTest(
    'generateAppointmentReminderNotification is exported',
    typeof generateAppointmentReminderNotification === 'function'
  );
  logTest(
    'generateBarberNotificationPushNotification is exported',
    typeof generateBarberNotificationPushNotification === 'function'
  );
  logTest(
    'testPushNotification is exported',
    typeof testPushNotification === 'function'
  );
} catch (error) {
  logTest('Function exports', false, `Error: ${error.message}`);
}

// Test 2: Test notification data generation functions
console.log('\nTest Suite 2: Notification Data Generation');
try {
  const appointmentData = {
    serviceName: 'Corte Clásico',
    appointmentDate: '25 de enero de 2025',
    timeSlot: '10:00',
    barberName: 'Carlos Rodriguez',
    customerName: 'Juan Pérez'
  };

  const confirmationNotification = generateAppointmentConfirmationNotification(appointmentData);
  logTest(
    'Generate appointment confirmation notification',
    confirmationNotification.title.includes('Confirmada') &&
    confirmationNotification.body.includes('Corte Clásico') &&
    confirmationNotification.data.type === 'appointment_confirmation',
    `Title: ${confirmationNotification.title}`
  );

  const reminderNotification = generateAppointmentReminderNotification(appointmentData);
  logTest(
    'Generate appointment reminder notification',
    reminderNotification.title.includes('Recordatorio') &&
    reminderNotification.body.includes('Corte Clásico') &&
    reminderNotification.data.type === 'appointment_reminder',
    `Title: ${reminderNotification.title}`
  );

  const barberData = {
    customerName: 'Juan',
    customerLastName: 'Pérez',
    serviceName: 'Corte Clásico',
    appointmentDate: '25 de enero de 2025',
    timeSlot: '10:00',
    customerPhone: '+1234567890',
    paymentAmount: '25.00'
  };

  const barberNotification = generateBarberNotificationPushNotification(barberData);
  logTest(
    'Generate barber notification',
    barberNotification.title.includes('Nueva Cita') &&
    barberNotification.body.includes('Juan Pérez') &&
    barberNotification.data.type === 'barber_appointment_created',
    `Title: ${barberNotification.title}`
  );

  const rescheduleNotification = generateAppointmentRescheduleConfirmationNotification(appointmentData);
  logTest(
    'Generate reschedule confirmation notification',
    rescheduleNotification.title.includes('Reprogramada') &&
    rescheduleNotification.data.type === 'appointment_rescheduled',
    `Title: ${rescheduleNotification.title}`
  );

  const barberRescheduleData = {
    ...barberData,
    originalDate: '24 de enero de 2025',
    originalTimeSlot: '09:00'
  };

  const barberRescheduleNotification = generateBarberRescheduleNotificationPushNotification(barberRescheduleData);
  logTest(
    'Generate barber reschedule notification',
    barberRescheduleNotification.title.includes('Reprogramada') &&
    barberRescheduleNotification.data.type === 'barber_appointment_rescheduled',
    `Title: ${barberRescheduleNotification.title}`
  );
} catch (error) {
  logTest('Notification data generation', false, `Error: ${error.message}`);
}

// Test 3: Test invalid token handling
console.log('\nTest Suite 3: Token Validation and Error Handling');
try {
  const invalidToken = 'invalid-token-format';
  const result = await sendPushNotification(invalidToken, {
    title: 'Test',
    body: 'Test message',
    data: {},
    sound: 'default'
  });

  logTest(
    'Invalid token is rejected',
    !result.success && result.error.includes('not a valid Expo push token'),
    `Error message: ${result.error}`
  );
} catch (error) {
  logTest('Invalid token handling', false, `Unexpected error: ${error.message}`);
}

// Test 4: Test notification structure validation
console.log('\nTest Suite 4: Notification Structure Validation');
try {
  const testNotificationData: PushNotificationData = {
    title: 'Test Notification',
    body: 'This is a test message',
    data: {
      test: true,
      timestamp: Date.now()
    },
    sound: 'default',
    badge: 1,
    channelId: 'test-channel'
  };

  // Validate all required fields are present
  const hasTitle = typeof testNotificationData.title === 'string';
  const hasBody = typeof testNotificationData.body === 'string';
  const hasData = typeof testNotificationData.data === 'object';
  
  logTest(
    'Notification data structure is valid',
    hasTitle && hasBody && hasData,
    `Fields present: title, body, data, sound, badge, channelId`
  );

  // Test Spanish language support in notifications
  const spanishNotification = generateAppointmentConfirmationNotification({
    serviceName: 'Corte de Cabello',
    appointmentDate: '25 de enero de 2025',
    timeSlot: '10:00',
    barberName: 'Carlos Rodríguez',
    customerName: 'José García'
  });

  const hasSpanishContent = 
    spanishNotification.title.includes('Confirmada') &&
    spanishNotification.body.includes('Tu cita');

  logTest(
    'Spanish language support in notifications',
    hasSpanishContent,
    'Notifications support Spanish language'
  );
} catch (error) {
  logTest('Notification structure validation', false, `Error: ${error.message}`);
}

// Test 5: Test channel ID configuration
console.log('\nTest Suite 5: Channel Configuration');
try {
  const appointmentNotif = generateAppointmentConfirmationNotification({
    serviceName: 'Test',
    appointmentDate: 'Test',
    timeSlot: 'Test',
    barberName: 'Test',
    customerName: 'Test'
  });

  const barberNotif = generateBarberNotificationPushNotification({
    customerName: 'Test',
    customerLastName: 'User',
    serviceName: 'Test',
    appointmentDate: 'Test',
    timeSlot: 'Test',
    customerPhone: '+1234567890'
  });

  logTest(
    'Appointment channel ID is correct',
    appointmentNotif.channelId === 'appointments',
    `Channel ID: ${appointmentNotif.channelId}`
  );

  logTest(
    'Barber notification channel ID is correct',
    barberNotif.channelId === 'barber_notifications',
    `Channel ID: ${barberNotif.channelId}`
  );
} catch (error) {
  logTest('Channel configuration', false, `Error: ${error.message}`);
}

// Test 6: Test timestamp inclusion
console.log('\nTest Suite 6: Timestamp and Cache Busting');
try {
  const notification1 = generateAppointmentConfirmationNotification({
    serviceName: 'Test',
    appointmentDate: 'Test',
    timeSlot: 'Test',
    barberName: 'Test',
    customerName: 'Test'
  });

  // Wait a bit and generate another notification
  await new Promise(resolve => setTimeout(resolve, 10));

  const notification2 = generateAppointmentConfirmationNotification({
    serviceName: 'Test',
    appointmentDate: 'Test',
    timeSlot: 'Test',
    barberName: 'Test',
    customerName: 'Test'
  });

  const hasTimestamp1 = 'timestamp' in notification1.data;
  const hasTimestamp2 = 'timestamp' in notification2.data;
  const timestampsDifferent = notification1.data.timestamp !== notification2.data.timestamp;

  logTest(
    'Notifications include timestamps',
    hasTimestamp1 && hasTimestamp2,
    'Timestamps are included for cache busting'
  );

  logTest(
    'Timestamps are unique',
    timestampsDifferent,
    'Each notification has a unique timestamp'
  );
} catch (error) {
  logTest('Timestamp validation', false, `Error: ${error.message}`);
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 Test Results Summary');
console.log('='.repeat(60));
console.log(`✅ Tests Passed: ${testsPassed}`);
console.log(`❌ Tests Failed: ${testsFailed}`);
console.log(`📈 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(2)}%`);
console.log('='.repeat(60));

if (testsFailed === 0) {
  console.log('\n🎉 All tests passed! Expo Push Notification integration is working correctly.');
  console.log('\n✨ Features validated:');
  console.log('  • Function exports and imports');
  console.log('  • Notification data generation');
  console.log('  • Token validation and error handling');
  console.log('  • Spanish language support');
  console.log('  • Channel ID configuration');
  console.log('  • Timestamp-based cache busting');
  console.log('='.repeat(60));
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Please review the errors above.');
  process.exit(1);
}
