#!/usr/bin/env bun
import 'dotenv/config';
import { getDatabase } from '../db/connection.js';
import { appointments, users, services } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const TARGET_USER_ID = '68b0c8b5-9c21-41c8-9f89-171d5edbe88d';

async function createTestAppointment() {
  console.log('🚀 Creating test appointment for production...\n');
  
  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL environment variable is not set!');
    console.error('\n💡 Please set the DATABASE_URL environment variable before running this script.');
    console.error('   Example: export DATABASE_URL="postgresql://..."');
    console.error('   Or create a .env file with: DATABASE_URL=postgresql://...\n');
    process.exit(1);
  }

  try {
    // Initialize database connection
    const db = await getDatabase();

    // 1. Verify the target user exists
    console.log('📋 Step 1: Verifying user exists...');
    const targetUser = await db.select().from(users).where(eq(users.id, TARGET_USER_ID)).limit(1);
    
    if (targetUser.length === 0) {
      console.error(`❌ Error: User with ID ${TARGET_USER_ID} does not exist!`);
      process.exit(1);
    }
    
    console.log(`✅ User found: ${targetUser[0].firstName} ${targetUser[0].lastName} (${targetUser[0].email})\n`);

    // 2. Get a barber (staff user)
    console.log('📋 Step 2: Finding available barber...');
    const barbers = await db.select().from(users).where(eq(users.role, 'staff')).limit(5);
    
    if (barbers.length === 0) {
      console.error('❌ Error: No barbers (staff users) found in the database!');
      process.exit(1);
    }
    
    console.log(`✅ Found ${barbers.length} barber(s):`);
    barbers.forEach((barber, index) => {
      console.log(`   ${index + 1}. ${barber.firstName} ${barber.lastName} (ID: ${barber.id})`);
    });
    
    const selectedBarber = barbers[0];
    console.log(`\n🎯 Selected barber: ${selectedBarber.firstName} ${selectedBarber.lastName}\n`);

    // 3. Get an active service
    console.log('📋 Step 3: Finding active service...');
    const activeServices = await db.select().from(services).where(eq(services.isActive, true)).limit(5);
    
    if (activeServices.length === 0) {
      console.error('❌ Error: No active services found in the database!');
      process.exit(1);
    }
    
    console.log(`✅ Found ${activeServices.length} active service(s):`);
    activeServices.forEach((service, index) => {
      console.log(`   ${index + 1}. ${service.name} - $${service.price} (${service.duration} min) - ID: ${service.id}`);
    });
    
    const selectedService = activeServices[0];
    console.log(`\n🎯 Selected service: ${selectedService.name}\n`);

    // 4. Set appointment date and time
    // Create appointment for tomorrow at 10:00 AM
    const appointmentDate = new Date();
    appointmentDate.setDate(appointmentDate.getDate() + 1);
    appointmentDate.setHours(10, 0, 0, 0);
    
    const timeSlot = '10:00';
    
    console.log('📋 Step 4: Creating appointment...');
    console.log(`   Date: ${appointmentDate.toLocaleDateString()}`);
    console.log(`   Time: ${timeSlot}`);
    console.log(`   Status: confirmed`);

    // 5. Create the appointment
    const [newAppointment] = await db.insert(appointments).values({
      userId: TARGET_USER_ID,
      barberId: selectedBarber.id,
      serviceId: selectedService.id,
      appointmentDate: appointmentDate,
      timeSlot: timeSlot,
      status: 'confirmed',
      notes: 'Test appointment created via script for production',
      rescheduleCount: 0,
    }).returning();

    console.log('\n✅ Test appointment created successfully!\n');
    console.log('📄 Appointment Details:');
    console.log('─────────────────────────────────────────────────');
    console.log(`   ID: ${newAppointment.id}`);
    console.log(`   Customer: ${targetUser[0].firstName} ${targetUser[0].lastName}`);
    console.log(`   Customer Email: ${targetUser[0].email}`);
    console.log(`   Barber: ${selectedBarber.firstName} ${selectedBarber.lastName}`);
    console.log(`   Service: ${selectedService.name}`);
    console.log(`   Price: $${selectedService.price}`);
    console.log(`   Date: ${appointmentDate.toLocaleDateString()}`);
    console.log(`   Time: ${timeSlot}`);
    console.log(`   Status: ${newAppointment.status}`);
    console.log(`   Notes: ${newAppointment.notes}`);
    console.log('─────────────────────────────────────────────────\n');
    
    console.log('🎉 Done! The test appointment has been added to production.\n');

  } catch (error) {
    console.error('❌ Error creating test appointment:');
    console.error(error);
    process.exit(1);
  }
  
  process.exit(0);
}

createTestAppointment();
