package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
)

func main() {
	// Generate a secure API key
	bytes := make([]byte, 32) // 256-bit key
	if _, err := rand.Read(bytes); err != nil {
		fmt.Fprintf(os.Stderr, "Error generating random bytes: %v\n", err)
		os.Exit(1)
	}

	apiKey := hex.EncodeToString(bytes)

	fmt.Println("Generated Secure API Key:")
	fmt.Println(apiKey)
	fmt.Println("\nStore this key securely in your environment variables:")
	fmt.Printf("export DOMAINFLOW_API_KEY=\"%s\"\n", apiKey)
}
