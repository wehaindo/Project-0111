# 🐳 Odoo 13 with POS Hybrid Sync - Docker Setup

## Quick Start (5 minutes)

### Prerequisites
- Docker installed ([Get Docker](https://docs.docker.com/get-docker/))
- Docker Compose installed (usually comes with Docker Desktop)
- 4GB RAM minimum
- 10GB free disk space

### 1. Start Odoo

```bash
# Navigate to project directory
cd E:\OdooProjects\Project-0111

# Start containers
docker-compose up -d

# Check logs
docker-compose logs -f odoo
```

### 2. Access Odoo

Open browser: **http://localhost:8069**

**First Time Setup:**
1. Create database:
   - Database Name: `odoo13_pos`
   - Email: `admin@example.com`
   - Password: `admin`
   - Language: English
   - Demo Data: ✅ Load (recommended for testing)

2. Wait for database creation (~2-3 minutes)

### 3. Install POS Hybrid Sync Module

1. **Enable Developer Mode:**
   - Settings → Activate Developer Mode

2. **Update Apps List:**
   - Apps → Update Apps List

3. **Install Module:**
   - Apps → Search "POS Hybrid Sync" or "weha_pos_self_sync"
   - Click **Install**

4. **Configure POS:**
   - Point of Sale → Configuration → Point of Sale
   - Create/Edit POS
   - Go to **Hybrid Sync** tab
   - Configure settings:
     ```
     ✅ Enable Hybrid Sync
     Sync Interval: 10 seconds
     Max Retries: 5
     ✅ Lazy Load Products
     Initial Product Limit: 100
     ✅ Auto-save Orders
     ✅ Delta Sync
     ```

5. **Open POS:**
   - Point of Sale → Dashboard → New Session → Open Session

---

## Docker Commands

### Container Management

```bash
# Start containers
docker-compose up -d

# Stop containers
docker-compose down

# Restart containers
docker-compose restart

# View logs
docker-compose logs -f

# View Odoo logs only
docker-compose logs -f odoo

# View database logs
docker-compose logs -f db
```

### Container Status

```bash
# Check running containers
docker-compose ps

# Check container health
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### Database Operations

```bash
# Backup database
docker exec -t odoo13_postgres pg_dump -U odoo odoo13_pos > backup.sql

# Restore database
cat backup.sql | docker exec -i odoo13_postgres psql -U odoo -d odoo13_pos

# Access PostgreSQL shell
docker exec -it odoo13_postgres psql -U odoo

# List databases
docker exec -it odoo13_postgres psql -U odoo -c "\l"
```

### Odoo Operations

```bash
# Access Odoo shell
docker exec -it odoo13_app odoo shell -d odoo13_pos

# Update module
docker exec -it odoo13_app odoo -d odoo13_pos -u weha_pos_self_sync

# Install module via command line
docker exec -it odoo13_app odoo -d odoo13_pos -i weha_pos_self_sync

# Access container bash
docker exec -it odoo13_app bash

# Check Odoo version
docker exec -it odoo13_app odoo --version
```

### Clean Up

```bash
# Stop and remove containers (keeps data)
docker-compose down

# Stop and remove containers + volumes (deletes all data!)
docker-compose down -v

# Remove unused Docker resources
docker system prune -a
```

---

## Folder Structure

```
E:\OdooProjects\Project-0111\
├── docker-compose.yml          # Docker Compose configuration
├── odoo.conf                   # Odoo configuration file
├── .env                        # Environment variables
├── DOCKER_README.md            # This file
├── logs/                       # Odoo logs (auto-created)
│   └── odoo.log
└── weha_pos_self_sync/         # Your POS module
    ├── __init__.py
    ├── __manifest__.py
    ├── models/
    ├── controllers/
    ├── static/
    ├── views/
    ├── security/
    └── ...
```

---

## Ports

| Service | Port | URL |
|---------|------|-----|
| Odoo Web | 8069 | http://localhost:8069 |
| Odoo Longpolling | 8072 | http://localhost:8072 |
| PostgreSQL | 5432 | localhost:5432 |

---

## Default Credentials

### Odoo
- **URL**: http://localhost:8069
- **Email**: admin@example.com
- **Password**: admin
- **Master Password**: admin

### PostgreSQL
- **Host**: localhost (or db from inside containers)
- **Port**: 5432
- **Database**: postgres (default) / odoo13_pos (your database)
- **User**: odoo
- **Password**: odoo

---

## Configuration

### Edit Odoo Configuration

```bash
# Edit odoo.conf
notepad odoo.conf

# Restart to apply changes
docker-compose restart odoo
```

### Edit Environment Variables

```bash
# Edit .env
notepad .env

# Recreate containers
docker-compose up -d --force-recreate
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs

# Check specific service
docker-compose logs odoo
docker-compose logs db

# Restart services
docker-compose restart
```

### Database Connection Issues

```bash
# Check if database is ready
docker exec odoo13_postgres pg_isready -U odoo

# Restart database
docker-compose restart db

# Wait for database to be healthy
docker-compose ps
```

### Module Not Found

```bash
# Check if module directory is mounted
docker exec -it odoo13_app ls -la /mnt/extra-addons/

# Verify module is there
docker exec -it odoo13_app ls -la /mnt/extra-addons/weha_pos_self_sync/

# Restart Odoo
docker-compose restart odoo
```

### Port Already in Use

```bash
# Check what's using port 8069
netstat -ano | findstr :8069

# Change port in docker-compose.yml
# ports:
#   - "8070:8069"  # Use 8070 instead

# Restart
docker-compose down
docker-compose up -d
```

### Odoo Crashes / Out of Memory

```bash
# Check container resources
docker stats

# Increase memory in Docker Desktop settings
# Settings → Resources → Memory (increase to 4GB+)

# Or edit odoo.conf workers
# workers = 0  # For development
```

### Can't Update Apps List

```bash
# Access Odoo container
docker exec -it odoo13_app bash

# Navigate to addons
cd /mnt/extra-addons/weha_pos_self_sync

# Check permissions
ls -la

# Fix permissions if needed (inside container)
chown -R odoo:odoo /mnt/extra-addons/weha_pos_self_sync
```

---

## Performance Optimization

### For Development

```yaml
# docker-compose.yml
command: >
  --
  --dev=all
  --workers=0
  --max-cron-threads=1
```

### For Production Testing

```yaml
# docker-compose.yml
command: >
  --
  --workers=2
  --max-cron-threads=2
  --limit-memory-hard=2684354560
```

---

## Testing POS Hybrid Sync

### 1. Test Online Mode

```bash
# 1. Open POS: http://localhost:8069
# 2. Point of Sale → Dashboard → Open Session
# 3. Create a test order
# 4. Check sync indicator (should be green 🟢)
```

### 2. Test Offline Mode

```bash
# In browser:
# 1. Open DevTools (F12)
# 2. Network tab → Set to "Offline"
# 3. Create orders (should work normally)
# 4. Check sync indicator (should be red 🔴)
# 5. Check pending counter (should increase)
# 6. Set back to "Online"
# 7. Orders should auto-sync
```

### 3. Test Lazy Loading

```bash
# 1. Open browser console (F12)
# 2. Check initial products loaded
# 3. Click different categories
# 4. Verify products load on demand
# 5. Search for products
# 6. Check console for "Loaded X products"
```

### 4. Check Sync Queue

```bash
# In browser console (F12):
pos.get_sync_queue_status().then(console.log);

# View IndexedDB:
# DevTools → Application → IndexedDB → pos_hybrid_sync_db
```

---

## Advanced Setup

### Custom Odoo Image (Optional)

Create `Dockerfile`:

```dockerfile
FROM odoo:13.0

USER root

# Install additional Python packages
RUN pip3 install --no-cache-dir \
    requests \
    beautifulsoup4

# Copy custom addons
COPY ./weha_pos_self_sync /mnt/extra-addons/weha_pos_self_sync

# Set permissions
RUN chown -R odoo:odoo /mnt/extra-addons

USER odoo
```

Build and use:

```bash
# Build image
docker build -t odoo13-custom .

# Update docker-compose.yml
# image: odoo13-custom

# Start
docker-compose up -d
```

### Multiple Odoo Instances

```yaml
# docker-compose.yml
services:
  odoo1:
    image: odoo:13.0
    ports:
      - "8069:8069"
    # ... config

  odoo2:
    image: odoo:13.0
    ports:
      - "8070:8069"
    # ... config
```

---

## Data Persistence

### Volumes

Data is stored in Docker volumes:

```bash
# List volumes
docker volume ls

# Inspect volume
docker volume inspect project-0111_odoo-web-data

# Backup volume
docker run --rm -v project-0111_odoo-web-data:/data -v $(pwd):/backup ubuntu tar czf /backup/odoo-data-backup.tar.gz /data

# Restore volume
docker run --rm -v project-0111_odoo-web-data:/data -v $(pwd):/backup ubuntu tar xzf /backup/odoo-data-backup.tar.gz -C /
```

---

## Maintenance

### Update Odoo

```bash
# Pull latest Odoo 13 image
docker pull odoo:13.0

# Recreate containers
docker-compose up -d --force-recreate
```

### Clean Logs

```bash
# Truncate Odoo logs
docker exec -it odoo13_app truncate -s 0 /var/log/odoo/odoo.log

# Or from host
echo "" > logs/odoo.log
```

### Optimize Database

```bash
# Access database
docker exec -it odoo13_postgres psql -U odoo -d odoo13_pos

# Vacuum database
VACUUM ANALYZE;

# Exit
\q
```

---

## Security Notes

⚠️ **This setup is for DEVELOPMENT/TESTING only!**

For production:
1. Change default passwords
2. Use SSL/TLS certificates
3. Configure firewall rules
4. Use Docker secrets for passwords
5. Limit network exposure
6. Regular backups
7. Update containers regularly

---

## Support

### View Logs

```bash
# Real-time logs
docker-compose logs -f

# Last 100 lines
docker-compose logs --tail=100

# Specific service
docker-compose logs -f odoo
```

### Get Help

```bash
# Docker Compose help
docker-compose --help

# Service info
docker-compose ps
docker-compose config
```

---

## Quick Reference

```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# Restart
docker-compose restart

# Logs
docker-compose logs -f odoo

# Shell
docker exec -it odoo13_app bash

# Database
docker exec -it odoo13_postgres psql -U odoo

# Update module
docker exec -it odoo13_app odoo -d odoo13_pos -u weha_pos_self_sync
```

---

## URLs

- **Odoo**: http://localhost:8069
- **PGAdmin** (if installed): http://localhost:5050
- **Database**: localhost:5432

---

## Next Steps

1. ✅ Start containers: `docker-compose up -d`
2. ✅ Access Odoo: http://localhost:8069
3. ✅ Create database
4. ✅ Install POS module
5. ✅ Install POS Hybrid Sync
6. ✅ Configure settings
7. ✅ Test offline mode
8. ✅ Monitor sync status

---

**Happy Testing! 🚀**

*For module documentation, see [README.md](weha_pos_self_sync/README.md)*
