package services

import (
	"crypto/rand"
	"testing"
)

func TestEncryptionService(t *testing.T) {
	// Generate a random 32-byte key for testing
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("Failed to generate key: %v", err)
	}

	encService, err := NewEncryptionService(key)
	if err != nil {
		t.Fatalf("Failed to create encryption service: %v", err)
	}

	t.Run("EncryptDecryptField", func(t *testing.T) {
		testCases := []string{
			"sensitive data",
			"user@example.com",
			"password123",
			"",
			"very long string with special characters !@#$%^&*()_+-=[]{}|;':\",./<>?",
		}

		for _, plaintext := range testCases {
			encrypted, err := encService.EncryptField(plaintext)
			if err != nil {
				t.Errorf("Failed to encrypt '%s': %v", plaintext, err)
				continue
			}

			// Ensure encrypted text is different from plaintext
			if plaintext != "" && encrypted == plaintext {
				t.Errorf("Encrypted text is same as plaintext for '%s'", plaintext)
			}

			decrypted, err := encService.DecryptField(encrypted)
			if err != nil {
				t.Errorf("Failed to decrypt '%s': %v", encrypted, err)
				continue
			}

			if decrypted != plaintext {
				t.Errorf("Decrypted text doesn't match original. Got '%s', want '%s'", decrypted, plaintext)
			}
		}
	})

	t.Run("EncryptDecryptBytes", func(t *testing.T) {
		testCases := [][]byte{
			[]byte("byte data"),
			[]byte{0x00, 0x01, 0x02, 0x03},
			[]byte{},
			make([]byte, 1024), // 1KB of zeros
		}

		for _, plaintext := range testCases {
			encrypted, err := encService.EncryptBytes(plaintext)
			if err != nil {
				t.Errorf("Failed to encrypt bytes: %v", err)
				continue
			}

			// Ensure encrypted bytes are different from plaintext
			if len(plaintext) > 0 && string(encrypted) == string(plaintext) {
				t.Error("Encrypted bytes are same as plaintext")
			}

			decrypted, err := encService.DecryptBytes(encrypted)
			if err != nil {
				t.Errorf("Failed to decrypt bytes: %v", err)
				continue
			}

			if string(decrypted) != string(plaintext) {
				t.Error("Decrypted bytes don't match original")
			}
		}
	})

	t.Run("InvalidKey", func(t *testing.T) {
		// Test with wrong key size
		invalidKey := make([]byte, 16) // 128 bits instead of 256
		_, err := NewEncryptionService(invalidKey)
		if err == nil {
			t.Error("Expected error for invalid key size, got nil")
		}
	})

	t.Run("InvalidCiphertext", func(t *testing.T) {
		// Test decrypting invalid ciphertext
		_, err := encService.DecryptField("invalid base64!")
		if err == nil {
			t.Error("Expected error for invalid base64, got nil")
		}

		// Test decrypting too short ciphertext
		_, err = encService.DecryptBytes([]byte{0x01, 0x02})
		if err == nil {
			t.Error("Expected error for too short ciphertext, got nil")
		}
	})

	t.Run("DifferentEncryptions", func(t *testing.T) {
		// Same plaintext should produce different ciphertexts due to random nonce
		plaintext := "test data"
		encrypted1, err1 := encService.EncryptField(plaintext)
		encrypted2, err2 := encService.EncryptField(plaintext)

		if err1 != nil || err2 != nil {
			t.Fatalf("Encryption failed: %v, %v", err1, err2)
		}

		if encrypted1 == encrypted2 {
			t.Error("Same plaintext produced identical ciphertexts (nonce reuse?)")
		}

		// Both should decrypt to the same value
		decrypted1, _ := encService.DecryptField(encrypted1)
		decrypted2, _ := encService.DecryptField(encrypted2)

		if decrypted1 != plaintext || decrypted2 != plaintext {
			t.Error("Decryption produced incorrect results")
		}
	})
}
