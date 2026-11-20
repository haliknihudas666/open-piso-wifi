import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  hashPin,
  verifyPin,
  createAdminSessionCookie,
  verifyAdminSessionCookie,
  isInternalDaemonRequest,
  maskSecret,
  isBlankOrMaskedSecret,
} from '../lib/admin-auth';
import { cleanIpv4, isRandomizedMac } from '../lib/arp';
import { getTrustedClientIp } from '../lib/client-ip';
import {
  ADMIN_LOGIN_POLICY,
  VOUCHER_ATTEMPT_POLICY,
  checkRateLimit,
  recordRateLimitFailure,
  clearRateLimit,
  resetAllRateLimits,
} from '../lib/rate-limit';
import {
  calculateDurationFromAmount,
  DEFAULT_PROMO_TIERS,
  DEFAULT_RATE_TIERS,
  isPromoActive,
} from '../lib/rates';
import {
  generateSecureTransferCode,
  generateSecureVoucherCode,
} from '../lib/secure-codes';

async function runSecurityTests() {
  console.log('🔐 Starting OpenPisoWiFi Portal Security Test Suite...\n');

  // 1. scrypt PIN hashing, verification & legacy plaintext upgrade flow
  console.log('Test 1: scrypt PIN hashing & legacy plaintext verification/upgrade...');
  const legacyPin = '5678';
  assert.equal(verifyPin('5678', legacyPin), true, 'Legacy plaintext PIN should verify');
  assert.equal(verifyPin('9999', legacyPin), false, 'Wrong PIN should fail against legacy plaintext');

  // Simulate auto-upgrade to scrypt:<salt>:<hash>
  const upgradedHash = hashPin(legacyPin);
  assert.ok(upgradedHash.startsWith('scrypt:'), 'Upgraded hash must use scrypt: prefix');
  const hashParts = upgradedHash.split(':');
  assert.equal(hashParts.length, 3, 'scrypt hash format must have 3 colon-separated parts');
  assert.equal(hashParts[1].length, 32, 'Salt must be 16-byte hex (32 chars)');
  assert.equal(hashParts[2].length, 128, 'Derived scrypt hash must be 64-byte hex (128 chars)');
  assert.equal(verifyPin('5678', upgradedHash), true, 'Correct PIN should verify against scrypt hash');
  assert.equal(verifyPin('5679', upgradedHash), false, 'Wrong PIN should fail against scrypt hash');
  assert.equal(verifyPin('', upgradedHash), false, 'Empty PIN must be rejected');
  assert.notEqual(hashPin('5678'), upgradedHash, 'Unique random salt must produce unique hashes');
  console.log('✓ scrypt PIN hashing & legacy upgrade passed');

  // 2. HMAC Admin Session Cookie sign, verify & tamper rejection
  console.log('\nTest 2: HMAC admin cookie sign / verify / tamper detection...');
  const testSecret = 'test-daemon-api-secret-0123456789abcdef';
  const prevSecret = process.env.DAEMON_API_SECRET;
  process.env.DAEMON_API_SECRET = testSecret;

  const cookieVal = await createAdminSessionCookie();
  assert.ok(cookieVal.includes('.'), 'Session cookie must contain payload.signature');
  assert.equal(await verifyAdminSessionCookie(cookieVal), true, 'Valid session cookie must verify');

  // Tamper payload
  const [payloadB64, sigHex] = cookieVal.split('.');
  const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  decoded.exp = decoded.exp + 99999;
  const tamperedPayload = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');
  assert.equal(
    await verifyAdminSessionCookie(`${tamperedPayload}.${sigHex}`),
    false,
    'Tampered payload must fail HMAC verification'
  );

  // Tamper signature
  const flippedSig = (sigHex[0] === 'a' ? 'b' : 'a') + sigHex.slice(1);
  assert.equal(
    await verifyAdminSessionCookie(`${payloadB64}.${flippedSig}`),
    false,
    'Tampered signature must fail verification'
  );

  // Expired token rejection
  const expiredPayload = Buffer.from(
    JSON.stringify({ v: 1, role: 'admin', iat: 1000, exp: 1001, jti: 'deadbeef' }),
    'utf8'
  ).toString('base64url');
  const expiredSig = crypto.createHmac('sha256', testSecret).update(expiredPayload).digest('hex');
  assert.equal(
    await verifyAdminSessionCookie(`${expiredPayload}.${expiredSig}`),
    false,
    'Expired admin cookie must be rejected'
  );
  console.log('✓ HMAC admin cookie sign/verify/tamper passed');

  // 3. Trusted Client IP & x-proxy-auth HMAC verification
  console.log('\nTest 3: Trusted Client IP & x-proxy-auth HMAC verification...');
  const prevNodeEnv = process.env.NODE_ENV;
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
  const validClientIp = '192.168.1.77';
  const validHmac = crypto.createHmac('sha256', testSecret).update(validClientIp).digest('hex');

  assert.equal(
    getTrustedClientIp({
      headers: new Headers({
        'x-real-ip': validClientIp,
        'x-proxy-auth': validHmac,
        'x-forwarded-for': '10.9.9.9, 1.2.3.4',
      }),
    }),
    validClientIp,
    'Valid x-proxy-auth must return verified x-real-ip and ignore x-forwarded-for'
  );

  assert.equal(
    getTrustedClientIp({
      headers: new Headers({
        'x-real-ip': validClientIp,
        'x-proxy-auth': 'deadbeef'.repeat(8),
        'x-forwarded-for': '192.168.1.99',
      }),
    }),
    '127.0.0.1',
    'Forged x-proxy-auth in production must reject spoofed IP headers'
  );

  assert.equal(
    getTrustedClientIp({
      headers: new Headers({
        'x-forwarded-for': '192.168.1.99, 10.0.0.5',
      }),
    }),
    '127.0.0.1',
    'Production must NEVER trust multi-hop x-forwarded-for when x-real-ip is missing'
  );

  assert.equal(
    getTrustedClientIp({
      headers: new Headers({
        'x-real-ip': '192.168.1.88',
      }),
    }),
    '192.168.1.88',
    'Production transition safety accepts single strict IPv4 x-real-ip when x-proxy-auth is absent'
  );

  // Restore env
  (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv;
  if (prevSecret === undefined) delete process.env.DAEMON_API_SECRET;
  else process.env.DAEMON_API_SECRET = prevSecret;
  console.log('✓ Trusted Client IP checks passed');

  // 4. cleanIpv4 strict validation & command injection rejection
  console.log('\nTest 4: cleanIpv4 injection rejection...');
  assert.equal(cleanIpv4('192.168.1.50'), '192.168.1.50');
  assert.equal(cleanIpv4('::ffff:192.168.1.50'), '192.168.1.50');
  assert.equal(cleanIpv4('0.0.0.0'), '0.0.0.0');
  assert.equal(cleanIpv4('255.255.255.255'), '255.255.255.255');

  const maliciousInputs = [
    '',
    '192.168.1.1; rm -rf /',
    '192.168.1.1 && whoami',
    '192.168.1.1 | cat /etc/passwd',
    '192.168.1.1$(id)',
    '192.168.1.1`id`',
    '256.1.1.1',
    '999.999.999.999',
    '192.168.1',
    '192.168.1.1.2',
    '192.168.01.1',
    '192.168.1.1, 10.0.0.1',
    '::1',
    'localhost',
  ];
  for (const bad of maliciousInputs) {
    assert.equal(cleanIpv4(bad), '', `cleanIpv4 must reject "${bad}" with ""`);
  }
  console.log('✓ cleanIpv4 rejected all 14 invalid/injection inputs');

  // 5. isRandomizedMac (IEEE 802.11 locally administered bit 0x02)
  console.log('\nTest 5: isRandomizedMac detection...');
  assert.equal(isRandomizedMac('da:a1:19:11:22:33'), true, '0xda has 0x02 bit set');
  assert.equal(isRandomizedMac('02:00:00:00:00:01'), true, '0x02 has 0x02 bit set');
  assert.equal(isRandomizedMac('F6-12-34-56-78-9A'), true, '0xf6 has 0x02 bit set');
  assert.equal(isRandomizedMac('b8:27:eb:12:34:56'), false, 'Raspberry Pi OUI 0xb8 is globally unique');
  assert.equal(isRandomizedMac('00:11:22:33:44:55'), false, '0x00 is globally unique');
  assert.equal(isRandomizedMac('not-a-mac'), false, 'Invalid MAC returns false');
  console.log('✓ isRandomizedMac passed');

  // 6. Rate limiter (5 login failures -> 15 min lockout; 10 voucher failures -> lockout)
  console.log('\nTest 6: Rate limiter lockout & window reset...');
  resetAllRateLimits();
  const attackerIp = '192.168.1.200';
  const baseTime = 1_700_000_000_000;

  for (let i = 1; i <= 4; i++) {
    assert.equal(checkRateLimit('admin_login', attackerIp, ADMIN_LOGIN_POLICY, baseTime + i * 1000).allowed, true);
    const res = recordRateLimitFailure('admin_login', attackerIp, ADMIN_LOGIN_POLICY, baseTime + i * 1000);
    assert.equal(res.locked, false, `Attempt ${i} should not lock yet`);
  }
  const fifth = recordRateLimitFailure('admin_login', attackerIp, ADMIN_LOGIN_POLICY, baseTime + 5000);
  assert.equal(fifth.locked, true, '5th failure must trigger 15-min lockout');
  assert.equal(fifth.retryAfterSeconds, 900);

  const blockedCheck = checkRateLimit('admin_login', attackerIp, ADMIN_LOGIN_POLICY, baseTime + 60_000);
  assert.equal(blockedCheck.allowed, false, 'Should stay locked during 15-min window');
  assert.ok(blockedCheck.retryAfterSeconds > 800);

  const expiredLockCheck = checkRateLimit(
    'admin_login',
    attackerIp,
    ADMIN_LOGIN_POLICY,
    baseTime + 5000 + ADMIN_LOGIN_POLICY.lockoutMs + 1
  );
  assert.equal(expiredLockCheck.allowed, true, 'Lockout should expire after 15 mins');

  clearRateLimit('admin_login', attackerIp);

  for (let i = 1; i <= 9; i++) {
    const res = recordRateLimitFailure('voucher_ip', attackerIp, VOUCHER_ATTEMPT_POLICY, baseTime + i);
    assert.equal(res.locked, false);
  }
  const tenth = recordRateLimitFailure('voucher_ip', attackerIp, VOUCHER_ATTEMPT_POLICY, baseTime + 10);
  assert.equal(tenth.locked, true, '10th voucher failure must lock');
  assert.equal(checkRateLimit('voucher_ip', attackerIp, VOUCHER_ATTEMPT_POLICY, baseTime + 1000).allowed, false);
  resetAllRateLimits();
  console.log('✓ Rate limiter passed');

  // 7. Promo rate calculation & Night Owl wraparound
  console.log('\nTest 7: Promo rates window & duration calculation...');
  assert.equal(isPromoActive(22, 6, 23), true, '23:00 is in 22..6 overnight promo');
  assert.equal(isPromoActive(22, 6, 3), true, '03:00 is in 22..6 overnight promo');
  assert.equal(isPromoActive(22, 6, 6), false, '06:00 boundary ends overnight promo');
  assert.equal(isPromoActive(22, 6, 14), false, '14:00 is outside 22..6 promo');
  assert.equal(isPromoActive(12, 14, 13), true, '13:00 is in 12..14 daytime promo');

  const standardMins = calculateDurationFromAmount(10, DEFAULT_RATE_TIERS, 10);
  const promoMins = calculateDurationFromAmount(10, DEFAULT_PROMO_TIERS, 10);
  assert.equal(standardMins, 150, 'Standard ₱10 should be 150 mins');
  assert.equal(promoMins, 360, 'Night Owl promo ₱10 should be 360 mins');
  console.log('✓ Promo calculation passed');

  // 8. Secure voucher & transfer code generators + secret helpers
  console.log('\nTest 8: Secure code generation & secret masking...');
  const seenCodes = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const vCode = generateSecureVoucherCode();
    const tCode = generateSecureTransferCode();
    assert.match(vCode, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    assert.match(tCode, /^PW-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    assert.ok(!seenCodes.has(tCode), 'Generated transfer codes must not collide');
    seenCodes.add(tCode);
  }
  assert.equal(maskSecret('7123456789:AAHsecretToken1234'), '7123...1234');
  assert.equal(maskSecret(''), null);
  assert.equal(isBlankOrMaskedSecret('7123...1234'), true);
  assert.equal(isBlankOrMaskedSecret('••••••••'), true);
  assert.equal(isBlankOrMaskedSecret('7123456789:AAHrealNewToken'), false);

  process.env.DAEMON_API_SECRET = testSecret;
  assert.equal(
    isInternalDaemonRequest({ headers: new Headers({ 'x-daemon-secret': testSecret }) }),
    true
  );
  assert.equal(
    isInternalDaemonRequest({ headers: new Headers({ 'x-daemon-secret': 'wrong-secret' }) }),
    false
  );
  if (prevSecret === undefined) delete process.env.DAEMON_API_SECRET;
  else process.env.DAEMON_API_SECRET = prevSecret;
  console.log('✓ Secure code generation & secret masking passed');

  console.log('\n🎉 ALL PORTAL SECURITY TESTS PASSED SUCCESSFULLY!');
}

runSecurityTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Security test failed:', err);
    process.exit(1);
  });
