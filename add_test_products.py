#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script to add 30,000 test products to Odoo via XML-RPC
"""

import xmlrpc.client
import time
import random

# Odoo connection parameters - UPDATE THESE!
URL = 'http://localhost:8069'
DB = 'odoo13_pos'  # Change this to your actual database name
USERNAME = 'admin'
PASSWORD = 'pelang1'  # Change this to your actual password

# Number of products to create
TOTAL_PRODUCTS = 30000
BATCH_SIZE = 100  # Create in batches for better performance

def main():
    global DB
    
    print("=" * 60)
    print(f"Creating {TOTAL_PRODUCTS} test products in Odoo")
    print("=" * 60)
    
    # Connect to Odoo
    print("\n1. Connecting to Odoo...")
    common = xmlrpc.client.ServerProxy(f'{URL}/xmlrpc/2/common')
    
    # Authenticate
    print(f"\n2. Authenticating...")
    print(f"   URL: {URL}")
    print(f"   DB: {DB}")
    print(f"   User: {USERNAME}")
    
    try:
        uid = common.authenticate(DB, USERNAME, PASSWORD, {})
    except Exception as e:
        print(f"\n   ❌ Authentication failed with DB '{DB}'")
        print(f"   Error: {str(e)[:200]}")
        print(f"\n   Hint: Make sure you've created a database in Odoo")
        print(f"   Access Odoo at {URL}/web/database/manager to create one")
        return
    
    if not uid:
        print("❌ Authentication failed!")
        return
    
    print(f"✓ Authenticated successfully (UID: {uid})")
    
    # Get models proxy
    models = xmlrpc.client.ServerProxy(f'{URL}/xmlrpc/2/object')
    
    # Get or create product category
    print("\n3. Setting up product category...")
    categ_id = models.execute_kw(
        DB, uid, PASSWORD,
        'product.category', 'search',
        [[['name', '=', 'Test Products']]], {'limit': 1}
    )
    
    if not categ_id:
        categ_id = models.execute_kw(
            DB, uid, PASSWORD,
            'product.category', 'create',
            [{'name': 'Test Products'}]
        )
        print(f"✓ Created category 'Test Products' (ID: {categ_id})")
    else:
        categ_id = categ_id[0]
        print(f"✓ Using existing category (ID: {categ_id})")
    
    # Get POS category
    print("\n4. Setting up POS category...")
    pos_categ_id = models.execute_kw(
        DB, uid, PASSWORD,
        'pos.category', 'search',
        [[['name', '=', 'Test Products']]], {'limit': 1}
    )
    
    if not pos_categ_id:
        pos_categ_id = models.execute_kw(
            DB, uid, PASSWORD,
            'pos.category', 'create',
            [{'name': 'Test Products'}]
        )
        print(f"✓ Created POS category 'Test Products' (ID: {pos_categ_id})")
    else:
        pos_categ_id = pos_categ_id[0]
        print(f"✓ Using existing POS category (ID: {pos_categ_id})")
    
    # Create products
    print(f"\n5. Creating {TOTAL_PRODUCTS} products in batches of {BATCH_SIZE}...")
    print("-" * 60)
    
    start_time = time.time()
    created_count = 0
    
    for batch_num in range(0, TOTAL_PRODUCTS, BATCH_SIZE):
        batch_start = time.time()
        
        # Prepare batch of products
        products_batch = []
        for i in range(batch_num, min(batch_num + BATCH_SIZE, TOTAL_PRODUCTS)):
            product_num = i + 1
            products_batch.append({
                'name': f'Test Product {product_num:05d}',
                'default_code': f'TEST{product_num:05d}',
                'barcode': f'{random.randint(1000000000000, 9999999999999)}',
                'type': 'product',
                'categ_id': categ_id,
                'pos_categ_id': pos_categ_id,
                'list_price': 10.0 + (product_num % 100),
                'standard_price': 5.0 + (product_num % 50),
                'available_in_pos': True,
                'to_weight': False,
            })
        
        # Create batch
        try:
            created_ids = models.execute_kw(
                DB, uid, PASSWORD,
                'product.product', 'create',
                [products_batch]
            )
            
            created_count += len(created_ids) if isinstance(created_ids, list) else 1
            
            batch_time = time.time() - batch_start
            progress = (created_count / TOTAL_PRODUCTS) * 100
            
            print(f"Batch {batch_num//BATCH_SIZE + 1:4d}: "
                  f"Created {len(products_batch):3d} products | "
                  f"Total: {created_count:5d}/{TOTAL_PRODUCTS} ({progress:5.1f}%) | "
                  f"Time: {batch_time:.2f}s")
        
        except Exception as e:
            print(f"❌ Error in batch {batch_num//BATCH_SIZE + 1}: {e}")
            continue
    
    total_time = time.time() - start_time
    
    # Summary
    print("-" * 60)
    print("\n6. Summary:")
    print(f"   Total products created: {created_count:,}")
    print(f"   Total time: {total_time:.2f}s")
    print(f"   Average: {total_time/created_count:.4f}s per product")
    print(f"   Speed: {created_count/total_time:.1f} products/second")
    print("\n✓ Done!")
    print("=" * 60)

if __name__ == '__main__':
    main()
