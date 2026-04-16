odoo.define('weha_pos_self_sync.order_sync', function (require) {
"use strict";

const models = require('point_of_sale.models');

console.log('🔧 Order Sync Module Loaded - Version 2.0 - Orders will NOT be deleted after sync');

/**
 * Order Sync Manager
 * Save orders to IndexedDB and track sync status
 */

// Extend POS model for order sync tracking
const _super_posmodel = models.PosModel.prototype;

models.PosModel = models.PosModel.extend({
    /**
     * Override push_order to save to IndexedDB and track sync status
     */
    push_order: async function(order, opts) {
        console.log('🔵 push_order called with order:', order);
        opts = opts || {};
        
        // Check if order exists
        if (!order) {
            console.error('push_order called with undefined order');
            return _super_posmodel.push_order.call(this, order, opts);
        }
        
        // Export order data for IndexedDB
        let order_data;
        try {
            order_data = order.export_as_JSON();
            console.log('📄 Order exported as JSON:', order_data);
        } catch (error) {
            console.error('Error exporting order:', error);
            // Fallback to standard push if export fails
            return _super_posmodel.push_order.call(this, order, opts);
        }
        
        // Ensure UUID
        if (!order_data.uuid) {
            order_data.uuid = order.uuid || order.uid;
        }
        console.log('🆔 Order UUID:', order_data.uuid);

        // Save to IndexedDB (always, even when online)
        try {
            console.log('💾 Attempting to save to IndexedDB...');
            await this.db.add_order_to_queue(order_data);
            console.log('✅ Order saved to IndexedDB:', order_data.uuid);
        } catch (db_error) {
            console.error('❌ Error saving to IndexedDB:', db_error);
            // Continue even if IndexedDB fails
        }

        // Call Odoo's standard push_order method
        console.log('📤 Calling Odoo standard push_order...');
        try {
            const result = await _super_posmodel.push_order.call(this, order, opts);
            console.log('📥 Server response:', result);
            
            // If successfully sent to server, mark as synced in IndexedDB
            if (result && !result.error) {
                try {
                    await this.db.update_order_status(order_data.uuid, 'synced');
                    console.log('✓ Order synced to server, marked in IndexedDB');
                    
                    // Keep synced orders in IndexedDB for history/audit
                    // They can be cleaned up later manually or after X days
                    // await this.db.delete_synced_order(order_data.uuid);
                } catch (db_error) {
                    console.error('Error updating IndexedDB status:', db_error);
                }
            } else {
                // Server sync failed, mark as failed in IndexedDB
                try {
                    await this.db.update_order_status(order_data.uuid, 'failed', result?.error || 'Server error');
                    console.log('❌ Order failed to sync, marked in IndexedDB');
                } catch (db_error) {
                    console.error('Error updating IndexedDB status:', db_error);
                }
            }
            
            return result;

        } catch (error) {
            console.error('Error pushing order to server:', error);
            
            // Server sync failed (likely offline), mark as pending/failed in IndexedDB
            try {
                await this.db.update_order_status(order_data.uuid, 'failed', error.message || 'Connection error');
                console.log('⚠ Order saved to IndexedDB, will sync when online');
            } catch (db_error) {
                console.error('Error updating IndexedDB status:', db_error);
            }
            
            // Re-throw error so Odoo can handle it (show offline message, etc.)
            throw error;
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
