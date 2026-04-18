# Product Check Screen - User Guide

## Overview
The Product Check Screen allows you to browse all products, check prices and stock levels, search products, and quickly add them to orders directly from the POS interface.

## Features

### 1. **Browse All Products**
- Products load automatically when you open the screen
- No need to search first - see the complete catalog immediately
- Scroll through all available products

### 2. **Real-Time Search**
- Search as you type (300ms debounce for performance)
- Searches across:
  - Product Name
  - SKU (Internal Reference)
  - Barcode
- Results appear instantly
- Clear search to see all products again

### 3. **Stock Status Indicators**
Visual color-coded badges for quick stock assessment:

| Badge | Meaning | Color | Quantity |
|-------|---------|-------|----------|
| ✓ In Stock | Sufficient stock | Green | > 10 units |
| ⚠ Low Stock | Limited stock | Yellow | 1-10 units |
| ✕ Out of Stock | No stock available | Red | 0 units |

### 4. **Product Information**
Each product shows:
- **Product Name** - Full display name
- **SKU** - Internal reference code
- **Barcode** - Product barcode number
- **Price** - Current price from pricelist (formatted with currency)
- **Stock** - Available quantity with status badge
- **Add Button** - Quick add to current order

### 5. **Add to Order**
- Click "Add" button on any product
- Product is added to the current POS order
- Screen returns to main POS view
- Works for products not in the default product grid

## How to Use

### Opening the Screen
1. Click the **"Product List"** button in the POS interface
   - Look for the button with a history icon (📋)
   - Usually located in the left button pane

### Browsing Products
1. Screen opens with all products loaded
2. Scroll through the list to see all products
3. Check prices and stock at a glance

### Searching for Products
1. Type in the search box at the top
2. Results filter automatically as you type
3. Search works across name, SKU, and barcode
4. Press Enter for immediate search (no wait)

### Adding Products to Order
1. Find the product you want
2. Check stock availability (look at the colored badge)
3. Click the "Add" button
4. Product is added to your current order
5. Screen returns to POS automatically

### Returning to POS
- Click the "Back" button at the top left
- Or use Escape key

## Screen Layout

### Desktop View (Table)
```
┌─────────────────────────────────────────────────────────────┐
│ ◄ Back          🔍 Search by name, SKU, or barcode...      │
├─────────────────────────────────────────────────────────────┤
│ Product Name  │ SKU     │ Barcode │ Price  │ Stock        │
├─────────────────────────────────────────────────────────────┤
│ T-Shirt       │ TSH-001 │ 12345   │ $29.99 │ 10 ✓ In Stock│
│ Jeans         │ JNS-002 │ 23456   │ $59.99 │ 3 ⚠ Low Stock│
│ Shoes         │ SHO-003 │ 34567   │ $89.99 │ 0 ✕ Out Stock│
└─────────────────────────────────────────────────────────────┘
```

### Mobile View (Cards)
On tablets and phones, products display as cards in a grid layout:
```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   T-Shirt    │  │    Jeans     │  │    Shoes     │
│ SKU: TSH-001 │  │ SKU: JNS-002 │  │ SKU: SHO-003 │
│ Price: $29.99│  │ Price: $59.99│  │ Price: $89.99│
│ Stock: 10 ✓  │  │ Stock: 3 ⚠   │  │ Stock: 0 ✕   │
│ [Add to Order]│  │ [Add to Order]│  │ [Add to Order]│
└──────────────┘  └──────────────┘  └──────────────┘
```

## Tips & Best Practices

### Quick Search
- Start typing immediately - no need to click the search box
- Type just a few letters of the product name
- Search is case-insensitive
- Use SKU for exact matches

### Stock Management
- **Green badge** = Safe to sell, plenty in stock
- **Yellow badge** = Watch carefully, may need reorder
- **Red badge** = Cannot sell storable products with 0 stock

### Mobile Usage
- Swipe to scroll through product cards
- Tap cards to see full details
- Large "Add to Order" buttons for easy touch

## Troubleshooting

### Products Not Loading
**Problem:** Screen shows "Loading products..." forever

**Solutions:**
1. Wait 30 seconds (large catalogs take time)
2. Check your internet connection
3. Refresh POS session
4. Check Odoo server status

### Search Not Working
**Problem:** Typing doesn't filter products

**Solutions:**
1. Click in the search box to focus it
2. Try simpler search terms
3. Check for typos
4. Clear search and try again

### Add Button Not Working
**Problem:** Clicking "Add" does nothing

**Solutions:**
1. Check if product is out of stock (storable products)
2. Open browser console (F12) for error messages
3. Verify product is active in Odoo backend
4. Check if product has a valid price

### Button Not Visible
**Problem:** Can't find "Product List" button

**Solutions:**
1. Upgrade the `weha_pos_self_sync` module:
   ```
   docker exec -it odoo13_app odoo -d odoo13 -u weha_pos_self_sync --stop-after-init
   docker-compose restart odoo
   ```
2. Clear browser cache (Ctrl+Shift+Delete)
3. Refresh browser
4. Check module is installed in Apps menu

## Technical Details

### Search Mechanism
- **Local Search**: Filters from cached products (instant results)
- **Server Search**: Falls back to RPC if no local matches
- **Debounce**: 300ms delay prevents excessive searches
- **Multi-field**: Searches name, SKU, and barcode simultaneously

### Stock Calculation
- Filters stock quants by configured POS location
- Calculates total quantity from all quants in that location
- Handles both storable and non-storable products
- Real-time stock from Odoo database

### Performance
- Products cached after initial load
- Instant filtering for subsequent searches
- Efficient DOM manipulation
- Responsive design adapts to screen size

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Type in search | Start filtering products |
| Enter | Immediate search (no debounce) |
| Escape | Close screen and return to POS |
| Tab | Navigate between elements |

## Color Theme

- **Purple Gradient** (#667eea to #764ba2) - Headers and buttons
- **Green** (#d4edda) - In stock badges
- **Yellow** (#fff3cd) - Low stock badges
- **Red** (#f8d7da) - Out of stock badges
- **Blue** (#667eea) - Price values

## Compatibility

- Odoo 13.0
- Works with `weha_pos_self_sync` module
- Compatible with `weha_smart_pos_online` custom layouts
- Responsive design for desktop, tablet, and mobile
- Modern browsers (Chrome, Firefox, Safari, Edge)

## Notes

- Stock shown is for the POS location configured in settings
- Prices are from the pricelist configured in POS settings
- Only products available to POS are displayed
- Non-storable products can be added regardless of stock level
- Changes to stock/prices in backend are reflected immediately

## Support

For issues or questions:
1. Check browser console for errors (F12)
2. Verify module is up to date
3. Check Odoo logs for server errors
4. Contact your system administrator
