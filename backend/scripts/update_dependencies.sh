#!/bin/bash

# Navigate to the backend directory
cd "$(dirname "$0")/.." || exit

# Add required dependencies
go get github.com/DATA-DOG/go-sqlmock
go get github.com/stretchr/testify/assert
go get github.com/stretchr/testify/require

# Tidy up the go.mod file
go mod tidy

echo "Dependencies updated successfully!"