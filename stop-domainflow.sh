#!/bin/bash
# Stop DomainFlow Application

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Stopping DomainFlow...${NC}"

# Stop processes
pkill -f "next dev" 2>/dev/null && echo -e "${GREEN}Frontend stopped${NC}" || echo -e "${RED}Frontend not running${NC}"
pkill -f "apiserver" 2>/dev/null && echo -e "${GREEN}Backend stopped${NC}" || echo -e "${RED}Backend not running${NC}"

# Clean up PID files
rm -f backend.pid frontend.pid 2>/dev/null

echo -e "${GREEN}DomainFlow stopped successfully${NC}"
