odoo.define('weha_pos_self_sync.sync_service', function (require) {
"use strict";

const core = require('web.core');
const rpc = require('web.rpc');
const Class = core.Class;

/**
 * Background Sync Service
 * - Runs every 5-10 seconds
 * - Checks internet connection
 * - Syncs pending orders
 * - Retries failed orders with exponential backoff
 */

const SyncService = Class.extend({
    init: function(pos) {
        this.pos = pos;
        this.db = pos.db;
        this.is_syncing = false;
        this.sync_interval = null;
        this.sync_timeout = (pos.config.sync_interval || 10) * 1000; // Convert to ms
        this.max_retries = pos.config.max_sync_retries || 5;
        this.is_online = navigator.onLine;
        this.sync_stats = {
            total_synced: 0,
            total_failed: 0,
            last_sync: null,
            pending_count: 0
        };
        this._event_handlers = {};

        this._setup_network_listeners();
    },

    /**
     * Simple event system
     */
    on: function(event, handler) {
        if (!this._event_handlers[event]) {
            this._event_handlers[event] = [];
        }
        this._event_handlers[event].push(handler);
    },

    trigger: function(event, data) {
        if (this._event_handlers[event]) {
            this._event_handlers[event].forEach(handler => {
                if (typeof handler === 'function') {
                    handler(data);
                }
            });
        }
        // Also trigger on POS for global listening
        if (this.pos) {
            this.pos.trigger('sync:' + event, data);
        }
    },

    /**
     * Setup network status listeners
     */
    _setup_network_listeners: function() {
        const self = this;
        
        window.addEventListener('online', function() {
            console.log('Network: ONLINE');
            self.is_online = true;
            self.trigger('network-status-changed', { online: true });
            self.sync_pending_orders(); // Immediate sync when online
        });

        window.addEventListener('offline', function() {
            console.log('Network: OFFLINE');
            self.is_online = false;
            self.trigger('network-status-changed', { online: false });
        });
    },

    /**
     * Start background sync service
     */
    start: function() {
        console.log('Starting sync service with interval:', this.sync_timeout, 'ms');
        
        const self = this;
        
        // Initial sync
        this.sync_pending_orders();
        
        // Setup periodic sync for orders
        this.sync_interval = setInterval(function() {
            if (self.is_online && !self.is_syncing) {
                self.sync_pending_orders();
            }
        }, this.sync_timeout);

        // Setup periodic delta sync (less frequent - every 30 seconds)
        if (this.pos.config && this.pos.config.enable_delta_sync) {
            const delta_interval = 30000; // 30 seconds
            this.delta_sync_interval = setInterval(function() {
                if (self.is_online) {
                    self.sync_delta_updates();
                }
            }, delta_interval);
            console.log('Delta sync enabled with interval:', delta_interval, 'ms');
        }

        return this;
    },

    /**
     * Stop background sync service
     */
    stop: function() {
        if (this.sync_interval) {
            clearInterval(this.sync_interval);
            this.sync_interval = null;
        }
        if (this.delta_sync_interval) {
            clearInterval(this.delta_sync_interval);
            this.delta_sync_interval = null;
        }
        console.log('Sync service stopped');
    },

    /**
     * Check network connectivity
     */
    check_connection: async function() {
        if (!navigator.onLine) {
            return false;
        }

        try {
            // Simple ping to session info endpoint
            const response = await rpc.query({
                model: 'pos.session',
                method: 'search_read',
                args: [[['id', '=', this.pos.pos_session.id]], ['id']],
                kwargs: { limit: 1 }
            }, {
                timeout: 5000,
                shadow: true
            });
            return true;
        } catch (error) {
            console.log('Connection check failed:', error);
            return false;
        }
    },

    /**
     * Sync all pending orders
     */
    sync_pending_orders: async function() {
        if (this.is_syncing) {
            console.log('Sync already in progress, skipping...');
            return;
        }

        this.is_syncing = true;
        this.trigger('sync-started');

        try {
            // Check connection
            const is_connected = await this.check_connection();
            if (!is_connected) {
                console.log('No connection, skipping sync');
                this.is_syncing = false;
                return;
            }

            // Get pending orders
            const pending_orders = await this.db.get_pending_orders();
            
            if (pending_orders.length === 0) {
                console.log('No pending orders to sync');
                this.is_syncing = false;
                this.trigger('sync-completed', { synced: 0, failed: 0 });
                return;
            }

            console.log(`Syncing ${pending_orders.length} pending orders...`);

            // Filter orders that haven't exceeded retry limit
            const orders_to_sync = pending_orders.filter(order => {
                return (order.retry_count || 0) < this.max_retries;
            });

            if (orders_to_sync.length === 0) {
                console.log('All pending orders have exceeded retry limit');
                this.is_syncing = false;
                return;
            }

            // Sync orders in batches
            const batch_size = 10;
            let synced_count = 0;
            let failed_count = 0;

            for (let i = 0; i < orders_to_sync.length; i += batch_size) {
                const batch = orders_to_sync.slice(i, i + batch_size);
                const results = await this._sync_order_batch(batch);
                
                synced_count += results.synced;
                failed_count += results.failed;
            }

            // Update stats
            this.sync_stats.total_synced += synced_count;
            this.sync_stats.total_failed += failed_count;
            this.sync_stats.last_sync = new Date().toISOString();
            this.sync_stats.pending_count = await this._get_pending_count();

            console.log(`Sync completed: ${synced_count} synced, ${failed_count} failed`);

            // Log sync
            await this.db.add_sync_log('sync', 'Background sync completed', {
                synced: synced_count,
                failed: failed_count,
                total: orders_to_sync.length
            });

            this.trigger('sync-completed', { 
                synced: synced_count, 
                failed: failed_count,
                stats: this.sync_stats
            });

        } catch (error) {
            console.error('Sync error:', error);
            await this.db.add_sync_log('error', 'Sync failed', { error: error.message });
            this.trigger('sync-error', { error: error });
        } finally {
            this.is_syncing = false;
        }
    },

    /**
     * Sync a batch of orders
     */
    _sync_order_batch: async function(orders) {
        let synced = 0;
        let failed = 0;

        for (const order of orders) {
            try {
                // Update status to syncing
                await this.db.update_order_status(order.uuid, 'syncing');

                // Calculate retry delay (exponential backoff)
                const retry_count = order.retry_count || 0;
                if (retry_count > 0) {
                    const delay = this._calculate_backoff_delay(retry_count);
                    const last_attempt = new Date(order.last_attempt);
                    const next_retry = new Date(last_attempt.getTime() + delay);
                    
                    if (new Date() < next_retry) {
                        console.log(`Skipping order ${order.uuid}, retry scheduled for ${next_retry}`);
                        await this.db.update_order_status(order.uuid, 'pending_sync');
                        continue;
                    }
                }

                // Sync order via RPC
                const result = await this._sync_single_order(order);

                if (result.success) {
                    await this.db.update_order_status(order.uuid, 'synced');
                    synced++;
                    
                    // Optionally delete synced orders after some time
                    // await this.db.delete_synced_order(order.uuid);
                } else {
                    await this.db.update_order_status(order.uuid, 'failed', result.error);
                    failed++;
                }

            } catch (error) {
                console.error(`Error syncing order ${order.uuid}:`, error);
                await this.db.update_order_status(order.uuid, 'failed', error.message);
                failed++;
            }
        }

        return { synced, failed };
    },

    /**
     * Sync single order to backend
     */
    _sync_single_order: async function(order_record) {
        try {
            const order_data = order_record.data;
            
            // Ensure UUID is set
            if (!order_data.uuid) {
                order_data.uuid = order_record.uuid;
            }

            // Call Odoo RPC endpoint
            const result = await rpc.query({
                model: 'pos.order',
                method: 'create_from_ui',
                args: [[{
                    id: order_data.id || order_record.uuid,
                    data: order_data
                }]],
            });

            console.log(`Order ${order_record.uuid} synced successfully`);

            return {
                success: true,
                result: result
            };

        } catch (error) {
            console.error(`Failed to sync order ${order_record.uuid}:`, error);
            
            return {
                success: false,
                error: error.message || 'Unknown error'
            };
        }
    },

    /**
     * Calculate exponential backoff delay
     * Delays: 5s, 10s, 30s, 60s, 120s
     */
    _calculate_backoff_delay: function(retry_count) {
        const delays = [5000, 10000, 30000, 60000, 120000]; // milliseconds
        const index = Math.min(retry_count - 1, delays.length - 1);
        return delays[index];
    },

    /**
     * Get pending orders count
     */
    _get_pending_count: async function() {
        const pending = await this.db.get_pending_orders();
        return pending.length;
    },

    /**
     * Force sync now
     */
    force_sync: function() {
        console.log('Force sync triggered');
        if (!this.is_syncing) {
            this.sync_pending_orders();
        }
    },

    /**
     * Sync delta updates (products/partners)
     */
    sync_delta_updates: async function() {
        try {
            console.log('=== Starting Delta Sync ===');

            // Get last sync timestamp
            const last_sync = await this.db.get_sync_metadata('last_delta_sync');
            console.log('Last delta sync timestamp:', last_sync);

            // Call backend for updates
            const result = await rpc.query({
                route: '/pos/get_updates',
                params: {
                    session_id: this.pos.pos_session.id,
                    last_write_date: last_sync
                }
            });

            console.log('Delta sync result:', result);

            if (result.error) {
                console.error('Delta sync error:', result.error);
                return false;
            }

            // Update products
            if (result.products && result.products.length > 0) {
                console.log(`Received ${result.products.length} updated products`);
                await this.db.save_products_to_indexeddb(result.products);
                
                // Update POS products
                result.products.forEach(product => {
                    this.pos.db.add_products([product]);
                });
                
                console.log(`✓ Updated ${result.products.length} products in cache`);
                
                // Refresh the product grid UI if on product screen
                this._refresh_product_screen();
            } else {
                console.log('No product updates available');
            }

            // Update partners
            if (result.partners && result.partners.length > 0) {
                console.log(`Received ${result.partners.length} updated partners`);
                await this.db.save_partners_to_indexeddb(result.partners);
                
                // Update POS partners
                this.pos.db.add_partners(result.partners);
                
                console.log(`✓ Updated ${result.partners.length} partners in cache`);
            } else {
                console.log('No partner updates available');
            }

            // Save sync timestamp
            await this.db.set_sync_metadata('last_delta_sync', result.last_write_date);
            console.log('Saved new sync timestamp:', result.last_write_date);

            // Log sync
            await this.db.add_sync_log('delta_sync', 'Delta sync completed', {
                products: result.products ? result.products.length : 0,
                partners: result.partners ? result.partners.length : 0
            });

            this.trigger('delta-sync-completed', {
                products: result.products ? result.products.length : 0,
                partners: result.partners ? result.partners.length : 0
            });

            console.log('=== Delta Sync Completed ===');
            return true;

        } catch (error) {
            console.error('Delta sync error:', error);
            await this.db.add_sync_log('error', 'Delta sync failed', { error: error.message });
            return false;
        }
    },

    /**
     * Refresh product screen UI after adding new products
     */
    _refresh_product_screen: function() {
        try {
            // Get current screen
            const current_screen = this.pos.gui && this.pos.gui.current_screen;
            
            if (current_screen && current_screen.product_list_widget) {
                console.log('Refreshing product grid UI...');
                current_screen.product_list_widget.renderElement();
                console.log('✓ Product grid refreshed');
            } else {
                console.log('Not on product screen, UI will refresh on next visit');
            }
        } catch (error) {
            console.warn('Could not refresh product screen:', error);
        }
    },

    /**
     * Get sync statistics
     */
    get_sync_stats: function() {
        return this.sync_stats;
    },

    /**
     * Retry failed orders
     */
    retry_failed_orders: async function() {
        console.log('Retrying failed orders...');
        
        // Reset failed orders to pending
        const transaction = this.db.indexedDB.transaction(['orders_queue'], 'readwrite');
        const store = transaction.objectStore('orders_queue');
        const index = store.index('sync_status');
        const request = index.getAll('failed');

        request.onsuccess = async (event) => {
            const failed_orders = event.target.result;
            
            for (const order of failed_orders) {
                if (order.retry_count < this.max_retries) {
                    await this.db.update_order_status(order.uuid, 'pending_sync');
                }
            }

            console.log(`Reset ${failed_orders.length} failed orders for retry`);
            this.force_sync();
        };
    },

    /**
     * Clear old synced orders (cleanup)
     */
    cleanup_old_orders: async function(days = 7) {
        const cutoff_date = new Date();
        cutoff_date.setDate(cutoff_date.getDate() - days);

        const transaction = this.db.indexedDB.transaction(['orders_queue'], 'readwrite');
        const store = transaction.objectStore('orders_queue');
        const request = store.getAll();

        request.onsuccess = async (event) => {
            const orders = event.target.result;
            let deleted = 0;

            for (const order of orders) {
                if (order.sync_status === 'synced' && order.synced_at) {
                    const synced_date = new Date(order.synced_at);
                    if (synced_date < cutoff_date) {
                        await this.db.delete_synced_order(order.uuid);
                        deleted++;
                    }
                }
            }

            console.log(`Cleaned up ${deleted} old synced orders`);
        };
    },
});

return SyncService;

});
