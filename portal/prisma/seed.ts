import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial settings and configurations...');

  const initialSettings = [
    { key: 'minutes_per_peso', value: '10' },
    { key: 'portal_title', value: 'OpenPisoWiFi' },
    { key: 'admin_pin', value: '1234' },
    {
      key: 'rates_config',
      value: JSON.stringify([
        { amount: 1, minutes: 10, label: '10 Mins', popular: false },
        { amount: 5, minutes: 60, label: '1 Hour', popular: true },
        { amount: 10, minutes: 150, label: '2.5 Hours', popular: false },
        { amount: 20, minutes: 360, label: '6 Hours', popular: false },
        { amount: 50, minutes: 1440, label: '24 Hours (1 Day)', popular: false },
      ]),
    },
    {
      key: 'banner_message',
      value: 'Fast & Affordable High-Speed Wi-Fi. Insert coins or redeem a voucher code to start browsing.',
    },
  ];

  for (const s of initialSettings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }

  // Create a sample demo voucher for testing
  await prisma.voucher.upsert({
    where: { code: 'WELCOME60' },
    update: {},
    create: {
      code: 'WELCOME60',
      durationMinutes: 60,
      amountEquivalent: 5,
      isUsed: false,
    },
  });

  console.log('Database seeded successfully.');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
