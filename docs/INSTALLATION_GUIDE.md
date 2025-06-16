# DomainFlow Installation Guide

This guide provides step-by-step instructions for installing DomainFlow in a production environment using the automated deployment pipeline.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Installation](#quick-installation)
3. [Manual Installation](#manual-installation)
4. [Post-Installation Configuration](#post-installation-configuration)
5. [SSL Certificate Setup](#ssl-certificate-setup)
6. [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

**Minimum Hardware Requirements:**
- **CPU**: 2 cores (4 cores recommended)
- **RAM**: 4GB (8GB recommended)
- **Storage**: 20GB (50GB recommended)
- **Network**: 1Gbps connection

**Supported Operating Systems:**
- Ubuntu 18.04, 20.04, 22.04, 24.04
- CentOS 7, 8, 9 (including Rocky Linux, AlmaLinux)
- Debian 10, 11, 12
- Amazon Linux 2, 2023

### Access Requirements

- Root or sudo access to the server
- Internet connectivity for downloading packages
- SSH access to the server

## Quick Installation

The quickest way to install DomainFlow is using the automated installer:

### 1. Download the Installation Package

```bash
# Clone the repository
git clone https://github.com/fntelecomllc/studio.git
cd studio

# Or download and extract the release package
wget https://github.com/fntelecomllc/studio/releases/latest/download/domainflow.tar.gz
tar -xzf domainflow.tar.gz
cd domainflow
```

### 2. Run the Automated Installer

```bash
# Make the installer executable
chmod +x install.sh

# Run the installer with sudo
sudo ./install.sh
```

The installer will:
- Detect your operating system
- Install all required dependencies
- Configure the database
- Set up services
- Configure security
- Set up monitoring and backups
- Perform a health check

### 3. Access Your Application

Once installation is complete, you can access DomainFlow at:
- **HTTP**: `http://your-server-ip`
- **Health Check**: `http://your-server-ip/health`

## Manual Installation

If you prefer to install components manually or need to customize the installation:

### 1. Install Dependencies

```bash
# Run the dependency setup script
sudo ./scripts/deploy/setup-dependencies.sh
```

### 2. Setup Database

```bash
# Configure PostgreSQL for production
sudo ./scripts/deploy/setup-database.sh
```

### 3. Configure Services

```bash
# Set up systemd services
sudo ./scripts/deploy/setup-services.sh
```

### 4. Configure nginx

```bash
# Set up reverse proxy
sudo ./scripts/deploy/setup-nginx.sh
```

### 5. Configure Security

```bash
# Set up firewall and fail2ban
sudo ./scripts/deploy/setup-firewall.sh
```

### 6. Setup SSL (Optional)

```bash
# Prepare SSL configuration
sudo ./scripts/deploy/setup-ssl.sh
```

### 7. Configure Monitoring

```bash
# Set up health monitoring
sudo ./scripts/deploy/setup-monitoring.sh
```

### 8. Configure Backups

```bash
# Set up automated backups
sudo ./scripts/deploy/setup-backup.sh
```

## Post-Installation Configuration

### 1. Verify Installation

Check that all services are running:

```bash
# Check service status
sudo systemctl status domainflow.target

# Run health check
sudo /opt/domainflow/scripts/ops/health-check.sh
```

### 2. Configure Domain Name (Optional)

If you have a domain name, update the nginx configuration:

```bash
# Edit nginx configuration
sudo nano /etc/nginx/sites-available/domainflow

# Update server_name directive
server_name your-domain.com www.your-domain.com;

# Test and reload nginx
sudo nginx -t
sudo systemctl reload nginx
```

### 3. Configure Environment Variables

Review and update the production environment file:

```bash
# Edit environment configuration
sudo nano /opt/domainflow/config/.env.production

# Update any necessary settings
# - CORS_ORIGINS: Add your domain
# - API settings as needed
```

### 4. Set Up Monitoring Alerts (Optional)

Configure email alerts for monitoring:

```bash
# Edit alert configuration
sudo nano /opt/domainflow/monitoring/scripts/alert-manager.sh

# Update ALERT_EMAIL variable
ALERT_EMAIL="admin@your-domain.com"
```

## SSL Certificate Setup

### Option 1: Let's Encrypt (Recommended)

For automatic SSL certificate management:

```bash
# Install SSL certificate for your domain
sudo /opt/domainflow/scripts/ssl/install-certificate.sh your-domain.com admin@your-domain.com
```

This will:
- Obtain a free SSL certificate from Let's Encrypt
- Configure nginx for HTTPS
- Set up automatic renewal

### Option 2: Custom Certificate

If you have your own SSL certificate:

```bash
# Copy your certificate files
sudo cp your-certificate.crt /etc/nginx/ssl/domainflow.crt
sudo cp your-private-key.key /etc/nginx/ssl/domainflow.key

# Set proper permissions
sudo chmod 644 /etc/nginx/ssl/domainflow.crt
sudo chmod 600 /etc/nginx/ssl/domainflow.key

# Enable HTTPS configuration
sudo ln -sf /etc/nginx/sites-available/domainflow-ssl /etc/nginx/sites-enabled/domainflow-ssl
sudo rm -f /etc/nginx/sites-enabled/domainflow

# Test and reload nginx
sudo nginx -t
sudo systemctl reload nginx
```

## Service Management

### Starting and Stopping Services

```bash
# Start all DomainFlow services
sudo systemctl start domainflow.target

# Stop all DomainFlow services
sudo systemctl stop domainflow.target

# Restart all services
sudo systemctl restart domainflow.target

# Check status
sudo systemctl status domainflow.target
```

### Individual Service Management

```bash
# Backend service
sudo systemctl start domainflow-backend
sudo systemctl stop domainflow-backend
sudo systemctl restart domainflow-backend

# Frontend service
sudo systemctl start domainflow-frontend
sudo systemctl stop domainflow-frontend
sudo systemctl restart domainflow-frontend
```

### Viewing Logs

```bash
# View all DomainFlow logs
sudo journalctl -u domainflow.target -f

# View backend logs
sudo journalctl -u domainflow-backend -f

# View frontend logs
sudo journalctl -u domainflow-frontend -f

# View nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

## Backup and Restore

### Manual Backup

```bash
# Create database backup
sudo /opt/domainflow/scripts/ops/backup.sh

# Create application backup
sudo /opt/domainflow/scripts/ops/backup-application.sh
```

### Restore from Backup

```bash
# List available backups
ls -la /opt/domainflow/backups/database/daily/
ls -la /opt/domainflow/backups/application/daily/

# Restore database
sudo /opt/domainflow/scripts/ops/restore.sh database /path/to/backup.sql.gz

# Restore application files
sudo /opt/domainflow/scripts/ops/restore.sh application /path/to/backup.tar.gz
```

## Troubleshooting

### Common Issues

#### Services Won't Start

```bash
# Check service status
sudo systemctl status domainflow-backend
sudo systemctl status domainflow-frontend

# Check logs for errors
sudo journalctl -u domainflow-backend --since "10 minutes ago"

# Check database connectivity
sudo -u postgres psql -c "\l"
```

#### Database Connection Issues

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Test database connection
sudo -u domainflow psql -h localhost -d domainflow_production -c "SELECT 1;"

# Check database configuration
sudo cat /opt/domainflow/config/.env.production | grep DB_
```

#### nginx Configuration Issues

```bash
# Test nginx configuration
sudo nginx -t

# Check nginx status
sudo systemctl status nginx

# Check nginx error logs
sudo tail -20 /var/log/nginx/error.log
```

#### High Resource Usage

```bash
# Check system resources
sudo /opt/domainflow/scripts/ops/health-check.sh

# Check process usage
top -p $(pgrep -d',' domainflow)

# Check disk usage
df -h /opt/domainflow
```

### Getting Help

1. **Check the logs**: Most issues can be diagnosed from the application and system logs
2. **Run health check**: Use the built-in health check script to identify issues
3. **Review documentation**: Check the operational runbook for common procedures
4. **Community support**: Visit the project repository for community support

### Emergency Procedures

#### Stop All Services

```bash
sudo systemctl stop domainflow.target nginx
```

#### Emergency Firewall Disable

```bash
sudo /opt/domainflow/scripts/firewall/emergency-access.sh
```

#### Restore from Backup

```bash
# Stop services
sudo systemctl stop domainflow.target

# Restore database
sudo /opt/domainflow/scripts/ops/restore.sh database /path/to/latest/backup.sql.gz

# Start services
sudo systemctl start domainflow.target
```

## Next Steps

After successful installation:

1. **Review Security**: Ensure firewall rules meet your requirements
2. **Set Up Monitoring**: Configure external monitoring if needed
3. **Plan Backups**: Verify backup schedules meet your requirements
4. **Document Changes**: Keep track of any customizations made
5. **Plan Updates**: Schedule regular system and application updates

For ongoing maintenance, refer to the [Operational Runbook](OPERATIONAL_RUNBOOK.md).