# POS Hybrid Sync - Offline-First Enhancement for Odoo 13

A comprehensive Odoo 13 POS module that provides offline-first capability, reliable background synchronization, and performance optimization without requiring any middleware.

## 🎯 Features

### Core Functionality
- ✅ **Offline-First POS**: Full POS functionality even without internet connection
- ✅ **Background Sync**: Automatic order synchronization every 5-10 seconds (configurable)
- ✅ **Retry Mechanism**: Exponential backoff retry logic (5s → 10s → 30s → 60s → 120s)
- ✅ **Sync Queue**: Persistent queue with status tracking (pending, syncing, synced, failed)
- ✅ **UUID Support**: Prevents duplicate order submission
- ✅ **Auto-Save**: Automatically saves orders to prevent data loss on reload

### Performance Optimization
- ✅ **Lazy Loading**: Load products on-demand instead of all at startup
- ✅ **Delta Sync**: Only sync changed products/partners using write_date
- ✅ **IndexedDB**: Persistent local storage for products, partners, orders
- ✅ **Fast Startup**: Loads in <3 seconds with minimal initial data
- ✅ **Category-based Loading**: Load products when category is selected
- ✅ **Search Integration**: Server-side product search

### User Experience
- ✅ **Sync Status Indicator**: Visual indicator showing online/offline/syncing status
- ✅ **Pending Counter**: Shows number of orders waiting to sync
- ✅ **Sync Details Popup**: View queue status and statistics
- ✅ **Network Detection**: Automatic sync when connection is restored
- ✅ **Error Handling**: Graceful error handling with user notifications

## 📁 Module Structure

```
weha_pos_self_sync/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   ├── pos_order.py          # Order model with UUID support
│   ├── pos_config.py          # Configuration options
│   └── pos_session.py         # Session with delta sync
├── controllers/
│   ├── __init__.py
│   └── main.py                # Sync endpoints (get_updates, sync_status, etc.)
├── static/src/
│   ├── js/
│   │   ├── db_extended.js     # IndexedDB integration
│   │   ├── sync_service.js    # Background sync worker
│   │   ├── models_extended.js # Lazy loading & delta sync
│   │   ├── order_sync.js      # Order queue management
│   │   └── pos_patch.js       # POS integration
│   ├── css/
│   │   └── pos_sync.css       # Styling
│   └── xml/
│       └── pos_templates.xml  # UI templates
├── views/
│   ├── assets.xml             # Asset loading
│   └── pos_config_views.xml   # Configuration views
├── security/
│   └── ir.model.access.csv    # Access rights
└── README.md
```

## 🚀 Installation

### 1. Install Module
```bash
# Copy module to Odoo addons folder
cp -r weha_pos_self_sync /path/to/odoo/addons/

# Restart Odoo
sudo service odoo restart

# Update app list and install
# Go to Apps → Update Apps List → Search "POS Hybrid Sync" → Install
```

### 2. Configure POS

1. Go to **Point of Sale → Configuration → Point of Sale**
2. Select your POS
3. Go to **Hybrid Sync** tab
4. Enable settings:
   - ✅ Enable Hybrid Sync
   - ✅ Sync Interval: 10 seconds (recommended)
   - ✅ Max Sync Retries: 5
   - ✅ Lazy Load Products
   - ✅ Initial Product Load: 100
   - ✅ Auto-save Orders
   - ✅ Enable Delta Sync

## 📖 Usage

### Starting POS
1. Open POS as usual
2. Module automatically:
   - Initializes IndexedDB
   - Loads minimal data for fast startup
   - Starts background sync service
   - Restores any unsaved orders

### Creating Orders
1. Create orders normally in POS
2. Orders are automatically:
   - Saved to localStorage on every change
   - Assigned a unique UUID
   - Added to sync queue on validation
   - Synced in background when online

### Monitoring Sync Status
1. **Status Indicator** (top bar):
   - 🟢 Green = Online
   - 🔴 Red = Offline
   - 🟠 Orange (pulsing) = Syncing
   - Number badge = Pending orders count

2. **Sync Details** (click status indicator):
   - Connection status
   - Queue statistics (pending, failed, synced)
   - Sync history
   - Actions: Sync Now, Retry Failed, Clear Synced

### Offline Mode
1. POS continues working normally offline
2. Orders are queued automatically
3. When connection restored:
   - Automatic sync starts
   - Notification shows sync progress
   - Failed orders retry with backoff

## 🔧 Configuration Options

### Sync Settings
| Setting | Default | Description |
|---------|---------|-------------|
| Enable Hybrid Sync | True | Enable offline-first sync |
| Sync Interval | 10s | Background sync frequency (5-60s) |
| Max Sync Retries | 5 | Maximum retry attempts (1-10) |
| Enable Auto-save | True | Auto-save orders to prevent data loss |
| Enable Delta Sync | True | Only sync changed data |

### Performance Settings
| Setting | Default | Description |
|---------|---------|-------------|
| Lazy Load Products | True | Load products on-demand |
| Initial Product Limit | 100 | Number of products to load initially |

## 🔌 API Endpoints

### `/pos/get_updates` (POST - JSON)
Get delta updates for products and partners.

**Parameters:**
```json
{
  "session_id": 123,
  "last_write_date": "2026-04-15 10:00:00"
}
```

**Response:**
```json
{
  "products": [...],
  "partners": [...],
  "last_write_date": "2026-04-15 12:00:00",
  "sync_timestamp": "2026-04-15 12:00:00"
}
```

### `/pos/sync_status` (POST - JSON)
Get sync status for session.

**Response:**
```json
{
  "pending_count": 5,
  "failed_count": 2,
  "synced_count": 100,
  "total_count": 107
}
```

### `/pos/get_products_by_category` (POST - JSON)
Lazy load products by category.

**Parameters:**
```json
{
  "category_id": 10,
  "session_id": 123,
  "limit": 200,
  "offset": 0
}
```

### `/pos/search_products` (POST - JSON)
Search products by name, barcode, or reference.

**Parameters:**
```json
{
  "query": "laptop",
  "session_id": 123,
  "limit": 50
}
```

## 🗄️ IndexedDB Schema

### Object Stores

#### products_cache
- **Key**: `id` (product ID)
- **Indexes**: `write_date`, `pos_categ_id`
- **Purpose**: Cache products locally

#### partners_cache
- **Key**: `id` (partner ID)
- **Indexes**: `write_date`
- **Purpose**: Cache partners locally

#### orders_queue
- **Key**: `uuid` (order UUID)
- **Indexes**: `sync_status`, `created_at`
- **Fields**:
  - `uuid`: Unique identifier
  - `data`: Order JSON data
  - `sync_status`: pending_sync | syncing | synced | failed
  - `retry_count`: Number of retry attempts
  - `created_at`: Creation timestamp
  - `last_attempt`: Last sync attempt
  - `error_message`: Error details if failed

#### sync_logs
- **Key**: Auto-increment ID
- **Indexes**: `timestamp`, `type`
- **Purpose**: Log sync events for debugging

#### sync_metadata
- **Key**: `key` (metadata key)
- **Purpose**: Store sync timestamps and settings

## 🔒 Security

- ✅ UUID prevents duplicate orders
- ✅ Server-side validation
- ✅ User authentication required for all endpoints
- ✅ Access rights configured per user role

## 🧪 Testing

### Test Offline Mode
1. Open POS
2. Disable network in browser DevTools
3. Create and validate orders
4. Orders added to queue
5. Re-enable network
6. Verify automatic sync

### Test Retry Logic
1. Create order while offline
2. Enable network
3. Simulate server error (optional)
4. Observe retry with exponential backoff
5. Verify final sync success

### Test Lazy Loading
1. Open POS
2. Check initial product count (~100)
3. Click different categories
4. Verify products load on demand
5. Search for products
6. Verify server-side search

## 🐛 Debugging

### Enable Console Logs
Open browser console to see:
- Sync events and status
- Queue operations
- Network requests
- Error messages

### Export Sync Queue
```javascript
// In browser console
odoo.__DEBUG__.services['web.core'].bus.trigger('export_queue');
```

### View IndexedDB
1. Open Chrome DevTools
2. Go to Application tab
3. IndexedDB → pos_hybrid_sync_db
4. Inspect object stores

## ⚡ Performance Tips

1. **Adjust Initial Product Limit**: Lower for faster startup
2. **Sync Interval**: Increase if server load is high
3. **Clean Synced Orders**: Regularly clear old synced orders
4. **Delta Sync**: Keep enabled for minimal data transfer
5. **Lazy Loading**: Essential for large product catalogs (1000+)

## 📝 Changelog

### Version 1.0.0 (2026-04-15)
- Initial release
- Offline-first capability
- Background sync with retry
- Lazy loading
- Delta sync
- IndexedDB integration
- Auto-save orders
- Sync status UI

## 🤝 Support

For issues or questions:
1. Check console logs for errors
2. Export sync queue for analysis
3. Review sync logs in IndexedDB
4. Contact support with error details

## 📄 License

LGPL-3

## 👥 Credits

Developed for Odoo 13 POS enhancement project.

---

**Note**: This module is designed for Odoo 13 and requires no external middleware. All sync happens directly between the browser and Odoo backend via RPC.
