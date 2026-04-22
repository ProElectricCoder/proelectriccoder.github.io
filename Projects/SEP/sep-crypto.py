"""
sep_crypto.py (v5 - Layered SEP + AES-GCM)
Universal Python module for Double Encryptor logic.
Layer 1: SEP1 Packing & XOR Cipher
Layer 2: PBKDF2 Key Derivation & AES-GCM Encryption
"""

import os
import gzip
import warnings
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

def get_crypto_random(length: int) -> bytes:
	"""Generates cryptographically secure random bytes."""
	return os.urandom(length)

def compress_data(data_bytes: bytes) -> bytes:
	return gzip.compress(data_bytes)

def decompress_data(data_bytes: bytes) -> bytes:
	return gzip.decompress(data_bytes)

# ==========================================
# LAYER 1: SEP LOGIC (XOR + Packing)
# ==========================================

REQUIRED_KEY_LENGTH = 1024
CRYPTO_VERSION = 5

def generate_random_key(key_length: int = REQUIRED_KEY_LENGTH) -> bytes:
	return get_crypto_random(key_length)

def create_key_from_password(password_string: str, key_length: int = REQUIRED_KEY_LENGTH, salt: bytes = b'') -> bytes:
	pass_bytes = password_string.encode('utf-8')
	
	if len(pass_bytes) == 0:
		raise ValueError("Password cannot be empty.")

	combined = pass_bytes + salt
	key_bytes = bytearray(key_length)

	# Stretch the combined password+salt to fill exactly keyLength bytes
	for i in range(key_length):
		key_bytes[i] = combined[i % len(combined)]
		
	return bytes(key_bytes)

def process_xor(data_bytes: bytes, key_bytes: bytes) -> bytes:
	if not key_bytes or len(key_bytes) == 0:
		raise ValueError("Key cannot be empty.")
		
	output = bytearray(len(data_bytes))
	for i in range(len(data_bytes)):
		output[i] = data_bytes[i] ^ key_bytes[i % len(key_bytes)]
		
	return bytes(output)

def pack_sep1(data_bytes: bytes, ext: str) -> bytes:
	ext_bytes = ext.encode('utf-8')
	ext_len = len(ext_bytes)
	
	payload = bytearray(4 + 1 + 1 + ext_len + len(data_bytes))
	payload[0:4] = b"SEP1" # "SEP1" magic header
	payload[4] = CRYPTO_VERSION
	payload[5] = ext_len
	payload[6:6+ext_len] = ext_bytes
	payload[6+ext_len:] = data_bytes
	
	return bytes(payload)

def unpack_sep1(decrypted_payload: bytes) -> dict:
	has_magic = len(decrypted_payload) > 5 and decrypted_payload[0:4] == b"SEP1"

	if has_magic:
		version = decrypted_payload[4]
		if version != CRYPTO_VERSION:
			warnings.warn(f"Version mismatch: File uses v{version}, decryptor uses v{CRYPTO_VERSION}")
			
		ext_len = decrypted_payload[5]
		ext = decrypted_payload[6:6+ext_len].decode('utf-8')
		return {"data": decrypted_payload[6+ext_len:], "ext": ext, "version": version}
		
	return {"data": decrypted_payload, "ext": '', "version": None}

# Standalone SEP Encryption
def encrypt_sep(data_bytes: bytes, extension: str, password_string: str, key_length: int = REQUIRED_KEY_LENGTH) -> bytes:
	compressed_data = compress_data(data_bytes)
	salt = get_crypto_random(16)
	packed_payload = pack_sep1(compressed_data, extension)
	xor_key = create_key_from_password(password_string, key_length, salt)
	encrypted_payload = process_xor(packed_payload, xor_key)
	
	final_bytes = bytearray(16 + len(encrypted_payload))
	final_bytes[0:16] = salt
	final_bytes[16:] = encrypted_payload
	
	return bytes(final_bytes)

# Standalone SEP Decryption
def decrypt_sep(encrypted_bytes: bytes, password_string: str, key_length: int = REQUIRED_KEY_LENGTH) -> dict:
	if len(encrypted_bytes) < 16:
		raise ValueError("SEP Decryption failed! Corrupted data or missing salt.")
		
	salt = encrypted_bytes[:16]
	cipher_data = encrypted_bytes[16:]

	xor_key = create_key_from_password(password_string, key_length, salt)
	unpacked = process_xor(cipher_data, xor_key)
	unpacked_result = unpack_sep1(unpacked)
	
	decompressed_data = decompress_data(unpacked_result["data"])
	return {"data": decompressed_data, "ext": unpacked_result["ext"], "version": unpacked_result["version"]}

# ==========================================
# LAYER 2: THE AES-GCM SHIELD
# ==========================================

def derive_aes_key(password_string: str, salt: bytes) -> bytes:
	kdf = PBKDF2HMAC(
		algorithm=hashes.SHA256(),
		length=32, # 256 bits for AES-256
		salt=salt,
		iterations=100000,
	)
	return kdf.derive(password_string.encode('utf-8'))

# Standalone AES-GCM Encryption
def encrypt_aes(data_bytes: bytes, password_string: str) -> bytes:
	if not password_string:
		raise ValueError("Password cannot be empty.")

	compressed_data = compress_data(data_bytes)
	salt = get_crypto_random(16)
	iv = get_crypto_random(12)
	aes_key = derive_aes_key(password_string, salt)

	aesgcm = AESGCM(aes_key)
	aes_cipher_bytes = aesgcm.encrypt(iv, compressed_data, None)

	# Package final file: [Salt] + [IV] + [Encrypted Data]
	final_bytes = bytearray(16 + 12 + len(aes_cipher_bytes))
	final_bytes[0:16] = salt
	final_bytes[16:28] = iv
	final_bytes[28:] = aes_cipher_bytes

	return bytes(final_bytes)

# Standalone AES-GCM Decryption
def decrypt_aes(encrypted_bytes: bytes, password_string: str) -> bytes:
	if not password_string:
		raise ValueError("Password cannot be empty.")
	if len(encrypted_bytes) < 28:
		raise ValueError("File is corrupted or too small.")

	salt = encrypted_bytes[0:16]
	iv = encrypted_bytes[16:28]
	aes_cipher_bytes = encrypted_bytes[28:]

	try:
		aes_key = derive_aes_key(password_string, salt)
		aesgcm = AESGCM(aes_key)
		decrypted_buffer = aesgcm.decrypt(iv, aes_cipher_bytes, None)
		return decompress_data(decrypted_buffer)
	except Exception:
		raise ValueError("AES Decryption failed! Incorrect password or corrupted data.")

# ==========================================
# MASTER FUNCTIONS: LAYERED ENCRYPTION
# ==========================================

# Encrypts the data using SEP1 + XOR, then wraps it in AES-GCM.
def encrypt_file(data_bytes: bytes, extension: str, password_string: str, key_length: int = REQUIRED_KEY_LENGTH) -> bytes:
	# 1. Layer 1 (SEP)
	sep_encrypted = encrypt_sep(data_bytes, extension, password_string, key_length)
	# 2. Layer 2 (AES)
	return encrypt_aes(sep_encrypted, password_string)

# Decrypts the AES-GCM layer, then undoes the XOR and SEP1 packing.
def decrypt_file(encrypted_bytes: bytes, password_string: str, key_length: int = REQUIRED_KEY_LENGTH) -> dict:
	# 1. Layer 2 (AES)
	aes_decrypted = decrypt_aes(encrypted_bytes, password_string)
	# 2. Layer 1 (SEP)
	return decrypt_sep(aes_decrypted, password_string, key_length)
