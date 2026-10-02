#!/usr/bin/env node
/**
 * Tests unitaires légers pour publicUrl.js (sans framework).
 */
const assert = require('assert');
const path = require('path');

function runCase(name, fn) {
  try {
    fn();
    console.log(`OK ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}:`, e.message);
    process.exitCode = 1;
  }
}

delete require.cache[require.resolve(path.join(__dirname, '../backend/src/utils/publicUrl.js'))];

process.env.PUBLIC_APP_URL = 'http://localhost:5080';
process.env.INTEGRATION_PUBLIC_BASE_URL = 'https://marsa.ngrok-free.dev';

const {
  normalizeProofRelativePath,
  proofPublicUrl,
  integrationProofPublicUrl,
} = require('../backend/src/utils/publicUrl');

runCase('normalize /results/evidence_x.png', () => {
  assert.strictEqual(
    normalizeProofRelativePath('/results/evidence_abc.png'),
    '/ai/results/evidence_abc.png'
  );
});

runCase('normalize /demo_images/x.jpg', () => {
  assert.strictEqual(normalizeProofRelativePath('/demo_images/x.jpg'), '/ai/demo_images/x.jpg');
});

runCase('web vs integration base', () => {
  assert.strictEqual(
    proofPublicUrl('/results/evidence_abc.png'),
    'http://localhost:5080/ai/results/evidence_abc.png'
  );
  assert.strictEqual(
    integrationProofPublicUrl('/results/evidence_abc.png'),
    'https://marsa.ngrok-free.dev/ai/results/evidence_abc.png'
  );
});

runCase('rewrite localhost path onto integration base', () => {
  assert.strictEqual(
    integrationProofPublicUrl('http://localhost:5080/ai/results/evidence_abc.png'),
    'https://marsa.ngrok-free.dev/ai/results/evidence_abc.png'
  );
});

runCase('no integration base => null (jamais localhost:5080)', () => {
  delete require.cache[require.resolve(path.join(__dirname, '../backend/src/utils/publicUrl.js'))];
  delete process.env.INTEGRATION_PUBLIC_BASE_URL;
  delete process.env.MARSA_PUBLIC_PROXY_URL;
  delete process.env.MARSA_PUBLIC_URL;
  delete process.env.NGROK_URL;
  process.env.PUBLIC_APP_URL = 'http://localhost:5080';
  const fresh = require('../backend/src/utils/publicUrl');
  assert.strictEqual(fresh.getIntegrationPublicBase(), null);
  assert.strictEqual(fresh.integrationProofPublicUrl('/results/evidence_abc.png'), null);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log('verify-public-url: all passed');
