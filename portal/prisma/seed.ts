import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

function hashPin(pin: string): string {
  const saltHex = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pin.trim(), saltHex, 64);
  return `scrypt:${saltHex}:${derived.toString('hex')}`;
}

async function main() {
  console.log('Seeding initial settings and configurations...');

  const initialPin = process.env.ADMIN_PIN || '1234';
  const initialSettings = [
    { key: 'minutes_per_peso', value: '10' },
    { key: 'portal_title', value: 'OpenPisoWiFi' },
    { key: 'admin_pin', value: hashPin(initialPin) },
    { key: 'show_coin_simulator', value: 'false' },
    // Canonical BCM GPIO defaults
    { key: 'coin_gpio_pin', value: '4' },
    { key: 'inhibit_gpio_pin', value: '17' },
    { key: 'button_gpio_pin', value: '27' },
    { key: 'inhibit_mode', value: 'high' },
    { key: 'gpio_backend', value: 'auto' },
    { key: 'board_profile', value: 'rpi' },
    { key: 'pulse_multiplier', value: '1' },
    // OpenPiso Shield defaults
    { key: 'shield_owe_mode', value: 'owe_5g' },
    { key: 'shield_client_isolation', value: 'true' },
    { key: 'shield_anti_tethering', value: 'false' },
    { key: 'shield_block_random_mac_trial', value: 'true' },
    { key: 'shield_storm_shield_enabled', value: 'true' },
    { key: 'shield_wids_enabled', value: 'true' },
    { key: 'shield_iot_ssid', value: '' },
    { key: 'shield_iot_passphrase', value: '' },
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
