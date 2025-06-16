#!/bin/bash
# =============================================================================
# DomainFlow Deployment Menu
# =============================================================================
# Simple menu to help users choose the right deployment option
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Print header
print_header() {
    clear
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                     DomainFlow Deployment                     ║${NC}"
    echo -e "${CYAN}║                    Automated Setup Menu                       ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}Welcome to DomainFlow! 🚀${NC}"
    echo ""
    echo -e "This tool will help you deploy DomainFlow quickly and easily."
    echo -e "Please choose the deployment option that best fits your needs:"
    echo ""
}

# Print menu options
print_menu() {
    echo -e "${CYAN}📋 Deployment Options:${NC}"
    echo ""
    echo -e "${GREEN}1)${NC} ${YELLOW}Quick Deploy${NC} - Use existing test database"
    echo -e "   ${BLUE}•${NC} Perfect for development and testing"
    echo -e "   ${BLUE}•${NC} Uses pre-configured test database"
    echo -e "   ${BLUE}•${NC} Faster setup (5-10 minutes)"
    echo -e "   ${BLUE}•${NC} Admin user already exists"
    echo ""
    echo -e "${GREEN}2)${NC} ${YELLOW}Fresh Deploy${NC} - Complete new installation"
    echo -e "   ${BLUE}•${NC} Perfect for production or new machines"
    echo -e "   ${BLUE}•${NC} Creates new database and user"
    echo -e "   ${BLUE}•${NC} More secure with generated passwords"
    echo -e "   ${BLUE}•${NC} Complete setup (10-20 minutes)"
    echo ""
    echo -e "${GREEN}3)${NC} ${YELLOW}Check Status${NC} - View current DomainFlow status"
    echo -e "   ${BLUE}•${NC} Check if DomainFlow is running"
    echo -e "   ${BLUE}•${NC} View service health"
    echo ""
    echo -e "${GREEN}4)${NC} ${YELLOW}Stop DomainFlow${NC} - Stop all DomainFlow services"
    echo -e "   ${BLUE}•${NC} Safely stop frontend and backend"
    echo ""
    echo -e "${GREEN}5)${NC} ${YELLOW}View Logs${NC} - Show recent application logs"
    echo -e "   ${BLUE}•${NC} Check for errors or issues"
    echo ""
    echo -e "${RED}6)${NC} ${YELLOW}Exit${NC}"
    echo ""
}

# Check if DomainFlow is running
check_if_running() {
    local frontend_running=false
    local backend_running=false
    
    if pgrep -f "next dev" > /dev/null; then
        frontend_running=true
    fi
    
    if pgrep -f "apiserver" > /dev/null; then
        backend_running=true
    fi
    
    if [ "$frontend_running" = true ] || [ "$backend_running" = true ]; then
        echo -e "${YELLOW}⚠️  DomainFlow appears to be running:${NC}"
        [ "$frontend_running" = true ] && echo -e "   ${GREEN}•${NC} Frontend is running"
        [ "$backend_running" = true ] && echo -e "   ${GREEN}•${NC} Backend is running"
        echo ""
        return 0
    else
        return 1
    fi
}

# Quick deploy
quick_deploy() {
    echo -e "${CYAN}Starting Quick Deployment...${NC}"
    echo ""
    
    if [ ! -f "deploy-quick.sh" ]; then
        echo -e "${RED}Error: deploy-quick.sh script not found!${NC}"
        echo "Please make sure you're running this from the DomainFlow directory."
        read -p "Press Enter to continue..."
        return
    fi
    
    echo -e "${YELLOW}This will deploy DomainFlow using the existing test database.${NC}"
    echo -e "${YELLOW}The deployment process will take approximately 5-10 minutes.${NC}"
    echo ""
    read -p "Do you want to continue? (y/N): " confirm
    
    if [[ $confirm =~ ^[Yy]$ ]]; then
        chmod +x deploy-quick.sh
        ./deploy-quick.sh
        echo ""
        read -p "Press Enter to return to menu..."
    else
        echo "Quick deployment cancelled."
        read -p "Press Enter to continue..."
    fi
}

# Fresh deploy
fresh_deploy() {
    echo -e "${CYAN}Starting Fresh Deployment...${NC}"
    echo ""
    
    if [ ! -f "deploy-fresh.sh" ]; then
        echo -e "${RED}Error: deploy-fresh.sh script not found!${NC}"
        echo "Please make sure you're running this from the DomainFlow directory."
        read -p "Press Enter to continue..."
        return
    fi
    
    echo -e "${YELLOW}This will perform a complete fresh installation of DomainFlow.${NC}"
    echo -e "${YELLOW}The deployment process will take approximately 10-20 minutes.${NC}"
    echo ""
    echo -e "${RED}Warning: This may require sudo privileges to install dependencies.${NC}"
    echo ""
    read -p "Do you want to continue? (y/N): " confirm
    
    if [[ $confirm =~ ^[Yy]$ ]]; then
        chmod +x deploy-fresh.sh
        ./deploy-fresh.sh
        echo ""
        read -p "Press Enter to return to menu..."
    else
        echo "Fresh deployment cancelled."
        read -p "Press Enter to continue..."
    fi
}

# Check status
check_status() {
    echo -e "${CYAN}DomainFlow Status Check${NC}"
    echo ""
    
    if [ -f "status-domainflow.sh" ]; then
        chmod +x status-domainflow.sh
        ./status-domainflow.sh
    else
        echo -e "${YELLOW}Status script not found. Performing basic check...${NC}"
        echo ""
        
        # Basic status check
        if pgrep -f "next dev" > /dev/null; then
            echo -e "Frontend: ${GREEN}RUNNING${NC}"
        else
            echo -e "Frontend: ${RED}STOPPED${NC}"
        fi
        
        if pgrep -f "apiserver" > /dev/null; then
            echo -e "Backend: ${GREEN}RUNNING${NC}"
        else
            echo -e "Backend: ${RED}STOPPED${NC}"
        fi
        
        echo ""
        echo -e "${BLUE}URLs:${NC}"
        echo -e "Frontend: http://localhost:3000"
        echo -e "Backend:  http://localhost:8080"
    fi
    
    echo ""
    read -p "Press Enter to continue..."
}

# Stop DomainFlow
stop_domainflow() {
    echo -e "${CYAN}Stopping DomainFlow...${NC}"
    echo ""
    
    # Check if using dedicated stop script first
    if [ -f "stop-domainflow.sh" ]; then
        echo -e "${BLUE}Using dedicated stop script...${NC}"
        chmod +x stop-domainflow.sh
        ./stop-domainflow.sh
        echo ""
        read -p "Press Enter to continue..."
        return
    fi
    
    # Manual stop with enhanced process cleanup
    echo -e "${YELLOW}Performing comprehensive service shutdown...${NC}"
    
    local stopped_something=false
    
    # Function to safely kill processes
    safe_kill() {
        local process_name="$1"
        local signal="${2:-TERM}"
        
        local pids=$(pgrep -f "$process_name" 2>/dev/null || true)
        if [ ! -z "$pids" ]; then
            echo -e "${BLUE}Found $process_name processes (PIDs: $pids). Stopping...${NC}"
            pkill -$signal -f "$process_name" 2>/dev/null || true
            sleep 2
            stopped_something=true
            
            # Check if still running and force kill if necessary
            local remaining_pids=$(pgrep -f "$process_name" 2>/dev/null || true)
            if [ ! -z "$remaining_pids" ] && [ "$signal" != "KILL" ]; then
                echo -e "${YELLOW}Process still running. Force killing...${NC}"
                pkill -KILL -f "$process_name" 2>/dev/null || true
                sleep 1
            fi
        fi
    }
    
    # Function to free up ports
    free_port() {
        local port="$1"
        local port_pids=$(lsof -ti:$port 2>/dev/null || true)
        if [ ! -z "$port_pids" ]; then
            echo -e "${BLUE}Port $port is in use (PIDs: $port_pids). Freeing up...${NC}"
            kill -TERM $port_pids 2>/dev/null || true
            sleep 2
            stopped_something=true
            
            # Force kill if still there
            local remaining_pids=$(lsof -ti:$port 2>/dev/null || true)
            if [ ! -z "$remaining_pids" ]; then
                echo -e "${YELLOW}Processes still using port $port. Force killing...${NC}"
                kill -KILL $remaining_pids 2>/dev/null || true
                sleep 1
            fi
        fi
    }
    
    # Stop frontend processes
    safe_kill "next dev"
    safe_kill "npm.*dev"
    
    # Stop backend processes  
    safe_kill "apiserver"
    safe_kill "./apiserver"
    
    # Free up critical ports
    free_port 3000
    free_port 8080
    
    # Clean up any remaining Node.js processes on our ports
    safe_kill "node.*3000"
    
    # Remove PID files if they exist
    rm -f frontend.pid backend/backend.pid backend.pid 2>/dev/null || true
    
    if [ "$stopped_something" = true ]; then
        echo -e "${GREEN}✅ DomainFlow services stopped successfully${NC}"
    else
        echo -e "${YELLOW}ℹ️  No DomainFlow services were running${NC}"
    fi
    
    echo ""
    read -p "Press Enter to continue..."
}

# View logs
view_logs() {
    echo -e "${CYAN}DomainFlow Logs${NC}"
    echo ""
    
    echo -e "${BLUE}Choose which logs to view:${NC}"
    echo "1) Backend logs"
    echo "2) Frontend logs"
    echo "3) Both"
    echo ""
    read -p "Enter your choice (1-3): " log_choice
    
    case $log_choice in
        1)
            if [ -f "backend/apiserver.log" ]; then
                echo -e "${CYAN}Backend Logs (last 50 lines):${NC}"
                echo "================================"
                tail -n 50 backend/apiserver.log
            else
                echo -e "${RED}Backend log file not found${NC}"
            fi
            ;;
        2)
            if [ -f "frontend.log" ]; then
                echo -e "${CYAN}Frontend Logs (last 50 lines):${NC}"
                echo "================================="
                tail -n 50 frontend.log
            else
                echo -e "${RED}Frontend log file not found${NC}"
            fi
            ;;
        3)
            if [ -f "backend/apiserver.log" ]; then
                echo -e "${CYAN}Backend Logs (last 25 lines):${NC}"
                echo "================================"
                tail -n 25 backend/apiserver.log
                echo ""
            fi
            if [ -f "frontend.log" ]; then
                echo -e "${CYAN}Frontend Logs (last 25 lines):${NC}"
                echo "================================="
                tail -n 25 frontend.log
            fi
            ;;
        *)
            echo "Invalid choice"
            ;;
    esac
    
    echo ""
    read -p "Press Enter to continue..."
}

# Main menu loop
main() {
    # Ensure we're in interactive mode - but allow for testing
    if [ ! -t 0 ] && [ "$1" != "--test" ]; then
        echo -e "${RED}Error: This script must be run interactively.${NC}"
        echo "Please run: ./deploy.sh"
        exit 1
    fi
    
    while true; do
        print_header
        check_if_running
        print_menu
        
        echo -n "Enter your choice (1-6): "
        read -r choice
        echo ""
        
        # Handle empty input gracefully
        if [ -z "$choice" ]; then
            echo -e "${YELLOW}Please enter a choice (1-6)${NC}"
            read -p "Press Enter to continue..."
            continue
        fi
        
        case $choice in
            1)
                quick_deploy
                ;;
            2)
                fresh_deploy
                ;;
            3)
                check_status
                ;;
            4)
                stop_domainflow
                ;;
            5)
                view_logs
                ;;
            6)
                echo -e "${GREEN}Thank you for using DomainFlow! 👋${NC}"
                echo ""
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid option '$choice'. Please enter a number 1-6.${NC}"
                read -p "Press Enter to continue..."
                ;;
        esac
    done
}

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "backend" ]; then
    echo -e "${RED}Error: This doesn't appear to be the DomainFlow directory.${NC}"
    echo "Please run this script from the DomainFlow root directory."
    exit 1
fi

# Run main function
main "$@"
