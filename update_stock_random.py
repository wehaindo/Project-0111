#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Update Stock Quantities for SHWH Location
Updates all products with random stock between 1 and 20
"""

import xmlrpc.client
import random

# Odoo Connection Details
URL = 'http://localhost:8069'
DB = 'odoo13_pos'  # Changed from 'sarinah'
USERNAME = 'admin'
PASSWORD = 'pelang1'

def main():
    print("=" * 60)
    print("Odoo Stock Update Script - SHWH Location")
    print("=" * 60)
    
    # Connect to Odoo
    print("\n1. Connecting to Odoo...")
    common = xmlrpc.client.ServerProxy(f'{URL}/xmlrpc/2/common')
    uid = common.authenticate(DB, USERNAME, PASSWORD, {})
    
    if not uid:
        print("❌ Authentication failed!")
        return
    
    print(f"✅ Connected as user ID: {uid}")
    
    models = xmlrpc.client.ServerProxy(f'{URL}/xmlrpc/2/object')
    
    # Find SHWH location
    print("\n2. Finding SHWH stock location...")
    location_ids = models.execute_kw(
        DB, uid, PASSWORD,
        'stock.location', 'search',
        [[['id', '=', 18]]]
    )
    
    if not location_ids:
        print("❌ SHWH location not found!")
        return
    
    location_id = location_ids[0]
    print(f"✅ Found SHWH location (ID: {location_id})")
    
    # Get all products
    print("\n3. Fetching all products...")
    product_ids = models.execute_kw(
        DB, uid, PASSWORD,
        'product.product', 'search',
        [[['type', '=', 'product']]]  # Only storable products
    )
    
    print(f"✅ Found {len(product_ids)} products")
    
    # Update stock for each product
    print("\n4. Updating stock quantities...")
    updated_count = 0
    failed_count = 0
    
    for i, product_id in enumerate(product_ids, 1):
        try:
            # Generate random quantity between 1 and 20
            new_qty = random.randint(1, 20)
            
            # Get product name for logging
            product = models.execute_kw(
                DB, uid, PASSWORD,
                'product.product', 'read',
                [product_id], {'fields': ['name', 'default_code']}
            )[0]
            
            product_name = product['default_code'] or product['name']
            
            # Get current stock quant
            quant_ids = models.execute_kw(
                DB, uid, PASSWORD,
                'stock.quant', 'search',
                [[
                    ['product_id', '=', product_id],
                    ['location_id', '=', location_id]
                ]]
            )
            
            if quant_ids:
                # Update using inventory_quantity field
                models.execute_kw(
                    DB, uid, PASSWORD,
                    'stock.quant', 'write',
                    [quant_ids, {
                        'inventory_quantity': new_qty,
                    }]
                )
                # Apply the inventory adjustment
                models.execute_kw(
                    DB, uid, PASSWORD,
                    'stock.quant', 'action_apply_inventory',
                    [quant_ids]
                )
            else:
                # Create new quant with inventory quantity
                quant_id = models.execute_kw(
                    DB, uid, PASSWORD,
                    'stock.quant', 'create',
                    [{
                        'product_id': product_id,
                        'location_id': location_id,
                        'inventory_quantity': new_qty,
                    }]
                )
                # Apply the inventory adjustment
                models.execute_kw(
                    DB, uid, PASSWORD,
                    'stock.quant', 'action_apply_inventory',
                    [[quant_id]]
                )
            
            updated_count += 1
            
            # Progress indicator
            if i % 100 == 0:
                print(f"   Progress: {i}/{len(product_ids)} products updated...")
            
            # Show sample updates
            if i <= 10 or i % 500 == 0:
                print(f"   ✓ {product_name[:40]:40} → {new_qty:3} units")
                
        except Exception as e:
            failed_count += 1
            if failed_count <= 5:  # Show first 5 errors
                print(f"   ✗ Product ID {product_id}: {str(e)}")


    
    # Summary
    print("\n" + "=" * 60)
    print("Update Complete!")
    print("=" * 60)
    print(f"✅ Successfully updated: {updated_count} products")
    if failed_count > 0:
        print(f"❌ Failed to update: {failed_count} products")
    print(f"📦 Location: SHWH (ID: {location_id})")
    print(f"📊 Stock range: 1-20 units (random)")
    print("=" * 60)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️ Script interrupted by user")
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
