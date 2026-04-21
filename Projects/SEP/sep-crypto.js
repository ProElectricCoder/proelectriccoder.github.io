/*
 • sep-crypto.js (v5 - Layered SEP + AES-GCM with ZIP)
 • Universal ES module for Double Encryptor logic.
 • Layer 1: SEP1 Packing & XOR Cipher
 • Layer 2: PBKDF2 Key Derivation & AES-GCM Encryption
*/

export function getCryptoRandom(length) {
    return crypto.getRandomValues(new Uint8Array(length));
}

export async function compressData(dataBytes) {
    const stream = new Response(dataBytes).body.pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function decompressData(dataBytes) {
    const stream = new Response(dataBytes).body.pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ==========================================
// LAYER 1: SEP LOGIC (XOR + Packing)
// ==========================================

export const REQUIRED_KEY_LENGTH = 1024;
export const CRYPTO_VERSION = 5;

export function generateRandomKey(keyLength = REQUIRED_KEY_LENGTH) {
    return getCryptoRandom(keyLength);
}

export function createKeyFromPassword(passwordString, keyLength = REQUIRED_KEY_LENGTH, salt = new Uint8Array(0)) {
    const encoder = new TextEncoder();
    const passBytes = encoder.encode(passwordString);
    
    if (passBytes.length === 0) throw new Error("Password cannot be empty.");

    const combined = new Uint8Array(passBytes.length + salt.length);
    combined.set(passBytes, 0);
    combined.set(salt, passBytes.length);

    const keyBytes = new Uint8Array(keyLength);

    // Stretch the combined password+salt to fill exactly keyLength bytes
    for (let i = 0; i < keyLength; i++) {
        keyBytes[i] = combined[i % combined.length];
    }
    return keyBytes;
}

export function processXOR(dataBytes, keyBytes) {
    if (!keyBytes || keyBytes.length === 0) throw new Error("Key cannot be empty.");
    const output = new Uint8Array(dataBytes.length);
    for (let i = 0; i < dataBytes.length; i++) {
        output[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
    }
    return output;
}

export function packSEP1(dataBytes, ext) {
    const extBytes = new TextEncoder().encode(ext);
    const extLen = extBytes.length;
    const payload = new Uint8Array(4 + 1 + 1 + extLen + dataBytes.length);
    payload.set([83, 69, 80, 49], 0); // "SEP1" magic header
    payload[4] = CRYPTO_VERSION;      // Store version
    payload[5] = extLen;              // Store extension length
    payload.set(extBytes, 6);
    payload.set(dataBytes, 6 + extLen);
    return payload;
}

export function unpackSEP1(decryptedPayload) {
    const hasMagic = decryptedPayload.length > 5 && 
        decryptedPayload[0] === 83 && decryptedPayload[1] === 69 && 
        decryptedPayload[2] === 80 && decryptedPayload[3] === 49;

    if (hasMagic) {
        const version = decryptedPayload[4];
        if (version !== CRYPTO_VERSION) {
            console.warn(`Version mismatch: File uses v${version}, decryptor uses v${CRYPTO_VERSION}`);
        }
        const extLen = decryptedPayload[5];
        const ext = new TextDecoder().decode(decryptedPayload.slice(6, 6 + extLen));
        return { data: decryptedPayload.slice(6 + extLen), ext: ext, version: version };
    }
    return { data: decryptedPayload, ext: '', version: null };
}

/** Standalone SEP Encryption */
export async function encryptSEP(dataBytes, extension, passwordString, keyLength = REQUIRED_KEY_LENGTH) {
    const compressedData = await compressData(dataBytes);
    const salt = getCryptoRandom(16);
    const packedPayload = packSEP1(compressedData, extension);
    const xorKey = createKeyFromPassword(passwordString, keyLength, salt);
    const encryptedPayload = processXOR(packedPayload, xorKey);
    
    const finalBytes = new Uint8Array(16 + encryptedPayload.length);
    finalBytes.set(salt, 0);
    finalBytes.set(encryptedPayload, 16);
    return finalBytes;
}

/** Standalone SEP Decryption */
export async function decryptSEP(encryptedBytes, passwordString, keyLength = REQUIRED_KEY_LENGTH) {
    if (encryptedBytes.length < 16) throw new Error("SEP Decryption failed! Corrupted data or missing salt.");
    const salt = encryptedBytes.slice(0, 16);
    const cipherData = encryptedBytes.slice(16);

    const xorKey = createKeyFromPassword(passwordString, keyLength, salt);
    const unpacked = processXOR(cipherData, xorKey);
    const unpackedResult = unpackSEP1(unpacked);
    
    const decompressedData = await decompressData(unpackedResult.data);
    return { data: decompressedData, ext: unpackedResult.ext, version: unpackedResult.version };
}

// ==========================================
// LAYER 2: THE AES-GCM SHIELD
// ==========================================
async function deriveAESKey(passwordString, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(passwordString),
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
    );

    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000, 
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

/** Standalone AES-GCM Encryption */
export async function encryptAES(dataBytes, passwordString) {
    if (!passwordString) throw new Error("Password cannot be empty.");

    const compressedData = await compressData(dataBytes);
    const salt = getCryptoRandom(16);
    const iv = getCryptoRandom(12);
    const aesKey = await deriveAESKey(passwordString, salt);

    const aesCipherBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        aesKey,
        compressedData
    );
    const aesCipherBytes = new Uint8Array(aesCipherBuffer);

    // Package final file: [Salt] + [IV] + [Encrypted Data]
    const finalBytes = new Uint8Array(16 + 12 + aesCipherBytes.length);
    finalBytes.set(salt, 0);
    finalBytes.set(iv, 16);
    finalBytes.set(aesCipherBytes, 16 + 12);

    return finalBytes;
}

/** Standalone AES-GCM Decryption */
export async function decryptAES(encryptedBytes, passwordString) {
    if (!passwordString) throw new Error("Password cannot be empty.");
    if (encryptedBytes.length < 28) throw new Error("File is corrupted or too small.");

    const salt = encryptedBytes.slice(0, 16);
    const iv = encryptedBytes.slice(16, 28);
    const aesCipherBytes = encryptedBytes.slice(28);

    try {
        const aesKey = await deriveAESKey(passwordString, salt);
        const decryptedBuffer = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            aesKey,
            aesCipherBytes
        );
        return await decompressData(new Uint8Array(decryptedBuffer));
    } catch (error) {
        throw new Error("AES Decryption failed! Incorrect password or corrupted data.");
    }
}

// ==========================================
// MASTER FUNCTIONS: LAYERED ENCRYPTION
// ==========================================

/**
 * Encrypts the data using SEP1 + XOR, then wraps it in AES-GCM.
 */
export async function encryptFile(dataBytes, extension, passwordString, keyLength = REQUIRED_KEY_LENGTH) {
    // 1. Layer 1 (SEP)
    const sepEncrypted = await encryptSEP(dataBytes, extension, passwordString, keyLength);
    // 2. Layer 2 (AES)
    return await encryptAES(sepEncrypted, passwordString);
}

/**
 * Decrypts the AES-GCM layer, then undoes the XOR and SEP1 packing.
 */
export async function decryptFile(encryptedBytes, passwordString, keyLength = REQUIRED_KEY_LENGTH) {
    // 1. Layer 2 (AES)
    const aesDecrypted = await decryptAES(encryptedBytes, passwordString);
    // 2. Layer 1 (SEP)
    return await decryptSEP(aesDecrypted, passwordString, keyLength);
}

/*
=============================================================================
USAGE EXAMPLE:
=============================================================================

import { encryptFile, decryptFile } from 'https://proelectriccoder.github.io/Projects/sep-crypto.js';

async function demo() {
    // Mock file data (e.g., read via FileReader or fs.readFile)
    const rawFileBytes = new TextEncoder().encode("Hello, World!"); 
    const originalExtension = ".txt";
    const password = "mySecretPassword123";

    try {
        // 1. Encrypt (Double Layer: SEP + AES-GCM)
        const encryptedData = await encryptFile(rawFileBytes, originalExtension, password);
        console.log("Encrypted:", encryptedData);

        // 2. Decrypt
        const decryptedResult = await decryptFile(encryptedData, password);
        // decryptedResult.data -> Uint8Array (the original file bytes)
        // decryptedResult.ext -> ".txt" (the preserved extension)
        // decryptedResult.version -> 5 (the encryption version)

        console.log("Decrypted text:", new TextDecoder().decode(decryptedResult.data));
        console.log("Original extension:", decryptedResult.ext);
        console.log("File version:", decryptedResult.version);
    } catch (err) {
        console.error("Encryption/Decryption failed:", err);
    }
}
=============================================================================
*/
