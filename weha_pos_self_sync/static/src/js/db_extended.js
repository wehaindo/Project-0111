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
    version: 2,

    init: function(options) {
        this._super(options);
        this.db_name = 'pos_hybrid_sync_db';
        this.db_version = 2;
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
     * Get pending orders from queue
     */
    get_pending_orders: async function() {
        if (!this.indexedDB) {
            await this.init_indexed_db();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['orders_queue'], 'readonly');
            const store = transaction.objectStore('orders_queue');
            const index = store.index('sync_status');
            const request = index.getAll('pending_sync');

            request.onsuccess = (event) => {
                resolve(event.target.result);
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

            const log = {
                type: type,
                message: message,
                data: data,
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
});

return PosDB;

});
