# Installation and Setup Guide

## Quick Start

### 1. Prerequisites
- Odoo 13 installed and running
- Point of Sale module installed
- Browser with IndexedDB support (Chrome, Firefox, Edge)

### 2. Install Module

#### Option A: Manual Installation
```bash
# Navigate to Odoo addons directory
cd /path/to/odoo/addons

# Ensure the module is in place
ls weha_pos_self_sync/

# Restart Odoo server
sudo systemctl restart odoo
# OR
sudo service odoo restart
```

#### Option B: Development Mode
1. Go to Odoo interface
2. Enable Developer Mode: Settings → Activate Developer Mode
3. Go to Apps → Update Apps List
4. Search for "POS Hybrid Sync"
5. Click Install

### 3. Configure POS

1. **Go to POS Settings**
   - Point of Sale → Configuration → Point of Sale
   - Select your POS configuration

2. **Enable Hybrid Sync**
   - Open "Hybrid Sync" tab
   - Check ✅ Enable Hybrid Sync

3. **Configure Sync Settings**
   ```
   Sync Interval: 10 seconds (recommended)
   Max Sync Retries: 5
   Enable Auto-save: ✅
   Enable Delta Sync: ✅
   ```

4. **Configure Performance Settings**
   ```
   Lazy Load Products: ✅
   Initial Product Limit: 100
   ```

5. **Save Configuration**

### 4. Test Installation

1. **Open POS**
   - Point of Sale → Dashboard → New Session → Open Session

2. **Check Sync Indicator**
   - Look for status indicator in top bar (should be green 🟢)
   
3. **Test Offline Mode**
   - Open browser DevTools (F12)
   - Go to Network tab
   - Select "Offline"
   - Try creating an order
   - Should work normally
   - Orders added to queue

4. **Test Sync**
   - Re-enable network
   - Orders should sync automatically
   - Check console for "Sync completed" message

## Verification Steps

### Check Module Installation
```bash
# In Odoo shell
python3 odoo-bin shell -d your_database

# In Python shell
>>> env['ir.module.module'].search([('name', '=', 'weha_pos_self_sync')])
# Should return module record with state='installed'
```

### Check Database Schema
```sql
-- Check if UUID field exists
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'pos_order' 
  AND column_name = 'uuid';

-- Check if sync_status field exists
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'pos_order' 
  AND column_name = 'sync_status';
```

### Check JavaScript Loading
1. Open POS in browser
2. Open DevTools Console (F12)
3. Type: `odoo.__DEBUG__.services`
4. Should see sync service loaded
5. Check for message: "Sync service initialized successfully"

### Check IndexedDB
1. Open POS
2. Open DevTools → Application tab
3. IndexedDB → Should see "pos_hybrid_sync_db"
4. Object stores should include:
   - products_cache
   - partners_cache
   - orders_queue
   - sync_logs
   - sync_metadata

## Troubleshooting

### Module Not Appearing in Apps List
```bash
# Update app list
# In Odoo UI: Apps → Update Apps List

# OR via command line
python3 odoo-bin -d your_database -u weha_pos_self_sync
```

### JavaScript Not Loading
1. Clear browser cache (Ctrl+Shift+Delete)
2. Restart Odoo with assets rebuild:
   ```bash
   python3 odoo-bin -d your_database --dev=all
   ```
3. Refresh POS (Ctrl+F5)

### Sync Not Working
1. Check browser console for errors
2. Verify network connectivity
3. Check Odoo logs:
   ```bash
   tail -f /var/log/odoo/odoo.log
   ```
4. Test endpoints manually:
   ```javascript
   // In browser console
   fetch('/pos/get_updates', {
     method: 'POST',
     headers: {'Content-Type': 'application/json'},
     body: JSON.stringify({
       jsonrpc: "2.0",
       method: "call",
       params: {session_id: 1, last_write_date: null}
     })
   }).then(r => r.json()).then(console.log);
   ```

### Orders Not Syncing
1. Open DevTools Console
2. Check sync status:
   ```javascript
   // Get pending orders
   const db = odoo.__DEBUG__.services['point_of_sale.db'];
   db.get_pending_orders().then(console.log);
   ```
3. Force sync:
   ```javascript
   odoo.__DEBUG__.services['sync_service'].force_sync();
   ```

### Database Errors
```bash
# Upgrade module
python3 odoo-bin -d your_database -u weha_pos_self_sync

# If constraint errors occur
python3 odoo-bin -d your_database -u weha_pos_self_sync --update=all
```

## Configuration Tips

### For Large Product Catalogs (5000+ products)
```
Initial Product Limit: 50
Lazy Load Products: ✅ (essential)
Enable Delta Sync: ✅
Sync Interval: 15 seconds
```

### For Unstable Network
```
Max Sync Retries: 8
Sync Interval: 20 seconds
Enable Auto-save: ✅ (critical)
```

### For High-Traffic POS
```
Sync Interval: 5 seconds
Max Sync Retries: 10
Enable Delta Sync: ✅
```

## Uninstallation

### 1. Deactivate Module
1. Go to Apps
2. Search "POS Hybrid Sync"
3. Click Uninstall

### 2. Clean Database (Optional)
```sql
-- Remove UUID column (if needed)
ALTER TABLE pos_order DROP COLUMN IF EXISTS uuid;
ALTER TABLE pos_order DROP COLUMN IF EXISTS sync_status;
ALTER TABLE pos_order DROP COLUMN IF EXISTS sync_attempts;

-- Remove config fields
ALTER TABLE pos_config DROP COLUMN IF EXISTS enable_hybrid_sync;
```

### 3. Clear Browser Data
1. Open DevTools → Application
2. IndexedDB → Delete "pos_hybrid_sync_db"
3. Clear browser cache

## Support Commands

### Check Module Version
```python
# In Odoo shell
env['ir.module.module'].search([('name', '=', 'weha_pos_self_sync')]).latest_version
```

### View Sync Logs
```python
# In Odoo shell
env['pos.order'].search([('sync_status', '=', 'failed')], limit=10)
```

### Reset Sync Queue
```javascript
// In browser console
const pos = odoo.__DEBUG__.services['pos'];
pos.db.clear_all_cache().then(() => console.log('Cache cleared'));
```

## Next Steps

After successful installation:

1. ✅ Train users on offline mode
2. ✅ Set up monitoring for failed syncs
3. ✅ Configure backup procedures
4. ✅ Test with real transactions
5. ✅ Monitor performance metrics

## Additional Resources

- [README.md](README.md) - Full documentation
- Odoo logs: `/var/log/odoo/odoo.log`
- Browser console: F12 → Console tab
- IndexedDB: F12 → Application → IndexedDB

---

**Need Help?** Check the troubleshooting section or review console/server logs for specific error messages.
