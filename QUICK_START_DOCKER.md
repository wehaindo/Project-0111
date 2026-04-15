# 🚀 Quick Start - 3 Easy Steps!

## Option 1: Using Batch Files (Easiest - Windows)

### Step 1: Start Odoo
```
Double-click: start-odoo.bat
```
- Opens automatically in browser
- Wait 30-60 seconds for Odoo to start

### Step 2: Create Database
1. Browser opens at: http://localhost:8069
2. Fill in:
   - **Database Name**: `odoo13_pos`
   - **Email**: `admin@example.com`
   - **Password**: `admin`
   - **Demo Data**: ✅ (recommended)
3. Click **Create database**
4. Wait 2-3 minutes

### Step 3: Install POS Hybrid Sync
1. Go to **Apps**
2. Click **Update Apps List**
3. Search: `pos hybrid` or `weha_pos_self_sync`
4. Click **Install**
5. Done! 🎉

## Option 2: Using Command Line

### Windows PowerShell
```powershell
# Navigate to project
cd E:\OdooProjects\Project-0111

# Start Odoo
docker-compose up -d

# View logs
docker-compose logs -f odoo

# Access Odoo
start http://localhost:8069
```

### Stop Odoo
```powershell
docker-compose down
```

---

## 📋 Configuration Checklist

After installing the module:

1. **Enable Developer Mode**
   - Settings → Activate Developer Mode

2. **Configure POS**
   - Point of Sale → Configuration → Point of Sale
   - Create new or edit existing POS
   - Go to **Hybrid Sync** tab
   - Enable all options:
     ```
     ✅ Enable Hybrid Sync
     Sync Interval: 10 seconds
     Max Retries: 5
     ✅ Lazy Load Products  
     Initial Product Limit: 100
     ✅ Auto-save Orders
     ✅ Delta Sync
     ```
   - Click **Save**

3. **Open POS**
   - Point of Sale → Dashboard
   - Click **New Session**
   - Click **Open Session**

4. **Test Offline Mode**
   - Press F12 (DevTools)
   - Network tab → Offline
   - Create test order
   - Should work offline!
   - Set back to Online
   - Order syncs automatically

---

## 🎯 Testing Checklist

### Basic Tests
- [ ] POS opens successfully
- [ ] Sync indicator appears (green dot)
- [ ] Can create orders
- [ ] Orders save automatically

### Offline Tests  
- [ ] Enable offline mode (F12 → Network → Offline)
- [ ] Create order while offline
- [ ] Sync indicator turns red
- [ ] Pending counter shows orders
- [ ] Go back online
- [ ] Orders sync automatically
- [ ] Pending counter decreases

### Advanced Tests
- [ ] Click different categories (lazy loading)
- [ ] Search for products (server search)
- [ ] Click sync indicator (view details)
- [ ] Force sync manually
- [ ] Check IndexedDB (F12 → Application → IndexedDB)

---

## 🔧 Troubleshooting

### Port 8069 Already in Use
```powershell
# Find what's using the port
netstat -ano | findstr :8069

# Kill the process (replace PID)
taskkill /PID <PID> /F

# Or change port in docker-compose.yml
# ports: "8070:8069"
```

### Docker Not Running
1. Start Docker Desktop
2. Wait for it to be ready
3. Run `start-odoo.bat` again

### Can't Access http://localhost:8069
```powershell
# Check if containers are running
docker ps

# Check logs
docker-compose logs odoo

# Restart
docker-compose restart odoo
```

### Module Not Found
```powershell
# Check if module is mounted
docker exec -it odoo13_app ls -la /mnt/extra-addons/

# Restart Odoo
docker-compose restart odoo
```

---

## 📊 Default Credentials

### Odoo
- **URL**: http://localhost:8069
- **Email**: admin@example.com  
- **Password**: admin
- **Master Password**: admin

### Database
- **Host**: localhost
- **Port**: 5432
- **User**: odoo
- **Password**: odoo
- **Database**: odoo13_pos

---

## 🛠️ Useful Commands

```powershell
# Start
docker-compose up -d

# Stop
docker-compose down

# Restart
docker-compose restart

# View logs (live)
docker-compose logs -f odoo

# Access Odoo shell
docker exec -it odoo13_app odoo shell -d odoo13_pos

# Access database
docker exec -it odoo13_postgres psql -U odoo

# Update module
docker exec -it odoo13_app odoo -d odoo13_pos -u weha_pos_self_sync

# Check status
docker-compose ps
```

---

## 📁 Files Created

```
E:\OdooProjects\Project-0111\
├── docker-compose.yml       ← Docker configuration
├── odoo.conf               ← Odoo settings
├── .env                    ← Environment variables
├── DOCKER_README.md        ← Full Docker guide
├── QUICK_START_DOCKER.md   ← This file
├── start-odoo.bat         ← Start script (Windows)
├── stop-odoo.bat          ← Stop script (Windows)
├── logs-odoo.bat          ← View logs (Windows)
└── weha_pos_self_sync/    ← Your POS module
```

---

## ✅ Success Indicators

When everything is working:

1. **Odoo loads** at http://localhost:8069
2. **Green sync indicator** in POS (🟢)
3. **Can create orders** while offline
4. **Auto-sync** when back online
5. **No console errors** (F12)
6. **IndexedDB** populated with data

---

## 🆘 Need Help?

1. **Check logs**: Double-click `logs-odoo.bat`
2. **View documentation**: Open `DOCKER_README.md`
3. **Module docs**: See `weha_pos_self_sync/README.md`
4. **Check containers**: `docker-compose ps`

---

## 🎉 You're Ready!

**Next Steps:**
1. Click `start-odoo.bat`
2. Wait for browser to open
3. Create database
4. Install module
5. Test POS offline mode

**Enjoy your offline-first POS! 🚀**
