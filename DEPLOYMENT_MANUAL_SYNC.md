# Quick Implementation Guide - Manual Sync Buttons

## Files Created
1. ✅ `static/src/js/manual_sync_widget.js` - Button widget component
2. ✅ `static/src/js/chrome_widgets.js` - Chrome integration
3. ✅ `MANUAL_SYNC_BUTTONS.md` - Feature documentation

## Files Modified
1. ✅ `static/src/xml/pos_templates.xml` - Added button templates
2. ✅ `static/src/css/pos_sync.css` - Added button styles
3. ✅ `views/assets.xml` - Added new JS files

## Deployment Steps

### 1. Upgrade Module
```bash
# In Odoo container or shell
python odoo-bin -u weha_pos_self_sync -d odoo13_pos --stop-after-init

# Or via UI
# Apps → weha_pos_self_sync → Upgrade
```

### 2. Restart Odoo (if using Docker)
```bash
docker restart odoo13_app
```

### 3. Clear Browser Cache
- Hard refresh: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
- Or clear browser cache completely

### 4. Test
1. Open POS session
2. Verify buttons appear in header (if hybrid sync enabled)
3. Click each button to test:
   - Delta Sync
   - Delete Sync
   - Stock Sync

## Button Behavior

### Delta Sync Button
- **Icon**: Refresh (fa-refresh)
- **Color**: Purple gradient
- **Action**: Syncs all product, partner, and pricelist changes
- **Method**: `sync_service.sync_delta_updates()`

### Delete Sync Button
- **Icon**: Trash (fa-trash)
- **Color**: Pink gradient
- **Action**: Removes deleted products, partners, and pricelist items
- **Methods**: 
  - `_remove_deleted_products()`
  - `_remove_deleted_partners()`
  - `_remove_deleted_pricelist_items()`

### Stock Sync Button
- **Icon**: Cubes (fa-cubes)
- **Color**: Blue gradient
- **Action**: Syncs all stock quantities from server
- **Method**: `sync_service.sync_stock_quantities()`
- **Requirement**: Stock sync must be enabled in POS config

## Troubleshooting

### Buttons Don't Appear
- Check: Is hybrid sync enabled in POS config?
- Check: Is sync service initialized? (Console: `pos.sync_service`)
- Clear cache and refresh

### Button Clicks Do Nothing
- Check browser console for errors
- Verify sync_service exists
- Check network tab for API calls

### Popup Doesn't Show
- Check: Is `showPopup` method available?
- Check Odoo version compatibility
- Verify PosComponent is imported correctly

### Styling Issues
- Verify pos_sync.css is loaded
- Check for CSS conflicts
- Inspect element to verify classes applied

## Console Commands for Testing

```javascript
// Check if sync service exists
pos.sync_service

// Manually trigger delta sync
pos.sync_service.sync_delta_updates()

// Manually trigger stock sync
pos.sync_service.sync_stock_quantities()

// Check button widget
document.querySelector('.manual-sync-controls')
```

## Visual Indicators

### Idle State
- Normal gradient background
- Normal cursor

### Hover State
- Brightened gradient
- Lift effect (2px up)
- Shadow added

### Syncing State
- Rotating icon
- "Syncing..." text
- Button disabled
- Pointer events none

### Disabled State
- 50% opacity
- Not allowed cursor

## Configuration Requirements

### Minimum Requirements
- `enable_hybrid_sync = True` in POS config

### For Stock Sync Button
- `enable_hybrid_sync = True`
- `enable_stock_sync = True`
- Valid stock_location_id set

## Integration Points

### Widget Placement
- Located in Chrome header
- After `.pos-branding` element
- Uses `t-if="showManualSyncControls"` condition

### Sync Service Methods
- `sync_delta_updates()` - Returns boolean (false if already in progress)
- `sync_stock_quantities()` - Returns {success, count} or {success, reason, error}
- Internal deletion methods - No return value, throws on error

### State Management
- Each button has independent state
- State updates trigger re-render
- Prevents simultaneous syncs

## Next Steps After Deployment

1. ✅ Upgrade module
2. ✅ Restart Odoo
3. ✅ Clear browser cache
4. ✅ Open POS
5. ✅ Test each button
6. ✅ Monitor console for errors
7. ✅ Verify sync operations complete
8. ✅ Check data updates in backend

