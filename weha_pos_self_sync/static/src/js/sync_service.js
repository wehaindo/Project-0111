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
            
            // Sanitize error for IndexedDB storage
            const error_info = {
                message: error.message || String(error),
                code: error.code,
                name: error.name
            };
            
            await this.db.add_sync_log('error', 'Sync failed', error_info);
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
                    
                    // Keep synced orders in IndexedDB for audit/history
                    // await this.db.delete_synced_order(order.uuid);
                    console.log(`✓ Order ${order.uuid} synced and kept in IndexedDB`);
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
     * Non-blocking: fetches metadata first, then processes in background
     */
    sync_delta_updates: async function() {
        try {
            console.log('=== Starting Delta Sync ===');

            // Check if delta sync is enabled
            if (!this.pos.config.enable_delta_sync) {
                console.log('Delta sync is disabled');
                return true;
            }

            // Get last sync timestamp
            const last_sync = await this.db.get_sync_metadata('last_delta_sync');
            console.log('Last delta sync timestamp:', last_sync);

            // Get count first (fast, non-blocking)
            const count_result = await rpc.query({
                route: '/pos/get_updates_count',
                params: {
                    session_id: this.pos.pos_session.id,
                    last_write_date: last_sync
                }
            });

            console.log('Delta sync count:', count_result);

            if (count_result.error) {
                console.error('Delta sync count error:', count_result.error);
                return false;
            }

            const total_products = count_result.product_count || 0;
            const total_partners = count_result.partner_count || 0;

            if (total_products === 0 && total_partners === 0) {
                console.log('No updates available');
                await this.db.set_sync_metadata('last_delta_sync', count_result.sync_timestamp);
                return true;
            }

            console.log(`Found ${total_products} products and ${total_partners} partners to sync`);

            // Process partners immediately (usually small amount)
            if (total_partners > 0) {
                const partners = await rpc.query({
                    route: '/pos/get_updates_partners',
                    params: {
                        session_id: this.pos.pos_session.id,
                        last_write_date: last_sync
                    }
                });

                if (partners && partners.length > 0) {
                    console.log(`Processing ${partners.length} partners...`);
                    await this.db.save_partners_to_indexeddb(partners);
                    this.pos.db.add_partners(partners);
                    console.log(`✓ Updated ${partners.length} partners`);
                }
            }

            // Process products in background batches (non-blocking)
            if (total_products > 0) {
                console.log(`Starting background fetch of ${total_products} products...`);
                this._fetch_and_process_delta_products_background(last_sync, total_products);
            }

            // Save sync timestamp
            await this.db.set_sync_metadata('last_delta_sync', count_result.sync_timestamp);
            console.log('Saved new sync timestamp:', count_result.sync_timestamp);

            // Log sync
            await this.db.add_sync_log('delta_sync', 'Delta sync started', {
                products: total_products,
                partners: total_partners
            });

            console.log('=== Delta Sync Initiated (running in background) ===');
            return true;

        } catch (error) {
            console.error('Delta sync error:', error);
            
            // Sanitize error for IndexedDB storage
            const error_info = {
                message: error.message || String(error),
                code: error.code,
                name: error.name
            };
            
            await this.db.add_sync_log('error', 'Delta sync failed', error_info);
            return false;
        }
    },

    /**
     * Fetch and process delta products in background batches
     * Fetches from server in batches to avoid blocking
     */
    _fetch_and_process_delta_products_background: function(last_sync, total_count) {
        const self = this;
        
        console.log(`🔄 Starting background delta fetch for ${total_count} products...`);
        
        // Run in background
        setTimeout(function() {
            self._fetch_delta_products_in_batches(last_sync, total_count).then(function(processed) {
                console.log(`✓ Background delta sync complete: ${processed} products`);
                self._refresh_product_screen();
                
                self.trigger('delta-sync-completed', {
                    products: processed,
                    partners: 0
                });
            }).catch(function(error) {
                console.error('Background delta fetch error:', error);
            });
        }, 1000);
    },

    /**
     * Fetch products from server in batches
     */
    _fetch_delta_products_in_batches: async function(last_sync, total_count) {
        const batch_size = 500;
        let processed = 0;
        
        try {
            // Fetch in batches
            for (let offset = 0; offset < total_count; offset += batch_size) {
                const products = await rpc.query({
                    route: '/pos/get_updates_products',
                    params: {
                        session_id: this.pos.pos_session.id,
                        last_write_date: last_sync,
                        limit: batch_size,
                        offset: offset
                    }
                });

                if (products && products.length > 0) {
                    // Convert to Product model instances first
                    const product_models = this._convert_to_product_models(products);
                    
                    // Save raw data to IndexedDB
                    await this.db.save_products_to_indexeddb(products);
                    
                    // Add Product instances to POS memory
                    this.pos.db.add_products(product_models);
                    
                    processed += products.length;
                    console.log(`📦 Delta fetched: ${processed}/${total_count} (${Math.round(processed/total_count*100)}%)`);
                }
                
                // Small delay between batches
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // If less than batch size, we're done
                if (products.length < batch_size) {
                    break;
                }
            }
            
            return processed;
            
        } catch (error) {
            console.error('Error fetching delta products:', error);
            throw error;
        }
    },

    /**
     * Process delta products in background (non-blocking)
     * @deprecated - use _fetch_and_process_delta_products_background instead
     */
    _process_delta_products_background: function(products) {
        const self = this;
        
        console.log(`🔄 Starting background processing of ${products.length} delta products...`);
        
        // Run in background after short delay
        setTimeout(function() {
            self._batch_process_delta_products(products).then(function(total) {
                console.log(`✓ Background delta processing complete: ${total} products updated`);
                self._refresh_product_screen();
            }).catch(function(error) {
                console.error('Background delta processing error:', error);
            });
        }, 500);
    },

    /**
     * Process products in batches to avoid blocking UI
     */
    _batch_process_delta_products: async function(products) {
        const self = this;
        const batch_size = 500;
        let processed = 0;
        
        try {
            // Process in batches
            for (let i = 0; i < products.length; i += batch_size) {
                const batch = products.slice(i, i + batch_size);
                
                // Save to IndexedDB
                await this.db.save_products_to_indexeddb(batch);
                
                // Add to POS memory
                batch.forEach(product => {
                    this.pos.db.add_products([product]);
                });
                
                processed += batch.length;
                console.log(`📦 Delta processed: ${processed}/${products.length} (${Math.round(processed/products.length*100)}%)`);
                
                // Small delay between batches to prevent UI blocking
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            return processed;
            
        } catch (error) {
            console.error('Error processing delta products:', error);
            throw error;
        }
    },

    /**
     * Convert raw product data to Product model instances
     */
    _convert_to_product_models: function(products) {
        const self = this;
        const models = require('point_of_sale.models');
        const using_company_currency = this.pos.config.currency_id[0] === this.pos.company.currency_id[0];
        const conversion_rate = this.pos.currency.rate / this.pos.company_currency.rate;
        
        return products.map(function(product_data) {
            // Apply currency conversion if needed
            if (!using_company_currency && product_data.lst_price) {
                product_data.lst_price = Math.round(product_data.lst_price * conversion_rate * Math.pow(10, 2)) / Math.pow(10, 2);
            }
            
            // Find category
            let categ = null;
            if (product_data.pos_categ_id && product_data.pos_categ_id[0]) {
                categ = _.findWhere(self.pos.pos_categ, {'id': product_data.pos_categ_id[0]});
            }
            if (!categ && product_data.categ_id && product_data.categ_id[0]) {
                categ = _.findWhere(self.pos.product_categories, {'id': product_data.categ_id[0]});
            }
            product_data.categ = categ || { id: 0, name: 'Uncategorized' };
            product_data.pos = self.pos;
            
            // Create proper Product model instance
            return new models.Product({}, product_data);
        });
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
     * Clear old synced orders (cleanup) - DISABLED
     * Orders are kept permanently in IndexedDB for audit/history
     */
    cleanup_old_orders: async function(days = 7) {
        console.log('Order cleanup disabled - all orders kept in IndexedDB for audit purposes');
        return;
        
        // Original cleanup code disabled below:
        /*
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
        */
    },
});

return SyncService;

});
