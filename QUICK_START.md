# DomainFlow Quick Start Guide

## 🚀 Get DomainFlow Running in 5 Minutes

This guide will get you up and running with DomainFlow as quickly as possible.

## Prerequisites

Before you begin, ensure you have:

✅ **Go 1.21+** installed  
✅ **Node.js 18+** with npm  
✅ **PostgreSQL 15+** running  
✅ **Git** for cloning the repository  

## Step 1: Clone & Setup

```bash
# Clone the repository
git clone <repository-url>
cd domainflow

# Install frontend dependencies
npm install

# Setup backend dependencies  
cd backend && go mod download && cd ..
```

## Step 2: Configure Database

Create a PostgreSQL database and user:

```sql
-- Connect to PostgreSQL as superuser
sudo -u postgres psql

-- Create database and user
CREATE DATABASE domainflow_dev;
CREATE USER domainflow WITH ENCRYPTED PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE domainflow_dev TO domainflow;
\q
```

## Step 3: Configure Backend

```bash
# Copy configuration template
cd backend
cp config.example.json config.json

# Edit configuration (update database password)
nano config.json
```

**Minimal config.json:**
```json
{
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "domainflow_dev",
    "user": "domainflow",
    "password": "your-secure-password"
  },
  "server": {
    "port": 8080
  },
  "security": {
    "session_secret": "change-this-32-character-secret-key",
    "csrf_key": "change-this-32-character-csrf-key"
  }
}
```

## Step 4: Deploy Application

```bash
# Quick deployment (recommended for development)
./deploy-quick.sh
```

The deployment script will:
- ✅ Build the Go backend
- ✅ Start backend server on port 8080
- ✅ Build the Next.js frontend  
- ✅ Start frontend server on port 3000
- ✅ Run database migrations automatically

## Step 5: Access with Default Admin User

After deployment, a default admin user is automatically created during database migration:

**Default Admin Credentials:**
- **Email**: `admin@domainflow.local`
- **Password**: `TempPassword123!`

> ⚠️ **Security Note**: Change this password immediately after first login. The system will prompt you to change the password on first use.

**Alternative: Create Custom Admin User**

If you prefer to create your own admin user instead:

```bash
# Use the debug tool to create a custom admin user
cd backend
./debug_auth_service

# Follow the prompts to create your admin account
```

## Step 6: Access DomainFlow

Open your browser and navigate to:

🌐 **Frontend**: http://localhost:3000  
🔧 **Backend API**: http://localhost:8080  

## Step 7: Login & Explore

1. **Login** with your admin credentials
2. **Create a Campaign** to test domain analysis
3. **Configure Personas** for DNS/HTTP analysis
4. **Monitor Real-time Progress** via WebSocket updates

## ✅ You're Ready!

**What you can do now:**

- **Create Campaigns**: Domain analysis with keyword generation
- **Configure Analysis**: Set up DNS and HTTP personas  
- **Manage Users**: Add team members with role-based access
- **Monitor Progress**: Real-time updates and progress tracking
- **View Results**: Comprehensive domain analysis results

## 🛠️ Development Workflow

```bash
# Make code changes
# ... edit files ...

# Redeploy with changes
./deploy-quick.sh

# Check logs if needed
tail -f backend/backend.log    # Backend logs
tail -f frontend.log           # Frontend logs
```

## 🔧 Common Commands

```bash
# Health checks
curl http://localhost:8080/ping              # Backend health
curl http://localhost:3000/api/health        # Frontend health

# Stop services
./stop-domainflow.sh

# Fresh deployment (complete rebuild)
./deploy-fresh.sh

# View logs
tail -f backend/backend.log
tail -f frontend.log
```

## 🆘 Need Help?

**Something not working?**

1. **Check logs**: `tail -f backend/backend.log`
2. **Verify database**: `pg_isready -h localhost -p 5432`
3. **Check ports**: `sudo lsof -i :3000 :8080 :5432`
4. **Read troubleshooting**: [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

**Get Support:**
- 📖 [Full Documentation](docs/)
- 🐛 [Report Issues](https://github.com/yourusername/domainflow/issues)
- 💬 [Community Discussions](https://github.com/yourusername/domainflow/discussions)

---

**🎉 Welcome to DomainFlow!** You're now ready to start analyzing domains at scale.

*For advanced configuration, production deployment, and detailed feature guides, see the [complete documentation](docs/).*
