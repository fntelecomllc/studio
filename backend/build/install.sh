#!/bin/bash

# DomainFlow Backend Installation Script

set -euo pipefail

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    echo "This script must be run as root"
    exit 1
fi

# Configuration
BINARY_NAME="domainflow-api"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/domainflow"
LOG_DIR="/var/log/domainflow"
DATA_DIR="/var/lib/domainflow"
USER="domainflow"
GROUP="domainflow"

echo "Installing DomainFlow Backend..."

# Create user and group
if ! id "$USER" &>/dev/null; then
    useradd --system --shell /bin/false --home-dir "$DATA_DIR" --create-home "$USER"
    echo "Created user: $USER"
fi

# Create directories
mkdir -p "$CONFIG_DIR" "$LOG_DIR" "$DATA_DIR"
chown "$USER:$GROUP" "$LOG_DIR" "$DATA_DIR"
chmod 755 "$CONFIG_DIR" "$LOG_DIR" "$DATA_DIR"

# Install binary
cp "$BINARY_NAME" "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/$BINARY_NAME"
echo "Installed binary to: $INSTALL_DIR/$BINARY_NAME"

# Install configuration
if [[ -f "production.env" ]]; then
    cp production.env "$CONFIG_DIR/"
    chmod 600 "$CONFIG_DIR/production.env"
    echo "Installed configuration to: $CONFIG_DIR/production.env"
fi

# Install systemd service
if [[ -f "domainflow-backend.service" ]]; then
    cp domainflow-backend.service /etc/systemd/system/
    systemctl daemon-reload
    echo "Installed systemd service"
fi

echo "Installation completed successfully!"
echo "Next steps:"
echo "1. Edit $CONFIG_DIR/production.env with your settings"
echo "2. Start the service: systemctl start domainflow-backend"
echo "3. Enable auto-start: systemctl enable domainflow-backend"
