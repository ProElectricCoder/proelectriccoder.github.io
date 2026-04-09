/**
 * sep-crypto.js
 * Universal ES module for SEP Encryptor logic.
 * Contains key generation, XOR processing, and SEP1 extension packing.
 * Can be imported and used in both Browser and Node.js environments.
 */

export const REQUIRED_KEY_LENGTH = 1024;

/**
 * Generates a random 1024-byte key using the Crypto API.
 * @returns {Uint8Array} The generated key bytes.
 */
export function generateKeyBytes() {
    const keyBytes = new Uint8Array(REQUIRED_KEY_LENGTH);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(keyBytes);
    } else {
        // Fallback for environments lacking Web Crypto API
        for (let i = 0; i < REQUIRED_KEY_LENGTH; i++) {
            keyBytes[i] = Math.floor(Math.random() * 256);
        }
    }
    return keyBytes;
}

/**
 * Packs 1024 bytes into a UTF-16LE formatted ArrayBuffer.
 * This can be written to a .sep file or converted to a Blob.
 * @param {Uint8Array} bytes - The key bytes.
 * @returns {ArrayBuffer} The UTF-16 encoded buffer.
 */
export function generateUTF16KeyBuffer(bytes) {
    if (bytes.length !== REQUIRED_KEY_LENGTH) {
        throw new Error(`Key must be exactly ${REQUIRED_KEY_LENGTH} bytes.`);
    }
    const buffer = new ArrayBuffer(bytes.length + 2);
    const view = new DataView(buffer);
    view.setUint16(0, 0xFEFF, true); // BOM
    for (let i = 0; i < bytes.length; i += 2) {
        const charCode = (bytes[i] << 8) | (bytes[i + 1] || 0);
        view.setUint16(2 + i, charCode, true);
    }
    return buffer;
}

/**
 * Parses a UTF-16LE ArrayBuffer back into 1024 raw key bytes.
 * @param {ArrayBuffer} buffer - The buffer read from a .sep file.
 * @returns {Uint8Array} The parsed key bytes.
 */
export function parseUTF16KeyBuffer(buffer) {
    const view = new DataView(buffer);
    let startIndex = 0;
    if (buffer.byteLength >= 2 && view.getUint16(0, true) === 0xFEFF) {
        startIndex = 2; // Skip BOM
    }
    const bytes = new Uint8Array(REQUIRED_KEY_LENGTH);
    let byteIdx = 0;
    for (let i = startIndex; i < buffer.byteLength && byteIdx < REQUIRED_KEY_LENGTH; i += 2) {
        const charCode = view.getUint16(i, true);
        bytes[byteIdx++] = (charCode >> 8) & 0xFF;
        bytes[byteIdx++] = charCode & 0xFF;
    }
    return bytes;
}

/**
 * Core XOR stream cipher.
 * @param {Uint8Array} dataBytes - The data to process.
 * @param {Uint8Array} keyBytes - The 1024-byte key.
 * @returns {Uint8Array} Processed data.
 */
export function processXOR(dataBytes, keyBytes) {
    if (!keyBytes || keyBytes.length === 0) throw new Error("Key cannot be empty.");
    const output = new Uint8Array(dataBytes.length);
    for (let i = 0; i < dataBytes.length; i++) {
        output[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
    }
    return output;
}

/**
 * SEP1 Smart Extension Packing: Prepends the file extension to the raw data.
 * @param {Uint8Array} dataBytes - Raw file data.
 * @param {string} ext - Original file extension (e.g., ".txt", ".zip").
 * @returns {Uint8Array} Data packed with SEP1 header.
 */
export function packSEP1(dataBytes, ext) {
    const extBytes = new TextEncoder().encode(ext);
    const extLen = extBytes.length;
    const payload = new Uint8Array(4 + 1 + extLen + dataBytes.length);
    payload.set([83, 69, 80, 49], 0); // "SEP1" magic header
    payload[4] = extLen;
    payload.set(extBytes, 5);
    payload.set(dataBytes, 5 + extLen);
    return payload;
}

/**
 * SEP1 Smart Extension Unpacking: Extracts original extension and data.
 * @param {Uint8Array} decryptedPayload - The XOR-decrypted bytes.
 * @returns {{ data: Uint8Array, ext: string }} Object containing raw data and extension.
 */
export function unpackSEP1(decryptedPayload) {
    const hasMagic = decryptedPayload.length > 4 && 
        decryptedPayload[0] === 83 && decryptedPayload[1] === 69 && 
        decryptedPayload[2] === 80 && decryptedPayload[3] === 49;
    
    if (hasMagic) {
        const extLen = decryptedPayload[4];
        const ext = new TextDecoder().decode(decryptedPayload.slice(5, 5 + extLen));
        return { data: decryptedPayload.slice(5 + extLen), ext: ext };
    }
    return { data: decryptedPayload, ext: '' };
}

/**
 * High-level encryption combining SEP1 packing and XOR processing.
 * @param {Uint8Array} dataBytes - Raw file data.
 * @param {string} extension - File extension to preserve (e.g. ".pdf").
 * @param {Uint8Array} keyBytes - 1024-byte encryption key.
 * @returns {Uint8Array} The final encrypted .enc file bytes.
 */
export function encryptFile(dataBytes, extension, keyBytes) {
    if (keyBytes.length !== REQUIRED_KEY_LENGTH) throw new Error(`Invalid key length: Expected ${REQUIRED_KEY_LENGTH} bytes.`);
    const payload = packSEP1(dataBytes, extension);
    return processXOR(payload, keyBytes);
}

/**
 * High-level decryption combining XOR processing and SEP1 unpacking.
 * @param {Uint8Array} encryptedBytes - The raw bytes of the .enc file.
 * @param {Uint8Array} keyBytes - 1024-byte encryption key.
 * @returns {{ data: Uint8Array, ext: string }} Original file data and preserved extension.
 */
export function decryptFile(encryptedBytes, keyBytes) {
    if (keyBytes.length !== REQUIRED_KEY_LENGTH) throw new Error(`Invalid key length: Expected ${REQUIRED_KEY_LENGTH} bytes.`);
    const decryptedPayload = processXOR(encryptedBytes, keyBytes);
    return unpackSEP1(decryptedPayload);
}

/*
=============================================================================
USAGE EXAMPLE:
=============================================================================
import { generateKeyBytes, encryptFile, decryptFile } from './sep-crypto.js';

// 1. Generate Key
const myKey = generateKeyBytes();

// 2. Encrypt (assuming 'rawFileBytes' is a Uint8Array of your file)
const originalExtension = ".txt"; // The extension you want to preserve
const encryptedData = encryptFile(rawFileBytes, originalExtension, myKey);

// 3. Decrypt
const decryptedResult = decryptFile(encryptedData, myKey);
// decryptedResult.data -> Uint8Array (the original file bytes)
// decryptedResult.ext -> ".txt" (the preserved extension)
=============================================================================
*/
