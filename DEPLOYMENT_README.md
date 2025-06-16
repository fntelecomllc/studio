# DomainFlow Automated Deployment Guide

🚀 **Simple, One-Click Deployment for DomainFlow**

This guide provides automated deployment scripts for non-technical users to easily deploy the DomainFlow application.

## 📋 Quick Start

### Option 1: Interactive Menu (Recommended)
```bash
./deploy.sh
```

### Option 2: Direct Deployment
```bash
# Quick deployment (uses existing test database)
./deploy-quick.sh

# Fresh deployment (creates new database)
./deploy-fresh.sh
```

## 🎯 Deployment Options

### 1. Quick Deploy (`./deploy-quick.sh`)
**Best for: Development, testing, demos**

- ✅ Uses existing test database
- ✅ Faster setup (5-10 minutes)
- ✅ Pre-configured admin user
- ✅ Perfect for trying out DomainFlow
- ⚠️ Not recommended for production

**Default Credentials:**
- Email: `admin@domainflow.local`
- Password: `TempPassword123!`

### 2. Fresh Deploy (`./deploy-fresh.sh`)
**Best for: Production, new installations**

- ✅ Creates new database and user
- ✅ Secure with generated passwords
- ✅ Production-ready configuration
- ✅ Complete setup (10-20 minutes)
- ✅ Recommended for production use

## 🛠 Prerequisites

The deployment scripts will check for and guide you through installing:

- **Node.js** (v18 or later)
- **npm** (comes with Node.js)
- **Go** (v1.19 or later)
- **PostgreSQL** (v12 or later)

## 🚀 Automated Setup Process

### What the Scripts Do

1. **Environment Check**: Verify all prerequisites are installed
2. **Process Cleanup**: Stop any existing DomainFlow processes
3. **Database Setup**: Create/verify database and user accounts
4. **Dependencies**: Install frontend and backend dependencies
5. **Build**: Compile the backend Go application
6. **Configuration**: Set up configuration files
7. **Startup**: Start both frontend and backend services
8. **Verification**: Test that everything is working
9. **Credentials**: Display login information

### Smart Process Management

The scripts automatically handle:
- ✅ Stopping existing DomainFlow processes
- ✅ Freeing up ports 3000 (frontend) and 8080 (backend)
- ✅ Cleaning up stuck processes
- ✅ Force-killing stubborn processes if needed
- ✅ Graceful shutdown with SIGTERM, force with SIGKILL if necessary

## 📱 Using the Interactive Menu

Run `./deploy.sh` to access the interactive menu:

```
╔════════════════════════════════════════════════════════════════╗
║                     DomainFlow Deployment                     ║
║                    Automated Setup Menu                       ║
╚════════════════════════════════════════════════════════════════╝

📋 Deployment Options:

1) Quick Deploy - Use existing test database
   • Perfect for development and testing
   • Uses pre-configured test database
   • Faster setup (5-10 minutes)
   • Admin user already exists

2) Fresh Deploy - Complete new installation
   • Perfect for production or new machines
   • Creates new database and user
   • More secure with generated passwords
   • Complete setup (10-20 minutes)

3) Check Status - View current DomainFlow status
   • Check if DomainFlow is running
   • View service health

4) Stop DomainFlow - Stop all DomainFlow services
   • Safely stop frontend and backend

5) View Logs - Show recent application logs
   • Check for errors or issues

6) Exit
```

## 🌐 After Deployment

Once deployment completes successfully:

### Access Your Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8080
- **Health Check**: http://localhost:8080/health

### Log Files
- **Backend**: `backend/apiserver.log`
- **Frontend**: `frontend.log`

### Stop the Application
```bash
./stop-domainflow.sh
```
or use the interactive menu option 4.

## 🔧 Troubleshooting

### Common Issues

#### Port Already in Use
```bash
Error: Port 3000 is already in use
```
**Solution**: The scripts automatically handle this, but you can manually stop processes:
```bash
# Stop all DomainFlow processes
pkill -f "next dev"
pkill -f "apiserver"

# Or use the deployment menu option 4
./deploy.sh
```

#### Database Connection Failed
```bash
Error: Could not connect to database
```
**Solutions**:
1. Ensure PostgreSQL is running: `sudo systemctl start postgresql`
2. Use fresh deployment to create new database: `./deploy-fresh.sh`
3. Check PostgreSQL logs: `sudo journalctl -u postgresql`

#### Permission Denied
```bash
Permission denied: ./deploy.sh
```
**Solution**:
```bash
chmod +x deploy.sh deploy-quick.sh deploy-fresh.sh
```

#### Frontend Build Errors
**Solution**: Clear cache and reinstall:
```bash
rm -rf node_modules .next
npm install
```

### Getting Help

1. **Check Logs**: Use deployment menu option 5
2. **View Status**: Use deployment menu option 3
3. **Restart Fresh**: Use `./deploy-fresh.sh` for clean setup

## 🔒 Security Notes

### Quick Deploy Security
- Uses test database with default credentials
- Suitable for development and testing only
- **Do not use in production environments**

### Fresh Deploy Security
- Generates secure random passwords
- Creates dedicated database user
- Suitable for production use
- Review generated credentials carefully

## 📁 File Structure After Deployment

```
domainflow/
├── deploy.sh              # Main deployment menu
├── deploy-quick.sh         # Quick deployment script
├── deploy-fresh.sh         # Fresh deployment script
├── stop-domainflow.sh      # Stop script (created after deployment)
├── frontend.log            # Frontend logs
├── backend/
│   ├── apiserver          # Compiled backend binary
│   ├── apiserver.log      # Backend logs
│   └── backend.pid        # Backend process ID
└── .deployment_credentials # Generated credentials (fresh deploy only)
```

## 🔄 Updates and Maintenance

### Updating DomainFlow
1. Stop the current application: `./stop-domainflow.sh`
2. Pull latest changes: `git pull`
3. Redeploy: `./deploy.sh`

### Database Migrations
The deployment scripts automatically handle database migrations during deployment.

## 🏢 Production Deployment

For production environments:

1. **Use Fresh Deploy**: Always use `./deploy-fresh.sh`
2. **Environment Variables**: Set production environment variables
3. **SSL/TLS**: Configure reverse proxy (nginx/apache) for HTTPS
4. **Firewall**: Configure firewall rules for ports 3000, 8080
5. **Monitoring**: Set up monitoring and logging
6. **Backups**: Configure database backups

### Environment Variables for Production
```bash
export NODE_ENV=production
export DOMAINFLOW_ENV=production
export DATABASE_URL="your-production-database-url"
```

## 📞 Support

If you encounter issues not covered in this guide:

1. Check the troubleshooting section above
2. Review log files using the deployment menu
3. Ensure all prerequisites are properly installed
4. Try a fresh deployment with `./deploy-fresh.sh`

---

**Happy deploying! 🎉**

*DomainFlow Deployment System v1.0*
