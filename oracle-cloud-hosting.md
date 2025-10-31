# Finding a hosting solution for fuel dispatch UI
_Exported on 10/31/2025 at 00:42:42 MDT from Cursor (2.0.43)_

---

**User**

I've built this UI to poll for fuel dispatches from QT which we ended up building a proxy for. I am now thinking of where I can deploy this publicly for free. The caveat is it is not a static site, so firebase hosting is not an option as I would have to set it up as a cloud function that gets triggered by google cloud scheduling. I am looking for a simple solution. Something like Vercel or Netlify or maybe even Google cloud virtual server where I can have the proxy running constantly and it needs to remain authenticated to QT to maintain the session by polling the dispatch every so often. Then I will have clients load a webpage served by this app to display the fuel dispatches. These need to be updated on a set interval as well. We could theoretically have the server/proxy handle polling QT and push the updates to the clients with web sockets. Or the clients can poll the proxy. We used the proxy to avoid having each client having to authenticate and maintain its own session. I need help figuring out where and how to host it. I guess the options are cloud functions or running a vm instance to have it running constantly

---

**Cursor**

I'll help you figure out the best hosting solution for your fuel dispatch application. Let me first examine your current setup to understand the architecture better.


Based on my analysis of your fuel dispatch application, I can see you have a Node.js Express server that:

1. **Maintains authentication sessions** with QT Technologies
2. **Serves static HTML files** for the UI
3. **Proxies API calls** to QT's dispatch system
4. **Polls for data** and maintains session cookies
5. **Provides real-time updates** to clients

Here are the best hosting options for your specific requirements:

## **Recommended: Railway or Render (Free Tier)**

These are the best options for your use case because they support:
- **Persistent processes** (unlike Vercel/Netlify which are serverless)
- **Free tier** with reasonable limits
- **Easy deployment** from GitHub
- **Environment variables** for your QT credentials

### **Railway** (Recommended)
- **Free tier**: $5/month credit (enough for small apps)
- **Pros**: 
  - Very simple deployment
  - Automatic HTTPS
  - Custom domains
  - Persistent processes
  - Good for Node.js apps
- **Cons**: Requires credit card for free tier

### **Render**
- **Free tier**: Available for web services
- **Pros**:
  - True free tier (no credit card required)
  - Automatic deployments
  - Custom domains
  - Persistent processes
- **Cons**: 
  - Free tier has limitations (sleeps after inactivity)
  - Slower cold starts

## **Alternative: Google Cloud Run**

- **Free tier**: 2 million requests/month
- **Pros**:
  - Serverless but supports long-running processes
  - Good integration with Google Cloud
  - Automatic scaling
- **Cons**: More complex setup

## **Not Recommended for Your Use Case:**

- **Vercel/Netlify**: Serverless functions have timeout limits (10-15 seconds), not suitable for persistent polling
- **Firebase Functions**: Similar timeout issues, better for event-driven tasks
- **Traditional VMs**: Overkill and more expensive for this use case

## **Implementation Strategy**

For your polling architecture, I recommend:

1. **Server-side polling**: Your server polls QT every 30-60 seconds
2. **Client polling**: Clients poll your server every 10-15 seconds for updates
3. **WebSocket option**: Upgrade to WebSockets later for real-time updates

## **Deployment Steps (Railway Example)**

1. **Prepare your app**:
   ```bash
   # Add a Procfile
   echo "web: node proxy-server.js" > Procfile
   
   # Ensure PORT is set in your code
   const PORT = process.env.PORT || 3000;
   ```

2. **Set environment variables**:
   - `QT_USERNAME`
   - `QT_PASSWORD` 
   - `QT_COMPANY_LOCATION_ID`
   - `QT_USER_ID`
   - `POLL_INTERVAL`

3. **Deploy to Railway**:
   - Connect your GitHub repo
   - Railway will auto-detect Node.js
   - Set environment variables in Railway dashboard

Would you like me to help you prepare the deployment files for any of these platforms, or do you have questions about the specific implementation details?

```shellscript
   # Add a Procfile
   echo "web: node proxy-server.js" > Procfile
   
   # Ensure PORT is set in your code
   const PORT = process.env.PORT || 3000;
```

---

**User**

What about Oracle VM free?

---

**Cursor**

Oracle Cloud Free Tier is actually an excellent option for your use case! Let me break down why it's a great choice and how it compares:

## **Oracle Cloud Free Tier - Excellent Choice**

### **What You Get (Always Free):**
- **2 AMD-based Compute VMs** with 1/8 OCPU and 1 GB memory each
- **4 ARM-based Compute VMs** with 24 GB memory total
- **200 GB total storage**
- **10 TB data transfer per month**
- **Load balancer**
- **Autonomous Database (2 databases)**

### **Perfect for Your Fuel Dispatch App:**

1. **Persistent Process**: Your Node.js server can run continuously without timeouts
2. **Always On**: Unlike Render's free tier, it won't sleep after inactivity
3. **More Resources**: 1 GB RAM is plenty for your Express app
4. **Cost**: Completely free forever (no credit card charges after initial verification)

### **Setup Process:**

1. **Create Oracle Cloud Account**
   - Requires credit card for verification (won't charge)
   - Get $300 free credits for 30 days (bonus)

2. **Launch VM Instance**
   ```bash
   # Ubuntu 22.04 LTS recommended
   # Shape: VM.Standard.A1.Flex (ARM-based, more memory)
   # Memory: 6 GB (you get 24 GB total, can split)
   # OCPU: 1
   ```

3. **Install Node.js & Dependencies**
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y
   
   # Install Node.js 18.x
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # Install PM2 for process management
   sudo npm install -g pm2
   ```

4. **Deploy Your App**
   ```bash
   # Clone your repo
   git clone <your-repo>
   cd minuteman
   
   # Install dependencies
   npm install
   
   # Set environment variables
   sudo nano .env
   # Add your QT credentials
   
   # Start with PM2
   pm2 start proxy-server.js --name "fuel-dispatch"
   pm2 startup
   pm2 save
   ```

5. **Configure Firewall**
   ```bash
   # Open port 3000 (or your app port)
   sudo ufw allow 3000
   sudo ufw enable
   ```

### **Advantages Over Other Options:**

| Platform | Always Free | Persistent | Memory | Setup Complexity |
|----------|-------------|------------|---------|------------------|
| **Oracle VM** | ✅ Yes | ✅ Yes | 6GB | Medium |
| Railway | ❌ $5/month | ✅ Yes | 512MB | Easy |
| Render | ✅ Yes | ❌ Sleeps | 512MB | Easy |
| Google Cloud Run | ✅ Yes | ❌ Serverless | 512MB | Complex |

### **Additional Benefits:**

1. **Custom Domain**: Point your domain to the VM IP
2. **SSL Certificate**: Use Let's Encrypt for HTTPS
3. **Backup**: Easy VM snapshots
4. **Scaling**: Can upgrade to paid tier if needed
5. **Monitoring**: Oracle Cloud monitoring included

### **Potential Considerations:**

1. **Setup Time**: Takes 30-60 minutes to set up initially
2. **Maintenance**: You're responsible for OS updates
3. **Learning Curve**: Basic Linux knowledge helpful
4. **IP Address**: Dynamic IP (can use Oracle's reserved IP for free)

### **Recommended Oracle VM Configuration:**

```
Instance: VM.Standard.A1.Flex
Memory: 6 GB
OCPU: 1
OS: Ubuntu 22.04 LTS
Storage: 50 GB (plenty for your app)
```

### **Quick Setup Script:**

I can help you create a deployment script that automates the entire setup process, including:
- Node.js installation
- PM2 setup
- Environment configuration
- SSL certificate setup
- Firewall configuration

**Oracle Cloud Free Tier is actually one of the best options for your use case** - you get a real VM that runs continuously, has good resources, and is completely free. The setup is more involved than Railway/Render, but you get much better performance and reliability.

Would you like me to help you create the deployment scripts and guide you through the Oracle Cloud setup process?

```shellscript
   # Ubuntu 22.04 LTS recommended
   # Shape: VM.Standard.A1.Flex (ARM-based, more memory)
   # Memory: 6 GB (you get 24 GB total, can split)
   # OCPU: 1
```

```shellscript
   # Update system
   sudo apt update && sudo apt upgrade -y
   
   # Install Node.js 18.x
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # Install PM2 for process management
   sudo npm install -g pm2
```

```shellscript
   # Clone your repo
   git clone <your-repo>
   cd minuteman
   
   # Install dependencies
   npm install
   
   # Set environment variables
   sudo nano .env
   # Add your QT credentials
   
   # Start with PM2
   pm2 start proxy-server.js --name "fuel-dispatch"
   pm2 startup
   pm2 save
```

```shellscript
   # Open port 3000 (or your app port)
   sudo ufw allow 3000
   sudo ufw enable
```

```plaintext
Instance: VM.Standard.A1.Flex
Memory: 6 GB
OCPU: 1
OS: Ubuntu 22.04 LTS
Storage: 50 GB (plenty for your app)
```

---

**User**

Yes

---

**Cursor**

Perfect! I'll create a comprehensive deployment setup for Oracle Cloud Free Tier. Let me create the necessary files and scripts.


Now I'll create all the necessary deployment files for Oracle Cloud:

## **1. PM2 Ecosystem File**

```javascript:ecosystem.config.js
module.exports = {
  apps: [{
    name: 'fuel-dispatch-monitor',
    script: 'proxy-server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

## **2. Deployment Script**

```bash:deploy.sh
#!/bin/bash

# Oracle Cloud Deployment Script for Fuel Dispatch Monitor
# Run this script on your Oracle Cloud VM instance

set -e  # Exit on any error

echo "🚀 Starting Oracle Cloud deployment for Fuel Dispatch Monitor..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    print_error "Please don't run this script as root. Use a regular user with sudo privileges."
    exit 1
fi

# Update system
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install essential packages
print_status "Installing essential packages..."
sudo apt install -y curl wget git unzip software-properties-common apt-transport-https ca-certificates gnupg lsb-release

# Install Node.js 18.x
print_status "Installing Node.js 18.x..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    print_success "Node.js installed successfully"
else
    print_warning "Node.js already installed: $(node --version)"
fi

# Install PM2 globally
print_status "Installing PM2 process manager..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
    print_success "PM2 installed successfully"
else
    print_warning "PM2 already installed: $(pm2 --version)"
fi

# Install Nginx for reverse proxy and SSL
print_status "Installing Nginx..."
sudo apt install -y nginx

# Install Certbot for SSL certificates
print_status "Installing Certbot for SSL certificates..."
sudo apt install -y certbot python3-certbot-nginx

# Create application directory
APP_DIR="/home/$USER/fuel-dispatch-monitor"
print_status "Setting up application directory: $APP_DIR"

if [ ! -d "$APP_DIR" ]; then
    mkdir -p "$APP_DIR"
    print_success "Application directory created"
else
    print_warning "Application directory already exists"
fi

# Create logs directory
mkdir -p "$APP_DIR/logs"

# Copy application files (assuming script is run from project directory)
print_status "Copying application files..."
cp -r . "$APP_DIR/"
cd "$APP_DIR"

# Install npm dependencies
print_status "Installing npm dependencies..."
npm install --production

# Set up environment variables
print_status "Setting up environment variables..."
if [ ! -f ".env" ]; then
    cat > .env << EOF
# QT Technologies API Credentials
QT_USERNAME=your_qt_username_here
QT_PASSWORD=your_qt_password_here
QT_COMPANY_LOCATION_ID=your_company_location_id_here
QT_USER_ID=your_user_id_here

# Application Settings
PORT=3000
POLL_INTERVAL=30000
NODE_ENV=production
EOF
    print_warning "Please edit .env file with your actual QT credentials:"
    print_warning "nano $APP_DIR/.env"
else
    print_success "Environment file already exists"
fi

# Set proper permissions
print_status "Setting proper file permissions..."
chmod 600 .env
chown -R $USER:$USER "$APP_DIR"

# Configure Nginx
print_status "Configuring Nginx..."
sudo tee /etc/nginx/sites-available/fuel-dispatch-monitor > /dev/null << EOF
server {
    listen 80;
    server_name _;  # Replace with your domain if you have one

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3000/api/health;
        access_log off;
    }
}
EOF

# Enable the site
sudo ln -sf /etc/nginx/sites-available/fuel-dispatch-monitor /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
print_status "Testing Nginx configuration..."
sudo nginx -t

# Configure firewall
print_status "Configuring firewall..."
sudo ufw allow 'Nginx Full'
sudo ufw allow ssh
sudo ufw --force enable

# Start the application with PM2
print_status "Starting application with PM2..."
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot
pm2 startup

# Reload Nginx
print_status "Reloading Nginx..."
sudo systemctl reload nginx

# Enable Nginx to start on boot
sudo systemctl enable nginx

print_success "Deployment completed successfully!"
echo ""
print_status "Next steps:"
echo "1. Edit your environment variables:"
echo "   nano $APP_DIR/.env"
echo ""
echo "2. Restart the application:"
echo "   pm2 restart fuel-dispatch-monitor"
echo ""
echo "3. Check application status:"
echo "   pm2 status"
echo "   pm2 logs fuel-dispatch-monitor"
echo ""
echo "4. Access your application:"
echo "   http://$(curl -s ifconfig.me)"
echo ""
print_warning "To set up SSL certificate with Let's Encrypt:"
echo "   sudo certbot --nginx -d yourdomain.com"
echo ""
print_status "Useful commands:"
echo "   pm2 status                    # Check app status"
echo "   pm2 logs fuel-dispatch-monitor # View logs"
echo "   pm2 restart fuel-dispatch-monitor # Restart app"
echo "   sudo systemctl status nginx   # Check Nginx status"
echo "   sudo journalctl -u nginx      # View Nginx logs"
```

## **3. Environment Template**

```bash:.env.template
# QT Technologies API Credentials
QT_USERNAME=your_qt_username_here
QT_PASSWORD=your_qt_password_here
QT_COMPANY_LOCATION_ID=your_company_location_id_here
QT_USER_ID=your_user_id_here

# Application Settings
PORT=3000
POLL_INTERVAL=30000
NODE_ENV=production
```

## **4. Updated Package.json with PM2 Scripts**

```json:package.json
{
  "name": "fuel-dispatch-monitor",
  "version": "1.0.0",
  "description": "Fuel Dispatch Monitor with QT Technologies API integration",
  "main": "proxy-server.js",
  "scripts": {
    "start": "node proxy-server.js",
    "dev": "node proxy-server.js",
    "pm2:start": "pm2 start ecosystem.config.js --env production",
    "pm2:stop": "pm2 stop fuel-dispatch-monitor",
    "pm2:restart": "pm2 restart fuel-dispatch-monitor",
    "pm2:logs": "pm2 logs fuel-dispatch-monitor",
    "pm2:status": "pm2 status"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "node-fetch": "^2.6.7",
    "dotenv": "^16.3.1"
  },
  "keywords": ["fuel", "dispatch", "aviation", "monitoring"],
  "author": "",
  "license": "ISC"
}
```

## **5. SSL Setup Script (Optional)**

```bash:setup-ssl.sh
#!/bin/bash

# SSL Certificate Setup Script
# Run this after you have a domain pointing to your server

set -e

echo "🔒 Setting up SSL certificate with Let's Encrypt..."

# Check if domain is provided
if [ -z "$1" ]; then
    echo "Usage: $0 yourdomain.com"
    exit 1
fi

DOMAIN=$1

# Install certbot if not already installed
if ! command -v certbot &> /dev/null; then
    sudo apt install -y certbot python3-certbot-nginx
fi

# Obtain SSL certificate
echo "Obtaining SSL certificate for $DOMAIN..."
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN

# Set up automatic renewal
echo "Setting up automatic certificate renewal..."
sudo crontab -l 2>/dev/null | { cat; echo "0 12 * * * /usr/bin/certbot renew --quiet"; } | sudo crontab -

echo "✅ SSL certificate setup completed!"
echo "Your site is now available at: https://$DOMAIN"
```

## **6. Monitoring Script**

```bash:monitor.sh
#!/bin/bash

# Application Monitoring Script

echo "📊 Fuel Dispatch Monitor Status"
echo "================================"

# Check PM2 status
echo "PM2 Process Status:"
pm2 status

echo ""
echo "Application Logs (last 20 lines):"
pm2 logs fuel-dispatch-monitor --lines 20

echo ""
echo "System Resources:"
echo "CPU Usage: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)%"
echo "Memory Usage: $(free | grep Mem | awk '{printf("%.1f%%", $3/$2 * 100.0)}')"
echo "Disk Usage: $(df -h / | awk 'NR==2{print $5}')"

echo ""
echo "Network Status:"
echo "Public IP: $(curl -s ifconfig.me)"
echo "Nginx Status: $(systemctl is-active nginx)"

echo ""
echo "Recent Application Errors:"
pm2 logs fuel-dispatch-monitor --err --lines 10
```

## **Step-by-Step Oracle Cloud Setup:**

### **1. Create Oracle Cloud Account**
1. Go to [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/)
2. Sign up (requires credit card for verification)
3. Get $300 free credits for 30 days

### **2. Create VM Instance**
1. **Compute** → **Instances** → **Create Instance**
2. **Name**: `fuel-dispatch-monitor`
3. **Image**: Canonical Ubuntu 22.04
4. **Shape**: VM.Standard.A1.Flex
   - **Memory**: 6 GB
   - **OCPU**: 1
5. **Network**: Create new VCN or use default
6. **Public IP**: Yes
7. **Boot Volume**: 50 GB

### **3. Connect to Your VM**
```bash
# SSH into your VM
ssh ubuntu@YOUR_VM_IP

# Update the deployment script permissions
chmod +x deploy.sh

# Run the deployment script
./deploy.sh
```

### **4. Configure Environment Variables**
```bash
# Edit the environment file
nano .env

# Add your actual QT credentials
QT_USERNAME=your_actual_username
QT_PASSWORD=your_actual_password
QT_COMPANY_LOCATION_ID=your_actual_id
QT_USER_ID=your_actual_user_id
```

### **5. Start the Application**
```bash
# Restart with new environment variables
pm2 restart fuel-dispatch-monitor

# Check status
pm2 status
pm2 logs fuel-dispatch-monitor
```

### **6. Access Your Application**
- **HTTP**: `http://YOUR_VM_IP`
- **Fuel Dispatch**: `http://YOUR_VM_IP/fuel_dispatch_app.html`
- **Fuel Farm**: `http://YOUR_VM_IP/fuel_farm`

### **7. Optional: Set Up Custom Domain & SSL**
```bash
# Point your domain to the VM IP
# Then run SSL setup
./setup-ssl.sh yourdomain.com
```

## **Useful Commands After Deployment:**

```bash
# Check application status
pm2 status
pm2 logs fuel-dispatch-monitor

# Restart application
pm2 restart fuel-dispatch-monitor

# Monitor system resources
./monitor.sh

# Update application
git pull
npm install
pm2 restart fuel-dispatch-monitor

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

This setup gives you a production-ready deployment with:
- ✅ **Process management** (PM2)
- ✅ **Reverse proxy** (Nginx)
- ✅ **SSL support** (Let's Encrypt)
- ✅ **Firewall configuration**
- ✅ **Automatic startup**
- ✅ **Logging and monitoring**
- ✅ **Easy updates and maintenance**

Would you like me to explain any part of this setup in more detail or help you with the Oracle Cloud console setup?

```javascript
module.exports = {
  apps: [{
    name: 'fuel-dispatch-monitor',
    script: 'proxy-server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

```shellscript
#!/bin/bash

# Oracle Cloud Deployment Script for Fuel Dispatch Monitor
# Run this script on your Oracle Cloud VM instance

set -e  # Exit on any error

echo "🚀 Starting Oracle Cloud deployment for Fuel Dispatch Monitor..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    print_error "Please don't run this script as root. Use a regular user with sudo privileges."
    exit 1
fi

# Update system
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install essential packages
print_status "Installing essential packages..."
sudo apt install -y curl wget git unzip software-properties-common apt-transport-https ca-certificates gnupg lsb-release

# Install Node.js 18.x
print_status "Installing Node.js 18.x..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    print_success "Node.js installed successfully"
else
    print_warning "Node.js already installed: $(node --version)"
fi

# Install PM2 globally
print_status "Installing PM2 process manager..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
    print_success "PM2 installed successfully"
else
    print_warning "PM2 already installed: $(pm2 --version)"
fi

# Install Nginx for reverse proxy and SSL
print_status "Installing Nginx..."
sudo apt install -y nginx

# Install Certbot for SSL certificates
print_status "Installing Certbot for SSL certificates..."
sudo apt install -y certbot python3-certbot-nginx

# Create application directory
APP_DIR="/home/$USER/fuel-dispatch-monitor"
print_status "Setting up application directory: $APP_DIR"

if [ ! -d "$APP_DIR" ]; then
    mkdir -p "$APP_DIR"
    print_success "Application directory created"
else
    print_warning "Application directory already exists"
fi

# Create logs directory
mkdir -p "$APP_DIR/logs"

# Copy application files (assuming script is run from project directory)
print_status "Copying application files..."
cp -r . "$APP_DIR/"
cd "$APP_DIR"

# Install npm dependencies
print_status "Installing npm dependencies..."
npm install --production

# Set up environment variables
print_status "Setting up environment variables..."
if [ ! -f ".env" ]; then
    cat > .env << EOF
# QT Technologies API Credentials
QT_USERNAME=your_qt_username_here
QT_PASSWORD=your_qt_password_here
QT_COMPANY_LOCATION_ID=your_company_location_id_here
QT_USER_ID=your_user_id_here

# Application Settings
PORT=3000
POLL_INTERVAL=30000
NODE_ENV=production
EOF
    print_warning "Please edit .env file with your actual QT credentials:"
    print_warning "nano $APP_DIR/.env"
else
    print_success "Environment file already exists"
fi

# Set proper permissions
print_status "Setting proper file permissions..."
chmod 600 .env
chown -R $USER:$USER "$APP_DIR"

# Configure Nginx
print_status "Configuring Nginx..."
sudo tee /etc/nginx/sites-available/fuel-dispatch-monitor > /dev/null << EOF
server {
    listen 80;
    server_name _;  # Replace with your domain if you have one

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3000/api/health;
        access_log off;
    }
}
EOF

# Enable the site
sudo ln -sf /etc/nginx/sites-available/fuel-dispatch-monitor /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
print_status "Testing Nginx configuration..."
sudo nginx -t

# Configure firewall
print_status "Configuring firewall..."
sudo ufw allow 'Nginx Full'
sudo ufw allow ssh
sudo ufw --force enable

# Start the application with PM2
print_status "Starting application with PM2..."
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot
pm2 startup

# Reload Nginx
print_status "Reloading Nginx..."
sudo systemctl reload nginx

# Enable Nginx to start on boot
sudo systemctl enable nginx

print_success "Deployment completed successfully!"
echo ""
print_status "Next steps:"
echo "1. Edit your environment variables:"
echo "   nano $APP_DIR/.env"
echo ""
echo "2. Restart the application:"
echo "   pm2 restart fuel-dispatch-monitor"
echo ""
echo "3. Check application status:"
echo "   pm2 status"
echo "   pm2 logs fuel-dispatch-monitor"
echo ""
echo "4. Access your application:"
echo "   http://$(curl -s ifconfig.me)"
echo ""
print_warning "To set up SSL certificate with Let's Encrypt:"
echo "   sudo certbot --nginx -d yourdomain.com"
echo ""
print_status "Useful commands:"
echo "   pm2 status                    # Check app status"
echo "   pm2 logs fuel-dispatch-monitor # View logs"
echo "   pm2 restart fuel-dispatch-monitor # Restart app"
echo "   sudo systemctl status nginx   # Check Nginx status"
echo "   sudo journalctl -u nginx      # View Nginx logs"
```

```shellscript
# QT Technologies API Credentials
QT_USERNAME=your_qt_username_here
QT_PASSWORD=your_qt_password_here
QT_COMPANY_LOCATION_ID=your_company_location_id_here
QT_USER_ID=your_user_id_here

# Application Settings
PORT=3000
POLL_INTERVAL=30000
NODE_ENV=production
```

```json
{
  "name": "fuel-dispatch-monitor",
  "version": "1.0.0",
  "description": "Fuel Dispatch Monitor with QT Technologies API integration",
  "main": "proxy-server.js",
  "scripts": {
    "start": "node proxy-server.js",
    "dev": "node proxy-server.js",
    "pm2:start": "pm2 start ecosystem.config.js --env production",
    "pm2:stop": "pm2 stop fuel-dispatch-monitor",
    "pm2:restart": "pm2 restart fuel-dispatch-monitor",
    "pm2:logs": "pm2 logs fuel-dispatch-monitor",
    "pm2:status": "pm2 status"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "node-fetch": "^2.6.7",
    "dotenv": "^16.3.1"
  },
  "keywords": ["fuel", "dispatch", "aviation", "monitoring"],
  "author": "",
  "license": "ISC"
}
```

```shellscript
#!/bin/bash

# SSL Certificate Setup Script
# Run this after you have a domain pointing to your server

set -e

echo "🔒 Setting up SSL certificate with Let's Encrypt..."

# Check if domain is provided
if [ -z "$1" ]; then
    echo "Usage: $0 yourdomain.com"
    exit 1
fi

DOMAIN=$1

# Install certbot if not already installed
if ! command -v certbot &> /dev/null; then
    sudo apt install -y certbot python3-certbot-nginx
fi

# Obtain SSL certificate
echo "Obtaining SSL certificate for $DOMAIN..."
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN

# Set up automatic renewal
echo "Setting up automatic certificate renewal..."
sudo crontab -l 2>/dev/null | { cat; echo "0 12 * * * /usr/bin/certbot renew --quiet"; } | sudo crontab -

echo "✅ SSL certificate setup completed!"
echo "Your site is now available at: https://$DOMAIN"
```

```shellscript
#!/bin/bash

# Application Monitoring Script

echo "📊 Fuel Dispatch Monitor Status"
echo "================================"

# Check PM2 status
echo "PM2 Process Status:"
pm2 status

echo ""
echo "Application Logs (last 20 lines):"
pm2 logs fuel-dispatch-monitor --lines 20

echo ""
echo "System Resources:"
echo "CPU Usage: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)%"
echo "Memory Usage: $(free | grep Mem | awk '{printf("%.1f%%", $3/$2 * 100.0)}')"
echo "Disk Usage: $(df -h / | awk 'NR==2{print $5}')"

echo ""
echo "Network Status:"
echo "Public IP: $(curl -s ifconfig.me)"
echo "Nginx Status: $(systemctl is-active nginx)"

echo ""
echo "Recent Application Errors:"
pm2 logs fuel-dispatch-monitor --err --lines 10
```

```shellscript
# SSH into your VM
ssh ubuntu@YOUR_VM_IP

# Update the deployment script permissions
chmod +x deploy.sh

# Run the deployment script
./deploy.sh
```

```shellscript
# Edit the environment file
nano .env

# Add your actual QT credentials
QT_USERNAME=your_actual_username
QT_PASSWORD=your_actual_password
QT_COMPANY_LOCATION_ID=your_actual_id
QT_USER_ID=your_actual_user_id
```

```shellscript
# Restart with new environment variables
pm2 restart fuel-dispatch-monitor

# Check status
pm2 status
pm2 logs fuel-dispatch-monitor
```

```shellscript
# Point your domain to the VM IP
# Then run SSL setup
./setup-ssl.sh yourdomain.com
```

```shellscript
# Check application status
pm2 status
pm2 logs fuel-dispatch-monitor

# Restart application
pm2 restart fuel-dispatch-monitor

# Monitor system resources
./monitor.sh

# Update application
git pull
npm install
pm2 restart fuel-dispatch-monitor

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

