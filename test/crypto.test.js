import { test } from 'node:test';
import assert from 'node:assert/strict';
import { privateDecrypt, constants } from 'node:crypto';

import {
  rsaPkcs1,
  rsaOaep,
  oaepStep,
  aesEncrypt,
  aesDecrypt,
  md5,
  sha256,
  hmacSha256,
  chunks,
} from '../src/crypto.js';
import { keyPair, decryptPkcs1 } from './helpers/fixtures.js';

test('PKCS#1 v1.5: the router key decrypts it, on 512, 1024 and 2048-bit keys', () => {
  for (const bits of [512, 1024, 2048]) {
    const key = keyPair(bits);
    const cipher = rsaPkcs1('secret-password', key.n, key.e);
    assert.equal(cipher.length, key.size * 2, `${bits}: as long as the modulus`);
    assert.equal(decryptPkcs1(cipher, key), 'secret-password', `${bits}`);
    // Random padding: never twice the same cipher text.
    assert.notEqual(rsaPkcs1('secret-password', key.n, key.e), cipher);
  }
});

test('PKCS#1 v1.5 refuses a message the key cannot hold', () => {
  const key = keyPair(512);
  assert.throws(() => rsaPkcs1('x'.repeat(60), key.n, key.e), /too long/);
});

test('OAEP (SHA-1): OpenSSL decrypts it, and the chunk fits the key', () => {
  for (const bits of [512, 1024]) {
    const key = keyPair(bits);
    const step = oaepStep(key.n, 53);
    assert.equal(step, bits === 512 ? 22 : 53);
    const text = 'k=0123456789abcdef&i=fedcba9876543210&h=abcdef'.slice(0, step);
    const cipher = rsaOaep(text, key.n, key.e);
    const clear = privateDecrypt(
      { key: key.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING },
      Buffer.from(cipher, 'hex'),
    ).toString();
    assert.equal(clear, text);
  }
  const small = keyPair(512);
  assert.throws(() => rsaOaep('x'.repeat(23), small.n, small.e), /too long/);
});

test('AES-128-CBC with the ASCII key and IV, both ways; a bad UTF-8 name does not break', () => {
  const key = '0123456789abcdef';
  const iv = 'fedcba9876543210';
  const cipher = aesEncrypt(key, iv, '{"operation":"read"}');
  assert.equal(aesDecrypt(key, iv, cipher), '{"operation":"read"}');
  assert.equal(aesDecrypt(key, iv, aesEncrypt(key, iv, '')), '');
  assert.equal(aesDecrypt(key, iv, aesEncrypt(key, iv, 'é'.repeat(20))), 'é'.repeat(20));
});

test('hashes and chunks', () => {
  assert.equal(md5(''), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(hmacSha256('k', 'v').length, 64);
  assert.deepEqual(chunks('abcdefg', 3), ['abc', 'def', 'g']);
  assert.deepEqual(chunks('', 3), []);
});
