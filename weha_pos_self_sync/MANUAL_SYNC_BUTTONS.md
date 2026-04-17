# Manual Sync Buttons Feature

## Overview
Added manual sync control buttons to the POS interface for on-demand synchronization operations.

## Features Added

### 1. Manual Sync Buttons
Three new buttons in the POS header:

1. **Delta Sync** (Purple gradient)
   - Manually triggers synchronization of product, partner, and pricelist changes
   - Shows spinning animation during sync
   - Displays success/error popup when complete

2. **Delete Sync** (Pink gradient)
   - Manually checks for and removes deleted products/partners
   - Syncs deletion records from server
   - Shows results in popup

3. **Stock Sync** (Blue gradient)
   - Manually triggers full stock quantity sync
   - Only visible when stock sync is enabled in POS config
   - Shows number of products synced

### 2. Visual Design

**Button Styling:**
- Modern gradient backgrounds with hover effects
- Smooth hover animations (2px lift + shadow)
- FontAwesome icons for visual clarity
- Loading state with rotating icon animation
- Disabled state during sync operations

**Colors:**
- Delta Sync: Purple gradient (#667eea → #764ba2)
- Delete Sync: Pink gradient (#f093fb → #f5576c)
- Stock Sync: Blue gradient (#4facfe → #00f2fe)

### 3. User Experience

**Button Behavior:**
- Click to trigger immediate sync
- Button disables during sync with "Syncing..." text
- Icon rotates during sync operation
- Popup notification on completion
- Error handling with informative messages

**Placement:**
- Located in POS header after branding
- Only visible when hybrid sync is enabled
- Responsive flex layout

## Files Created/Modified

### New Files:
1. `static/src/js/manual_sync_widget.js` - Widget component for manual sync buttons
2. `static/src/js/chrome_widgets.js` - Chrome extension to show/hide buttons

### Modified Files:
1. `static/src/xml/pos_templates.xml` - Added templates:
   - `ManualSyncControls` - Button widget template
   - `Chrome` extension - Integration into POS header

2. `static/src/css/pos_sync.css` - Added manual sync button styles:
   - `.manual-sync-controls` - Container styling
   - `.btn-delta-sync` - Delta sync button
   - `.btn-delete-sync` - Delete sync button
   - `.btn-stock-sync` - Stock sync button
   - Hover, active, disabled states
   - Syncing animation

3. `views/assets.xml` - Added new JS files to load order:
   - `manual_sync_widget.js`
   - `chrome_widgets.js`

## Technical Implementation

### Component Architecture
```javascript
class ManualSyncControls extends PosComponent {
    state = {
        delta_syncing: false,
        delete_syncing: false,
        stock_syncing: false
    }
    
    // Methods:
    - manual_delta_sync()
    - manual_delete_sync()
    - manual_stock_sync()
}
```

### Sync Service Integration
Buttons call existing sync_service methods:
- `check_and_sync_delta()` - Delta sync
- `check_deletions()` - Deletion sync
- `sync_stock_quantities()` - Stock sync

### State Management
- Each button maintains its own syncing state
- Buttons disable during active sync
- Re-render on state change
- Prevents multiple simultaneous syncs

## Usage

### For Users:
1. Open POS session
2. Ensure hybrid sync is enabled in POS config
3. Buttons appear in POS header
4. Click any button to manually trigger that sync operation
5. Wait for completion popup

### Configuration:
- Buttons only appear when `enable_hybrid_sync` is true in POS config
- Stock Sync button requires `enable_stock_sync` to be true
- No additional setup required

## Benefits

1. **User Control**: Operators can trigger sync on-demand without waiting for scheduled intervals
2. **Troubleshooting**: Easy way to test/verify sync functionality
3. **Immediate Updates**: Get latest data immediately when needed
4. **Visual Feedback**: Clear indication of sync status with animations
5. **Error Visibility**: Popups show sync results and any errors

## Testing Checklist

- [ ] Buttons appear in POS header when hybrid sync enabled
- [ ] Buttons hidden when hybrid sync disabled
- [ ] Delta sync button triggers product/partner/pricelist sync
- [ ] Delete sync button checks and removes deleted records
- [ ] Stock sync button syncs quantities (when enabled)
- [ ] Buttons disable during sync operation
- [ ] Icons rotate during sync
- [ ] Success popups show correct counts
- [ ] Error popups show when sync fails
- [ ] Multiple button clicks don't cause duplicate syncs
- [ ] Buttons work in both online and offline modes

## Future Enhancements

Potential improvements:
- Add progress bar for large syncs
- Show last sync timestamp on button tooltip
- Add badge with pending sync count
- Keyboard shortcuts for power users
- Sync history log viewer
- Configurable auto-sync after manual operations

