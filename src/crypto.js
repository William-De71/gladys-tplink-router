// -----------------------------------------------------------------------------
// The ciphers of the TP-Link / Mercusys web interface, without dependency.
//
// The login page of the router hands out RSA public keys as hex strings
// (modulus, exponent): the password is RSA-encrypted with one, the signature
// of every request with the other; the requests themselves are AES-128-CBC
// encrypted with a key the client makes up and announces in the login
// signature.
//
// RSA is written with BigInt rather than node:crypto: some firmwares (Archer
// AX72) serve 512-bit keys, which OpenSSL 3 may refuse, and PKCS#1 v1.5 is
// what the router expects. The random bytes come from a function the tests
// can replace.
// -----------------------------------------------------------------------------

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

const SHA1_LENGTH = 20;

/**
 * @description (base ^ exponent) mod modulus.
 * @param {bigint} base - The base.
 * @param {bigint} exponent - The exponent.
 * @param {bigint} modulus - The modulus.
 * @returns {bigint} The result.
 */
function modPow(base, exponent, modulus) {
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) {
      result = (result * b) % modulus;
    }
    b = (b * b) % modulus;
    e >>= 1n;
  }
  return result;
}

/**
 * @description A public key out of the hex strings of the router.
 * @param {string} modulusHex - The modulus.
 * @param {string} exponentHex - The exponent ("010001").
 * @returns {{ n: bigint, e: bigint, size: number }} The key, `size` in bytes.
 */
function publicKey(modulusHex, exponentHex) {
  const n = BigInt(`0x${modulusHex}`);
  const e = BigInt(`0x${exponentHex}`);
  if (n <= 0n || e <= 0n) {
    throw new Error('Invalid RSA key');
  }
  return { n, e, size: Math.ceil(n.toString(16).length / 2) };
}

/**
 * @description Raw RSA of an encoded message: the cipher text in hex, as long
 * as the modulus.
 * @param {Buffer} encoded - The padded message, `size` bytes.
 * @param {{ n: bigint, e: bigint, size: number }} key - The key.
 * @returns {string} The hex cipher text.
 */
function rsaRaw(encoded, key) {
  const c = modPow(BigInt(`0x${encoded.toString('hex')}`), key.e, key.n);
  return c.toString(16).padStart(key.size * 2, '0');
}

/**
 * @description RSA with PKCS#1 v1.5 padding (type 2).
 * @param {string|Buffer} message - The message.
 * @param {string} modulusHex - The modulus.
 * @param {string} exponentHex - The exponent.
 * @param {Function} [random] - `(length) => Buffer`.
 * @returns {string} The hex cipher text.
 * @example
 * rsaPkcs1('secret', key[0], key[1]);
 */
function rsaPkcs1(message, modulusHex, exponentHex, random = randomBytes) {
  const key = publicKey(modulusHex, exponentHex);
  const data = Buffer.isBuffer(message) ? message : Buffer.from(message, 'utf8');
  const padLength = key.size - data.length - 3;
  if (padLength < 8) {
    throw new Error('Message too long for the RSA key');
  }
  // Non-zero random padding bytes.
  const padding = Buffer.alloc(padLength);
  let filled = 0;
  while (filled < padLength) {
    for (const byte of random(padLength)) {
      if (byte !== 0 && filled < padLength) {
        padding[filled] = byte;
        filled += 1;
      }
    }
  }
  return rsaRaw(Buffer.concat([Buffer.from([0, 2]), padding, Buffer.from([0]), data]), key);
}

/**
 * @description MGF1 with SHA-1.
 * @param {Buffer} seed - The seed.
 * @param {number} length - The mask length.
 * @returns {Buffer} The mask.
 */
function mgf1(seed, length) {
  const blocks = [];
  for (let counter = 0; blocks.length * SHA1_LENGTH < length; counter += 1) {
    const c = Buffer.alloc(4);
    c.writeUInt32BE(counter);
    blocks.push(createHash('sha1').update(seed).update(c).digest());
  }
  return Buffer.concat(blocks).subarray(0, length);
}

/**
 * @description RSA with OAEP padding (SHA-1, MGF1, empty label), the default
 * of pycryptodome and of the router's JavaScript.
 * @param {string|Buffer} message - The message.
 * @param {string} modulusHex - The modulus.
 * @param {string} exponentHex - The exponent.
 * @param {Function} [random] - `(length) => Buffer`.
 * @returns {string} The hex cipher text.
 */
function rsaOaep(message, modulusHex, exponentHex, random = randomBytes) {
  const key = publicKey(modulusHex, exponentHex);
  const data = Buffer.isBuffer(message) ? message : Buffer.from(message, 'utf8');
  const k = key.size;
  if (data.length > k - 2 * SHA1_LENGTH - 2) {
    throw new Error('Message too long for the RSA key');
  }
  const labelHash = createHash('sha1').digest();
  const db = Buffer.concat([
    labelHash,
    Buffer.alloc(k - data.length - 2 * SHA1_LENGTH - 2),
    Buffer.from([1]),
    data,
  ]);
  const seed = random(SHA1_LENGTH);
  const dbMask = mgf1(seed, db.length);
  const maskedDb = Buffer.from(db.map((byte, i) => byte ^ dbMask[i]));
  const seedMask = mgf1(maskedDb, SHA1_LENGTH);
  const maskedSeed = Buffer.from(seed.map((byte, i) => byte ^ seedMask[i]));
  return rsaRaw(Buffer.concat([Buffer.from([0]), maskedSeed, maskedDb]), key);
}

/**
 * @description The largest OAEP chunk a key takes, capped at `cap`.
 * @param {string} modulusHex - The modulus.
 * @param {number} cap - The cap (53, the PKCS#1 v1.5 chunk of the router).
 * @returns {number} The chunk length.
 */
const oaepStep = (modulusHex, cap) =>
  Math.min(cap, publicKey(modulusHex, '1').size - 2 * SHA1_LENGTH - 2);

/**
 * @description AES-128-CBC with PKCS#7 padding, base64. The key and the IV are
 * 16-character strings (their ASCII bytes are the key).
 * @param {string} key - The key.
 * @param {string} iv - The IV.
 * @param {string} text - The clear text.
 * @returns {string} The base64 cipher text.
 */
function aesEncrypt(key, iv, text) {
  const cipher = createCipheriv(
    'aes-128-cbc',
    Buffer.from(key, 'latin1'),
    Buffer.from(iv, 'latin1'),
  );
  return Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]).toString('base64');
}

/**
 * @description The reverse of aesEncrypt. The padding is removed without
 * checking it, as the router's own JavaScript does; invalid UTF-8 (a device
 * name typed in an app) is replaced rather than failing the whole answer.
 * @param {string} key - The key.
 * @param {string} iv - The IV.
 * @param {string} base64 - The cipher text.
 * @returns {string} The clear text.
 */
function aesDecrypt(key, iv, base64) {
  const decipher = createDecipheriv(
    'aes-128-cbc',
    Buffer.from(key, 'latin1'),
    Buffer.from(iv, 'latin1'),
  );
  decipher.setAutoPadding(false);
  const clear = Buffer.concat([decipher.update(Buffer.from(base64, 'base64')), decipher.final()]);
  const pad = clear.length > 0 ? clear[clear.length - 1] : 0;
  return clear
    .subarray(0, pad > 0 && pad <= 16 ? clear.length - pad : clear.length)
    .toString('utf8');
}

const md5 = (text) => createHash('md5').update(text, 'utf8').digest('hex');
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const hmacSha256 = (key, text) => createHmac('sha256', key).update(text, 'utf8').digest('hex');

/**
 * @description Split a string into chunks.
 * @param {string} text - The text.
 * @param {number} size - The chunk length.
 * @returns {string[]} The chunks.
 */
function chunks(text, size) {
  const list = [];
  for (let i = 0; i < text.length; i += size) {
    list.push(text.slice(i, i + size));
  }
  return list;
}

export {
  modPow,
  publicKey,
  rsaPkcs1,
  rsaOaep,
  oaepStep,
  mgf1,
  aesEncrypt,
  aesDecrypt,
  md5,
  sha256,
  hmacSha256,
  chunks,
};
