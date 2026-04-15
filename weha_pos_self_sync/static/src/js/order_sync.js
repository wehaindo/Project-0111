odoo.define('weha_pos_self_sync.order_sync', function (require) {
"use strict";

const models = require('point_of_sale.models');

/**
 * Order Sync Manager
 * Handles order queue, auto-save, and sync coordination
 */

const _super_order = models.Order.prototype;

models.Order = models.Order.extend({
    initialize: function(attributes, options) {
        _super_order.initialize.apply(this, arguments);
        this.save_to_db_debounced = _.debounce(this.save_to_db.bind(this), 1000);
    },

    /**
     * Auto-save order to IndexedDB on any change
     */
    save_to_db: async function() {
        if (!this.pos.config.enable_auto_save) {
            return;
        }

        try {
            const order_data = this.export_as_JSON();
            
            // Save to localStorage as backup
            localStorage.setItem(
                `pos_order_${this.uid}`,
                JSON.stringify(order_data)
            );

            console.log('Order auto-saved:', this.uid);

        } catch (error) {
            console.error('Error auto-saving order:', error);
        }
    },

    /**
     * Trigger auto-save on changes
     */
    set_client: function(client) {
        _super_order.set_client.apply(this, arguments);
        if (this.save_to_db_debounced) {
            this.save_to_db_debounced();
        }
    },

    add_product: function(product, options) {
        _super_order.add_product.apply(this, arguments);
        if (this.save_to_db_debounced) {
            this.save_to_db_debounced();
        }
    },

    remove_orderline: function(line) {
        _super_order.remove_orderline.apply(this, arguments);
        if (this.save_to_db_debounced) {
            this.save_to_db_debounced();
        }
    },

    /**
     * Add to sync queue instead of immediate sync
     */
    add_to_sync_queue: async function() {
        try {
            const order_data = this.export_as_JSON();
            
            // Ensure UUID
            if (!order_data.uuid) {
                order_data.uuid = this.uuid || this._generate_uuid();
            }

            // Add to IndexedDB queue
            const queued_order = await this.pos.db.add_order_to_queue(order_data);
            
            console.log('Order added to sync queue:', queued_order.uuid);

            // Clear localStorage backup
            localStorage.removeItem(`pos_order_${this.uid}`);

            // Trigger immediate sync if online
            if (navigator.onLine && this.pos.sync_service) {
                this.pos.sync_service.force_sync();
            }

            return queued_order;

        } catch (error) {
            console.error('Error adding order to queue:', error);
            throw error;
        }
    },

    /**
     * Restore order from localStorage
     */
    restore_from_backup: function(uid) {
        try {
            const backup = localStorage.getItem(`pos_order_${uid}`);
            if (backup) {
                const order_data = JSON.parse(backup);
                console.log('Restored order from backup:', uid);
                return order_data;
            }
        } catch (error) {
            console.error('Error restoring order:', error);
        }
        return null;
    },
});

// Extend POS model to restore unsaved orders
const _super_posmodel = models.PosModel.prototype;

models.PosModel = models.PosModel.extend({
    /**
     * Restore unfinished orders on POS reload
     */
    after_load_server_data: async function() {
        await _super_posmodel.after_load_server_data.call(this);
        
        if (this.config.enable_auto_save) {
            await this.restore_unfinished_orders();
        }
    },

    /**
     * Restore orders from localStorage backup
     */
    restore_unfinished_orders: async function() {
        try {
            const keys = Object.keys(localStorage);
            const order_keys = keys.filter(key => key.startsWith('pos_order_'));

            if (order_keys.length === 0) {
                return;
            }

            console.log(`Found ${order_keys.length} unfinished orders`);

            for (const key of order_keys) {
                try {
                    const order_data = JSON.parse(localStorage.getItem(key));
                    
                    // Create order from data
                    const order = new models.Order({}, { pos: this, json: order_data });
                    
                    // Add to orders
                    this.get('orders').add(order);
                    
                    console.log('Restored order:', order.uid);

                } catch (error) {
                    console.error('Error restoring order:', error);
                    // Clean up corrupt data
                    localStorage.removeItem(key);
                }
            }

            // Show notification
            if (order_keys.length > 0) {
                console.log(`Restored ${order_keys.length} unfinished order(s)`);
            }

        } catch (error) {
            console.error('Error restoring unfinished orders:', error);
        }
    },

    /**
     * Override push_order to use queue
     */
    push_order: async function(order, opts) {
        opts = opts || {};

        // If offline or queue enabled, add to queue
        if (!navigator.onLine || (this.config && this.config.enable_hybrid_sync)) {
            try {
                // Ensure order has the add_to_sync_queue method
                if (order && typeof order.add_to_sync_queue === 'function') {
                    await order.add_to_sync_queue();
                    
                    // Remove from orders
                    this.get('orders').remove(order);
                    
                    // Show success notification
                    console.log('Order queued for sync');
                    
                    return { success: true, queued: true };
                } else {
                    console.warn('Order missing add_to_sync_queue method, using standard push');
                    return _super_posmodel.push_order.call(this, order, opts);
                }

            } catch (error) {
                console.error('Error queuing order:', error);
                
                // Fallback to standard push if queue fails
                return _super_posmodel.push_order.call(this, order, opts);
            }
        } else {
            // Online and hybrid sync disabled - use standard push
            return _super_posmodel.push_order.call(this, order, opts);
        }
    },

    /**
     * Push single order (for manual retry)
     */
    push_single_order: async function(order_data) {
        try {
            const result = await this.env.services.rpc({
                model: 'pos.order',
                method: 'create_from_ui',
                args: [[{
                    id: order_data.id,
                    data: order_data
                }]],
            });

            return { success: true, result: result };

        } catch (error) {
            console.error('Error pushing order:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Get sync queue status
     */
    get_sync_queue_status: async function() {
        try {
            const pending = await this.db.get_pending_orders();
            
            const stats = {
                total: pending.length,
                pending: pending.filter(o => o.sync_status === 'pending_sync').length,
                syncing: pending.filter(o => o.sync_status === 'syncing').length,
                failed: pending.filter(o => o.sync_status === 'failed').length,
                synced: pending.filter(o => o.sync_status === 'synced').length,
            };

            return stats;

        } catch (error) {
            console.error('Error getting queue status:', error);
            return null;
        }
    },

    /**
     * Clear synced orders from queue
     */
    clear_synced_orders: async function() {
        try {
            const transaction = this.db.indexedDB.transaction(['orders_queue'], 'readwrite');
            const store = transaction.objectStore('orders_queue');
            const index = store.index('sync_status');
            const request = index.openCursor('synced');

            let deleted = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    deleted++;
                    cursor.continue();
                } else {
                    console.log(`Cleared ${deleted} synced orders from queue`);
                    console.log(`Cleared ${deleted} synced orders`);
                }
            };

        } catch (error) {
            console.error('Error clearing synced orders:', error);
        }
    },

    /**
     * Export queue for debugging
     */
    export_sync_queue: async function() {
        try {
            const transaction = this.db.indexedDB.transaction(['orders_queue'], 'readonly');
            const store = transaction.objectStore('orders_queue');
            const request = store.getAll();

            request.onsuccess = (event) => {
                const orders = event.target.result;
                const json = JSON.stringify(orders, null, 2);
                
                // Download as file
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `pos_sync_queue_${new Date().toISOString()}.json`;
                a.click();
                URL.revokeObjectURL(url);

                console.log('Queue exported:', orders.length, 'orders');
            };

        } catch (error) {
            console.error('Error exporting queue:', error);
        }
    },

    /**
     * Import queue (for recovery)
     */
    import_sync_queue: async function(json_data) {
        try {
            const orders = JSON.parse(json_data);
            
            const transaction = this.db.indexedDB.transaction(['orders_queue'], 'readwrite');
            const store = transaction.objectStore('orders_queue');

            let imported = 0;
            for (const order of orders) {
                store.put(order);
                imported++;
            }

            transaction.oncomplete = () => {
                console.log(`Imported ${imported} orders to queue`);
                console.log(`Imported ${imported} orders`);
            };

        } catch (error) {
            console.error('Error importing queue:', error);
            console.error('Error importing queue');
        }
    },
});

return models;

});
