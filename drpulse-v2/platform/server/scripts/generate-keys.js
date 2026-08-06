#!/usr/bin/env node
/**
 * Generate the RSA key pair used for RS256 JWT signing.
 * Run ONCE before starting the platform.
 *
 * Usage:  node scripts/generate-keys.js
 * Output: platform/server/keys/private.pem  ← NEVER commit this
 *         platform/server/keys/public.pem   ← copy to each product app
 */

const { generateKeyPairSync } = require('crypto');
const fs   = require('fs');
const path = require('path');

const keysDir = path.join(__dirname, '..', 'keys');
fs.mkdirSync(keysDir, { recursive: true });

console.log('Generating 2048-bit RSA key pair...');

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength:  2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

fs.writeFileSync(path.join(keysDir, 'private.pem'), privateKey, { mode: 0o600 });
fs.writeFileSync(path.join(keysDir, 'public.pem'),  publicKey);

console.log('\n✓ keys/private.pem  — keep on platform server only');
console.log('✓ keys/public.pem   — copy to every product app\n');
console.log('Add to platform .env:');
console.log('  JWT_PRIVATE_KEY_PATH=./keys/private.pem');
console.log('  JWT_PUBLIC_KEY_PATH=./keys/public.pem\n');
console.log('⚠  Add keys/ to .gitignore immediately.\n');
