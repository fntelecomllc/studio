package main

import (
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	pepper := "domainflow_secure_pepper_key_2025_production"
	password := "TempPassword123!"
	pepperedPassword := password + pepper

	hash, err := bcrypt.GenerateFromPassword([]byte(pepperedPassword), 12)
	if err != nil {
		panic(err)
	}

	fmt.Println(string(hash))
}
