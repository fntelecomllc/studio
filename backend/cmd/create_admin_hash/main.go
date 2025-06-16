package main

import (
	"fmt"
	"log"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	password := "TempPassword123!"
	cost := 12 // Same as BcryptCost constant in auth service
	
	// Generate bcrypt hash (no pepper, same as ensureAdminUser function)
	hash, err := bcrypt.GenerateFromPassword([]byte(password), cost)
	if err != nil {
		log.Fatalf("Failed to generate hash: %v", err)
	}
	
	fmt.Printf("Bcrypt hash for '%s' with cost %d:\n%s\n", password, cost, string(hash))
	
	// Verify the hash works
	err = bcrypt.CompareHashAndPassword(hash, []byte(password))
	if err != nil {
		log.Fatalf("Hash verification failed: %v", err)
	}
	
	fmt.Println("Hash verification successful!")
}