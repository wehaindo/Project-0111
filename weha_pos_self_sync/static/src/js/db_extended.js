odoo.define('weha_pos_self_sync.db_extended', function (require) {
"use strict";

const PosDB = require('point_of_sale.DB');

/**
 * Extended PosDB with IndexedDB support for:
 * - Products cache
 * - Partners cache
 * - Orders queue
 * - Sync logs
 */

PosDB.include({
    name: 'pos_hybrid_sync_db',
    version: 4,  // Increment version for stock quantities

    init: function(options) {
        this._super(options);
        this.db_name = 'pos_hybrid_sync_db';
        this.db_version = 4;  // Increment version
        this.indexedDB = null;
        this.sync_logs = [];
        this.orders_queue = [];
        this.last_sync_timestamp = null;
    },

    /**
     * Initialize IndexedDB
     */
    init_indexed_db: function() {
        const self = this;
        
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                console.error('IndexedDB not supported');
                reject('IndexedDB not supported');
                return;
            }

            const request = window.indexedDB.open(this.db_name, this.db_version);

            request.onerror = function(event) {
                console.error('IndexedDB error:', event);
                reject(event);
            };

            request.onsuccess = function(event) {
                self.indexedDB = event.target.result;
                console.log('IndexedDB initialized successfully');
                resolve(self.indexedDB);
            };

            request.onupgradeneeded = function(event) {
                const db = event.target.result;

                // Create object stores
                if (!db.objectStoreNames.contains('products_cache')) {
                    const productsStore = db.createObjectStore('products_cache', { keyPath: 'id' });
                    // Speed optimization indices
                    productsStore.createIndex('barcode', 'barcode', { unique: false });
                    productsStore.createIndex('default_code', 'default_code', { unique: false });
                    productsStore.createIndex('display_name', 'display_name', { unique: false });
                    productsStore.createIndex('write_date', 'write_date', { unique: false });
                    productsStore.createIndex('pos_categ_id', 'pos_categ_id', { unique: false });
                }

                if (!db.objectStoreNames.contains('partners_cache')) {
                    const partnersStore = db.createObjectStore('partners_cache', { keyPath: 'id' });
                    partnersStore.createIndex('write_date', 'write_date', { unique: false });
                }

                if (!db.objectStoreNames.contains('orders_queue')) {
                    const ordersStore = db.createObjectStore('orders_queue', { keyPath: 'uuid' });
                    ordersStore.createIndex('sync_status', 'sync_status', { unique: false });
                    ordersStore.createIndex('created_at', 'created_at', { unique: false });
                }

                if (!db.objectStoreNames.contains('sync_logs')) {
                    const logsStore = db.createObjectStore('sync_logs', { keyPath: 'id', autoIncrement: true });
                    logsStore.createIndex('timestamp', 'timestamp', { unique: false });
                    logsStore.createIndex('type', 'type', { unique: false });
                }

                if (!db.objectStoreNames.contains('sync_metadata')) {
                    db.createObjectStore('sync_metadata', { keyPath: 'key' });
                }

                if (!db.objectStoreNames.contains('pricelist_items_cache')) {
                    const pricelistStore = db.createObjectStore('pricelist_items_cache', { keyPath: 'id' });
                    pricelistStore.createIndex('pricelist_id', 'pricelist_id', { unique: false });
                    pricelistStore.createIndex('product_id', 'product_id', { unique: false });
                    pricelistStore.createIndex('product_tmpl_id', 'product_tmpl_id', { unique: false });
                    pricelistStore.createIndex('write_date', 'write_date', { unique: false });
                }

                if (!db.objectStoreNames.contains('stock_quantities')) {
                    const stockStore = db.createObjectStore('stock_quantities', { keyPath: 'product_id' });
                    stockStore.createIndex('location_id', 'location_id', { unique: false });
                    stockStore.createIndex('last_update', 'last_update', { unique: false });
                }

                console.log('IndexedDB schema created/upgraded');
            };
        });
    },

    /**
     * Save products to IndexedDB
     */
    save_products_to_indexeddb: async function(products) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['products_cache'], 'readwrite');
            const store = transaction.objectStore('products_cache');

            let count = 0;
            products.forEach(product => {
                store.put(product);
                count++;
            });

            transaction.oncomplete = () => {
                console.log(`Saved ${count} products to IndexedDB`);
                resolve(count);
            };

            transaction.onerror = (event) => {
                console.error('Error saving products:', event);
                reject(event);
            };
        });
    },

    /**
     * Get products from IndexedDB
     */
    get_products_from_indexeddb: async function(category_id = null, limit = null) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['products_cache'], 'readonly');
            const store = transaction.objectStore('products_cache');
            
            let request;
            if (category_id) {
                const index = store.index('pos_categ_id');
                request = index.getAll(category_id);
            } else {
                request = store.getAll();
            }

            request.onsuccess = (event) => {
                let products = event.target.result;
                if (limit && products.length > limit) {
                    products = products.slice(0, limit);
                }
                resolve(products);
            };

            request.onerror = (event) => {
                console.error('Error getting products:', event);
                reject(event);
            };
        });
    },

    /**
     * Search products in IndexedDB by query string
     */
    search_products_in_indexeddb: async function(query, limit = 50) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['products_cache'], 'readonly');
            const store = transaction.objectStore('products_cache');
            const request = store.getAll();

            request.onsuccess = (event) => {
                const all_products = event.target.result;
                const search_query = query.toLowerCase();
                
                // Filter products by name, barcode, or default_code
                const matched_products = all_products.filter(product => {
                    return (product.name && product.name.toLowerCase().includes(search_query)) ||
                           (product.display_name && product.display_name.toLowerCase().includes(search_query)) ||
                           (product.barcode && product.barcode.toLowerCase().includes(search_query)) ||
                           (product.default_code && product.default_code.toLowerCase().includes(search_query));
                });
                
                // Limit results
                const limited_results = limit ? matched_products.slice(0, limit) : matched_products;
                resolve(limited_results);
            };

            request.onerror = (event) => {
                console.error('Error searching products in IndexedDB:', event);
                reject(event);
            };
        });
    },

    /**
     * Get product by barcode from IndexedDB
     */
    get_product_by_barcode_from_indexeddb: async function(barcode) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['products_cache'], 'readonly');
            const store = transaction.objectStore('products_cache');
            const request = store.getAll();

            request.onsuccess = (event) => {
                const all_products = event.target.result;
                const product = all_products.find(p => p.barcode === barcode);
                resolve(product || null);
            };

            request.onerror = (event) => {
                console.error('Error getting product by barcode from IndexedDB:', event);
                reject(event);
            };
        });
    },

    /**
     * Save partners to IndexedDB
     */
    save_partners_to_indexeddb: async function(partners) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['partners_cache'], 'readwrite');
            const store = transaction.objectStore('partners_cache');

            let count = 0;
            partners.forEach(partner => {
                store.put(partner);
                count++;
            });

            transaction.oncomplete = () => {
                console.log(`Saved ${count} partners to IndexedDB`);
                resolve(count);
            };

            transaction.onerror = (event) => {
                console.error('Error saving partners:', event);
                reject(event);
            };
        });
    },

    /**
     * Get partners from IndexedDB
     */
    get_partners_from_indexeddb: async function() {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['partners_cache'], 'readonly');
            const store = transaction.objectStore('partners_cache');
            const request = store.getAll();

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onerror = (event) => {
                console.error('Error getting partners:', event);
                reject(event);
            };
        });
    },

    /**
     * Save pricelist items to IndexedDB
     */
    save_pricelist_items_to_indexeddb: async function(items) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['pricelist_items_cache'], 'readwrite');
            const store = transaction.objectStore('pricelist_items_cache');

            let count = 0;
            items.forEach(item => {
                // Clean the item data - remove functions and ensure proper structure
                const clean_item = {
                    id: item.id,
                    pricelist_id: Array.isArray(item.pricelist_id) ? item.pricelist_id[0] : item.pricelist_id,
                    product_tmpl_id: item.product_tmpl_id ? (Array.isArray(item.product_tmpl_id) ? item.product_tmpl_id[0] : item.product_tmpl_id) : false,
                    product_id: item.product_id ? (Array.isArray(item.product_id) ? item.product_id[0] : item.product_id) : false,
                    categ_id: item.categ_id ? (Array.isArray(item.categ_id) ? item.categ_id[0] : item.categ_id) : false,
                    min_quantity: item.min_quantity || 0,
                    applied_on: item.applied_on,
                    base: item.base,
                    base_pricelist_id: item.base_pricelist_id ? (Array.isArray(item.base_pricelist_id) ? item.base_pricelist_id[0] : item.base_pricelist_id) : false,
                    compute_price: item.compute_price,
                    fixed_price: item.fixed_price || 0,
                    percent_price: item.percent_price || 0,
                    price_discount: item.price_discount || 0,
                    price_surcharge: item.price_surcharge || 0,
                    price_round: item.price_round || 0,
                    price_min_margin: item.price_min_margin || 0,
                    price_max_margin: item.price_max_margin || 0,
                    company_id: item.company_id ? (Array.isArray(item.company_id) ? item.company_id[0] : item.company_id) : false,
                    currency_id: item.currency_id ? (Array.isArray(item.currency_id) ? item.currency_id[0] : item.currency_id) : false,
                    date_start: item.date_start || false,
                    date_end: item.date_end || false,
                    write_date: item.write_date
                };
                
                console.log('Saving pricelist item to IndexedDB:', clean_item);
                store.put(clean_item);
                count++;
            });

            transaction.oncomplete = () => {
                console.log(`Saved ${count} pricelist items to IndexedDB`);
                resolve(count);
            };

            transaction.onerror = (event) => {
                console.error('Error saving pricelist items:', event);
                reject(event);
            };
        });
    },

    /**
     * Get pricelist items from IndexedDB
     */
    get_pricelist_items_from_indexeddb: async function(pricelist_id = null) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['pricelist_items_cache'], 'readonly');
            const store = transaction.objectStore('pricelist_items_cache');
            
            let request;
            if (pricelist_id) {
                const index = store.index('pricelist_id');
                request = index.getAll(pricelist_id);
            } else {
                request = store.getAll();
            }

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onerror = (event) => {
                console.error('Error getting pricelist items:', event);
                reject(event);
            };
        });
    },

    /**
     * Get all pricelist items from IndexedDB (for deletion detection)
     */
    get_all_pricelist_items_from_indexeddb: async function() {
        return this.get_pricelist_items_from_indexeddb(null);
    },

    /**
     * Delete specific pricelist items from IndexedDB
     */
    delete_pricelist_items_from_indexeddb: async function(item_ids) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['pricelist_items_cache'], 'readwrite');
            const store = transaction.objectStore('pricelist_items_cache');
            
            let deleted = 0;
            item_ids.forEach(id => {
                const request = store.delete(id);
                request.onsuccess = () => deleted++;
            });

            transaction.oncomplete = () => {
                console.log(`Deleted ${deleted} pricelist items from IndexedDB`);
                resolve(deleted);
            };

            transaction.onerror = (event) => {
                console.error('Error deleting pricelist items:', event);
                reject(event);
            };
        });
    },

    /**
     * Delete specific products from IndexedDB
     */
    delete_products_from_indexeddb: async function(product_ids) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['products_cache'], 'readwrite');
            const store = transaction.objectStore('products_cache');
            
            let deleted = 0;
            product_ids.forEach(id => {
                const request = store.delete(id);
                request.onsuccess = () => deleted++;
            });

            transaction.oncomplete = () => {
                console.log(`Deleted ${deleted} products from IndexedDB`);
                resolve(deleted);
            };

            transaction.onerror = (event) => {
                console.error('Error deleting products:', event);
                reject(event);
            };
        });
    },

    /**
     * Delete specific partners from IndexedDB
     */
    delete_partners_from_indexeddb: async function(partner_ids) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['partners_cache'], 'readwrite');
            const store = transaction.objectStore('partners_cache');
            
            let deleted = 0;
            partner_ids.forEach(id => {
                const request = store.delete(id);
                request.onsuccess = () => deleted++;
            });

            transaction.oncomplete = () => {
                console.log(`Deleted ${deleted} partners from IndexedDB`);
                resolve(deleted);
            };

            transaction.onerror = (event) => {
                console.error('Error deleting partners:', event);
                reject(event);
            };
        });
    },

    /**
     * Add order to sync queue
     */
    add_order_to_queue: async function(order_data) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['orders_queue'], 'readwrite');
            const store = transaction.objectStore('orders_queue');

            const order_record = {
                uuid: order_data.uuid || this._generate_uuid(),
                data: order_data,
                sync_status: 'pending_sync',
                created_at: new Date().toISOString(),
                retry_count: 0,
                last_attempt: null,
                error_message: null
            };

            const request = store.put(order_record);

            request.onsuccess = () => {
                console.log('Order added to queue:', order_record.uuid);
                resolve(order_record);
            };

            request.onerror = (event) => {
                console.error('Error adding order to queue:', event);
                reject(event);
            };
        });
    },

    /**
     * Get single order from queue by UUID
     */
    get_order_from_queue: async function(uuid) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['orders_queue'], 'readonly');
            const store = transaction.objectStore('orders_queue');
            const request = store.get(uuid);

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onerror = (event) => {
                console.error('Error getting order from queue:', event);
                reject(event);
            };
        });
    },

    /**
     * Get pending orders from queue
     */
    get_pending_orders: async function() {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['orders_queue'], 'readonly');
            const store = transaction.objectStore('orders_queue');
            const request = store.getAll();

            request.onsuccess = (event) => {
                const all_orders = event.target.result;
                // Include both pending_sync and failed orders
                const pending_orders = all_orders.filter(order => 
                    order.sync_status === 'pending_sync' || order.sync_status === 'failed'
                );
                console.log(`Found ${pending_orders.length} orders to sync (pending + failed)`);
                resolve(pending_orders);
            };

            request.onerror = (event) => {
                console.error('Error getting pending orders:', event);
                reject(event);
            };
        });
    },

    /**
     * Update order sync status
     */
    update_order_status: async function(uuid, status, error_message = null) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['orders_queue'], 'readwrite');
            const store = transaction.objectStore('orders_queue');
            const request = store.get(uuid);

            request.onsuccess = (event) => {
                const order = event.target.result;
                if (order) {
                    order.sync_status = status;
                    order.last_attempt = new Date().toISOString();
                    if (error_message) {
                        order.error_message = error_message;
                        order.retry_count = (order.retry_count || 0) + 1;
                    }
                    if (status === 'synced') {
                        order.synced_at = new Date().toISOString();
                    }

                    const updateRequest = store.put(order);
                    updateRequest.onsuccess = () => {
                        console.log(`Order ${uuid} status updated to ${status}`);
                        resolve(order);
                    };
                    updateRequest.onerror = (event) => reject(event);
                } else {
                    reject('Order not found');
                }
            };

            request.onerror = (event) => {
                console.error('Error updating order status:', event);
                reject(event);
            };
        });
    },

    /**
     * Delete synced order from queue
     */
    delete_synced_order: async function(uuid) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['orders_queue'], 'readwrite');
            const store = transaction.objectStore('orders_queue');
            const request = store.delete(uuid);

            request.onsuccess = () => {
                console.log('Synced order deleted:', uuid);
                resolve();
            };

            request.onerror = (event) => {
                console.error('Error deleting order:', event);
                reject(event);
            };
        });
    },

    /**
     * Add sync log
     */
    add_sync_log: async function(type, message, data = null) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['sync_logs'], 'readwrite');
            const store = transaction.objectStore('sync_logs');

            // Sanitize data to prevent DataCloneError
            let sanitized_data = null;
            if (data !== null && data !== undefined) {
                try {
                    // Convert to plain object by JSON serialization
                    sanitized_data = JSON.parse(JSON.stringify(data));
                } catch (e) {
                    // If serialization fails, just store as string
                    sanitized_data = { error: String(data) };
                }
            }

            const log = {
                type: type,
                message: message,
                data: sanitized_data,
                timestamp: new Date().toISOString()
            };

            const request = store.add(log);

            request.onsuccess = () => {
                resolve(log);
            };

            request.onerror = (event) => {
                console.error('Error adding sync log:', event);
                reject(event);
            };
        });
    },

    /**
     * Get sync metadata
     */
    get_sync_metadata: async function(key) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['sync_metadata'], 'readonly');
            const store = transaction.objectStore('sync_metadata');
            const request = store.get(key);

            request.onsuccess = (event) => {
                resolve(event.target.result ? event.target.result.value : null);
            };

            request.onerror = (event) => {
                console.error('Error getting metadata:', event);
                reject(event);
            };
        });
    },

    /**
     * Set sync metadata
     */
    set_sync_metadata: async function(key, value) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['sync_metadata'], 'readwrite');
            const store = transaction.objectStore('sync_metadata');
            const request = store.put({ key: key, value: value });

            request.onsuccess = () => {
                resolve(value);
            };

            request.onerror = (event) => {
                console.error('Error setting metadata:', event);
                reject(event);
            };
        });
    },

    /**
     * Generate UUID
     */
    _generate_uuid: function() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    // ============================================
    // SPEED OPTIMIZATION METHODS
    // ============================================

    /**
     * Load products by category (LAZY LOADING)
     * Only loads products when category is accessed
     */
    load_products_by_category: async function(category_id, limit = 100) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['products_cache'], 'readonly');
            const store = transaction.objectStore('products_cache');
            const index = store.index('pos_categ_id');
            const request = index.getAll(category_id, limit);

            request.onsuccess = (event) => {
                const products = event.target.result;
                // Add to memory cache
                if (products && products.length > 0) {
                    this.add_products(products);
                }
                console.log(`✓ Loaded ${products.length} products for category ${category_id}`);
                resolve(products);
            };

            request.onerror = (event) => {
                console.error('Error loading products by category:', event);
                reject(event);
            };
        });
    },

    /**
     * Preload only essential products (most recent, top sellers)
     * Loads minimal set for fast POS startup
     */
    load_essential_products: async function(limit = 200) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['products_cache'], 'readonly');
            const store = transaction.objectStore('products_cache');
            
            // Get most recently updated products (likely most relevant)
            const index = store.index('write_date');
            const request = index.openCursor(null, 'prev'); // Reverse order (newest first)

            let products = [];
            let count = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && count < limit) {
                    products.push(cursor.value);
                    count++;
                    cursor.continue();
                } else {
                    // Add to memory cache
                    if (products.length > 0) {
                        this.add_products(products);
                    }
                    console.log(`✓ Preloaded ${products.length} essential products`);
                    resolve(products);
                }
            };

            request.onerror = (event) => {
                console.error('Error loading essential products:', event);
                reject(event);
            };
        });
    },

    /**
     * Background load remaining products (non-blocking)
     * Loads all products in batches without blocking UI
     */
    background_load_all_products: async function(batch_size = 500) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        const self = this;
        let total_loaded = 0;

        const loadBatch = async (skip_count) => {
            return new Promise((resolve, reject) => {
                const transaction = self.indexedDB.transaction(['products_cache'], 'readonly');
                const store = transaction.objectStore('products_cache');
                const request = store.openCursor();

                let products = [];
                let skipped = 0;

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        // Skip already loaded products
                        if (skipped < skip_count) {
                            skipped++;
                            cursor.continue();
                            return;
                        }

                        // Collect batch
                        if (products.length < batch_size) {
                            const product = cursor.value;
                            // Only add if not already in memory
                            if (!self.product_by_id[product.id]) {
                                products.push(product);
                            }
                            cursor.continue();
                        } else {
                            // Batch complete
                            if (products.length > 0) {
                                self.add_products(products);
                            }
                            resolve(products.length);
                        }
                    } else {
                        // No more products
                        if (products.length > 0) {
                            self.add_products(products);
                        }
                        resolve(products.length);
                    }
                };

                request.onerror = (event) => {
                    console.error('Error in background load:', event);
                    reject(event);
                };
            });
        };

        // Load in batches with delays (non-blocking)
        let offset = 0;
        let loaded = 0;
        do {
            loaded = await loadBatch(offset);
            total_loaded += loaded;
            if (loaded > 0) {
                console.log(`📦 Background loaded ${total_loaded} products...`);
            }
            offset += batch_size;
            
            // Delay between batches to prevent blocking UI
            if (loaded > 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } while (loaded > 0);

        console.log(`✓ Background loading complete: ${total_loaded} products`);
        return total_loaded;
    },

    /**
     * Smart search with IndexedDB cursor (faster than getAll)
     * Uses cursor to avoid loading all products into memory
     */
    smart_search_products: async function(query, limit = 50) {
        if (!query || typeof query !== 'string') {
            return [];
        }
        
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['products_cache'], 'readonly');
            const store = transaction.objectStore('products_cache');
            const request = store.openCursor();

            const search_query = query.toLowerCase();
            let matched_products = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                
                if (cursor && matched_products.length < limit) {
                    const product = cursor.value;
                    
                    // Match logic
                    if ((product.name && product.name.toLowerCase().includes(search_query)) ||
                        (product.display_name && product.display_name.toLowerCase().includes(search_query)) ||
                        (product.barcode && product.barcode.toLowerCase().includes(search_query)) ||
                        (product.default_code && product.default_code.toLowerCase().includes(search_query))) {
                        matched_products.push(product);
                    }
                    
                    cursor.continue();
                } else {
                    resolve(matched_products);
                }
            };

            request.onerror = (event) => {
                console.error('Error in smart search:', event);
                resolve([]); // Resolve with empty array instead of reject
            };
        });
    },

    /**
     * Fast get product by barcode (optimized with early exit)
     * Uses cursor with early exit when product is found
     */
    fast_get_product_by_barcode: async function(barcode) {
        if (!barcode || typeof barcode !== 'string') {
            return null;
        }
        
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['products_cache'], 'readonly');
            const store = transaction.objectStore('products_cache');
            const index = store.index('barcode');
            const request = index.get(barcode);

            request.onsuccess = (event) => {
                resolve(event.target.result || null);
            };

            request.onerror = (event) => {
                console.error('Error getting product by barcode:', event);
                resolve(null); // Resolve with null instead of reject
            };
        });
    },

    /**
     * Batch save products with transaction (faster than individual saves)
     * Uses transactions to save products in batches
     */
    batch_save_products: async function(products, batch_size = 1000) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        const total = products.length;
        let saved = 0;

        for (let i = 0; i < total; i += batch_size) {
            const batch = products.slice(i, i + batch_size);
            
            await new Promise((resolve, reject) => {
                const transaction = this.indexedDB.transaction(['products_cache'], 'readwrite');
                const store = transaction.objectStore('products_cache');

                batch.forEach(product => {
                    store.put(product);
                });

                transaction.oncomplete = () => {
                    saved += batch.length;
                    console.log(`💾 Saved ${saved}/${total} products (${Math.round(saved/total*100)}%)`);
                    resolve();
                };

                transaction.onerror = (event) => {
                    console.error('Batch save error:', event);
                    reject(event);
                };
            });

            // Small delay between batches
            if (i + batch_size < total) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }

        console.log(`✓ Batch save complete: ${saved} products`);
        return saved;
    },

    /**
     * Get count of products in IndexedDB (for progress tracking)
     */
    get_products_count: async function() {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['products_cache'], 'readonly');
            const store = transaction.objectStore('products_cache');
            const request = store.count();

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onerror = (event) => {
                console.error('Error getting products count:', event);
                reject(event);
            };
        });
    },

    /**
     * Clear all cached data (for testing/reset)
     */
    clear_all_cache: async function() {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        const stores = ['products_cache', 'partners_cache', 'orders_queue', 'sync_logs', 'sync_metadata'];
        const transaction = this.indexedDB.transaction(stores, 'readwrite');

        stores.forEach(storeName => {
            const store = transaction.objectStore(storeName);
            store.clear();
        });

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                console.log('All cache cleared');
                resolve();
            };

            transaction.onerror = (event) => {
                console.error('Error clearing cache:', event);
                reject(event);
            };
        });
    },

    /**
     * Save stock quantities to IndexedDB
     */
    save_stock_to_indexeddb: async function(stock_data) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['stock_quantities'], 'readwrite');
            const store = transaction.objectStore('stock_quantities');

            let count = 0;
            stock_data.forEach(stock => {
                const record = {
                    product_id: stock.product_id,
                    qty_available: stock.qty_available || 0,
                    virtual_available: stock.virtual_available || 0,
                    location_id: stock.location_id,
                    last_update: stock.write_date || new Date().toISOString()
                };
                store.put(record);
                count++;
            });

            transaction.oncomplete = () => {
                console.log(`💾 Saved ${count} stock quantities to IndexedDB`);
                resolve(count);
            };

            transaction.onerror = (event) => {
                console.error('Error saving stock to IndexedDB:', event);
                reject(event);
            };
        });
    },

    /**
     * Get stock quantity for a specific product
     */
    get_stock_from_indexeddb: async function(product_id) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['stock_quantities'], 'readonly');
            const store = transaction.objectStore('stock_quantities');
            const request = store.get(product_id);

            request.onsuccess = () => {
                resolve(request.result || null);
            };

            request.onerror = (event) => {
                console.error('Error getting stock from IndexedDB:', event);
                reject(event);
            };
        });
    },

    /**
     * Get all stock quantities from IndexedDB
     */
    get_all_stock_from_indexeddb: async function() {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['stock_quantities'], 'readonly');
            const store = transaction.objectStore('stock_quantities');
            const request = store.getAll();

            request.onsuccess = () => {
                console.log(`📦 Loaded ${request.result.length} stock quantities from IndexedDB`);
                resolve(request.result);
            };

            request.onerror = (event) => {
                console.error('Error loading all stock from IndexedDB:', event);
                reject(event);
            };
        });
    },

    /**
     * Update stock quantity locally (e.g., after sale)
     */
    update_stock_quantity: async function(product_id, qty_change, location_id) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise(async (resolve, reject) => {
            try {
                // Get current stock
                const current_stock = await this.get_stock_from_indexeddb(product_id);
                
                if (!current_stock) {
                    console.warn(`No stock record for product ${product_id}, creating new one`);
                    await this.save_stock_to_indexeddb([{
                        product_id: product_id,
                        qty_available: qty_change,
                        virtual_available: qty_change,
                        location_id: location_id
                    }]);
                    resolve(qty_change);
                    return;
                }

                // Update quantities
                const transaction = this.indexedDB.transaction(['stock_quantities'], 'readwrite');
                const store = transaction.objectStore('stock_quantities');
                
                current_stock.qty_available += qty_change;
                current_stock.virtual_available += qty_change;
                current_stock.last_update = new Date().toISOString();
                
                store.put(current_stock);

                transaction.oncomplete = () => {
                    console.log(`📦 Updated stock for product ${product_id}: ${qty_change > 0 ? '+' : ''}${qty_change} (new: ${current_stock.qty_available})`);
                    resolve(current_stock.qty_available);
                };

                transaction.onerror = (event) => {
                    console.error('Error updating stock:', event);
                    reject(event);
                };
            } catch (error) {
                console.error('Error in update_stock_quantity:', error);
                reject(error);
            }
        });
    },

    /**
     * Delete stock quantities from IndexedDB
     */
    delete_stock_from_indexeddb: async function(product_ids) {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['stock_quantities'], 'readwrite');
            const store = transaction.objectStore('stock_quantities');

            let count = 0;
            product_ids.forEach(product_id => {
                store.delete(product_id);
                count++;
            });

            transaction.oncomplete = () => {
                console.log(`🗑️ Deleted ${count} stock quantities from IndexedDB`);
                resolve(count);
            };

            transaction.onerror = (event) => {
                console.error('Error deleting stock from IndexedDB:', event);
                reject(event);
            };
        });
    },
});

return PosDB;

});
