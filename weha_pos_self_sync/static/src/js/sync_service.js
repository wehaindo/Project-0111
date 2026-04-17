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

        // Setup periodic stock sync
        if (this.pos.config && this.pos.config.enable_stock_sync) {
            const stock_interval = (this.pos.config.stock_sync_interval || 5) * 60 * 1000; // Convert minutes to ms
            this.stock_sync_interval = setInterval(function() {
                if (self.is_online) {
                    self.sync_delta_stock();
                }
            }, stock_interval);
            console.log('Stock sync enabled with interval:', stock_interval, 'ms', `(${this.pos.config.stock_sync_interval} minutes)`);
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
        if (this.stock_sync_interval) {
            clearInterval(this.stock_sync_interval);
            this.stock_sync_interval = null;
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
        // Prevent parallel delta syncs
        if (this.delta_sync_in_progress) {
            console.log('⏸️ Delta sync already in progress, skipping...');
            return false;
        }
        
        this.delta_sync_in_progress = true;
        
        try {
            console.log('=== Starting Delta Sync ===');

            // Check if delta sync is enabled
            if (!this.pos.config.enable_delta_sync) {
                console.log('Delta sync is disabled');
                this.delta_sync_in_progress = false;
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
            const total_pricelist_items = count_result.pricelist_item_count || 0;

            if (total_products === 0 && total_partners === 0 && total_pricelist_items === 0) {
                console.log('No updates available');
                await this.db.set_sync_metadata('last_delta_sync', count_result.sync_timestamp);
                return true;
            }

            console.log(`Found ${total_products} products, ${total_partners} partners, and ${total_pricelist_items} pricelist items to sync`);

            // Trigger delta sync started event
            this.trigger('delta-sync-started', {
                products: total_products,
                partners: total_partners,
                pricelist_items: total_pricelist_items
            });

            // Process partners in background (non-blocking)
            if (total_partners > 0) {
                console.log(`Starting background fetch of ${total_partners} partners...`);
                this._fetch_partners_background(last_sync);
            }

            // Process pricelist items in background (non-blocking)
            if (total_pricelist_items > 0) {
                console.log(`Starting background fetch of ${total_pricelist_items} pricelist items...`);
                this._fetch_pricelist_items_background(last_sync, total_pricelist_items);
            } else if (!last_sync) {
                // First sync - load pricelist items in background
                console.log('First sync detected - loading pricelist items in background...');
                this._fetch_initial_pricelist_items_background();
            }

            // Process products in background batches (non-blocking)
            if (total_products > 0) {
                console.log(`Starting background fetch of ${total_products} products...`);
                // Pass the new sync timestamp to save AFTER fetching completes
                this._fetch_and_process_delta_products_background(last_sync, total_products, count_result.sync_timestamp);
            } else {
                // No products to fetch, save timestamp now
                await this.db.set_sync_metadata('last_delta_sync', count_result.sync_timestamp);
                console.log('Saved new sync timestamp:', count_result.sync_timestamp);
            }

            // Log sync
            await this.db.add_sync_log('delta_sync', 'Delta sync started', {
                products: total_products,
                partners: total_partners,
                pricelist_items: total_pricelist_items
            });

            console.log('=== Delta Sync Initiated (running in background) ===');
            this.delta_sync_in_progress = false;
            return true;

        } catch (error) {
            console.error('Delta sync error:', error);
            this.delta_sync_in_progress = false;
            
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
    _fetch_and_process_delta_products_background: function(last_sync, total_count, new_sync_timestamp) {
        const self = this;
        
        console.log(`🔄 Starting background delta fetch for ${total_count} products...`);
        
        // Run in background
        setTimeout(function() {
            self._fetch_delta_products_in_batches(last_sync, total_count).then(function(processed) {
                console.log(`✓ Background delta sync complete: ${processed} products`);
                
                // Save the new sync timestamp AFTER successful fetch
                self.db.set_sync_metadata('last_delta_sync', new_sync_timestamp).then(function() {
                    console.log('✓ Saved new sync timestamp:', new_sync_timestamp);
                });
                
                self._refresh_product_screen();
                
                self.trigger('delta-sync-completed', {
                    products: processed,
                    partners: 0
                });
            }).catch(function(error) {
                console.error('Background delta fetch error:', error);
                console.error('❌ Not saving sync timestamp due to error');
            });
        }, 1000);
    },

    /**
     * Fetch products from server in batches
     */
    _fetch_delta_products_in_batches: async function(last_sync, total_count) {
        // Prevent parallel product fetching
        if (this.product_fetch_in_progress) {
            console.log('⏸️ Product fetch already in progress, skipping...');
            return 0;
        }
        
        this.product_fetch_in_progress = true;
        
        const batch_size = 500;
        let processed = 0;
        
        console.log(`📥 Fetching delta products updated after: ${last_sync}`);
        
        try {
            // Fetch in batches
            for (let offset = 0; offset < total_count; offset += batch_size) {
                console.log(`Requesting batch: offset=${offset}, limit=${batch_size}`);
                
                const products = await rpc.query({
                    route: '/pos/get_updates_products',
                    params: {
                        session_id: this.pos.pos_session.id,
                        last_write_date: last_sync,
                        limit: batch_size,
                        offset: offset
                    }
                });

                console.log(`Server returned ${products ? products.length : 0} products`);
                
                if (products && products.length > 0) {
                    // Log first product details for debugging
                    console.log('First product received:', {
                        id: products[0].id,
                        name: products[0].name,
                        lst_price: products[0].lst_price,
                        write_date: products[0].write_date
                    });
                    
                    // Create clean copy for IndexedDB (remove any functions)
                    const clean_products = products.map(p => {
                        return {
                            id: p.id,
                            name: p.name,
                            display_name: p.display_name,
                            lst_price: p.lst_price,
                            standard_price: p.standard_price,
                            categ_id: p.categ_id,
                            pos_categ_id: p.pos_categ_id,
                            taxes_id: p.taxes_id,
                            barcode: p.barcode,
                            default_code: p.default_code,
                            to_weight: p.to_weight,
                            uom_id: p.uom_id,
                            description_sale: p.description_sale,
                            description: p.description,
                            product_tmpl_id: p.product_tmpl_id,
                            tracking: p.tracking,
                            write_date: p.write_date,
                            available_in_pos: p.available_in_pos
                        };
                    });
                    
                    // Save clean data to IndexedDB
                    await this.db.save_products_to_indexeddb(clean_products);
                    console.log(`✓ Saved ${clean_products.length} products to IndexedDB`);
                    
                    // Only add to POS memory if NOT in lazy mode
                    const sync_method = (this.pos.config && this.pos.config.sync_method) || 'normal';
                    if (sync_method !== 'lazy') {
                        // Convert to Product model instances for POS memory
                        const product_models = this._convert_to_product_models(products);
                        console.log(`✓ Converted ${product_models.length} products to models`);
                        
                        // Add Product instances to POS memory
                        this.pos.db.add_products(product_models);
                        console.log(`✓ Added ${product_models.length} products to POS memory`);
                    } else {
                        console.log(`⚡ Lazy mode: Products saved to IndexedDB only (not loaded to memory)`);
                    }
                    
                    processed += products.length;
                    const progress_percent = Math.round(processed/total_count*100);
                    console.log(`📦 Delta fetched: ${processed}/${total_count} (${progress_percent}%)`);
                    
                    // Trigger progress event
                    this.trigger('delta-sync-progress', {
                        processed: processed,
                        total: total_count,
                        percent: progress_percent
                    });
                } else {
                    console.warn(`⚠️ No products returned from server for offset ${offset}`);
                }
                
                // If less than batch size, we're done
                if (!products || products.length < batch_size) {
                    break;
                }
            }
            
            console.log(`✅ Fetch complete: ${processed} products processed`);
            
            // Check for deleted products after processing updates
            console.log('🔄 Checking for deleted products...');
            await this._remove_deleted_products();
            
            this.product_fetch_in_progress = false;
            return processed;
            
        } catch (error) {
            console.error('Error fetching delta products:', error);
            this.product_fetch_in_progress = false;
            throw error;
        }
    },

    /**
     * Fetch pricelist items from server in batches
     */
    _fetch_pricelist_items_in_batches: async function(last_sync, total_count) {
        // Prevent parallel pricelist fetching
        if (this.pricelist_fetch_in_progress) {
            console.log('⏸️ Pricelist fetch already in progress, skipping...');
            return 0;
        }
        
        this.pricelist_fetch_in_progress = true;
        
        const batch_size = 500;
        let processed = 0;
        
        console.log(`📥 Fetching pricelist items updated after: ${last_sync}`);
        
        try {
            // Fetch in batches
            for (let offset = 0; offset < total_count; offset += batch_size) {
                console.log(`Requesting pricelist items batch: offset=${offset}, limit=${batch_size}`);
                
                const items = await rpc.query({
                    route: '/pos/get_updates_pricelist_items',
                    params: {
                        session_id: this.pos.pos_session.id,
                        last_write_date: last_sync,
                        limit: batch_size,
                        offset: offset
                    }
                });

                console.log(`Server returned ${items ? items.length : 0} pricelist items`);
                
                if (items && items.length > 0) {
                    // Clean items for IndexedDB and memory
                    const clean_items = items.map(item => ({
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
                    }));
                    
                    // Save cleaned items to IndexedDB
                    await this.db.save_pricelist_items_to_indexeddb(clean_items);
                    console.log(`✓ Saved ${clean_items.length} pricelist items to IndexedDB`);
                    
                    // Add cleaned items to POS memory
                    if (this.pos.pricelists) {
                        clean_items.forEach(item => {
                            const pricelist = this.pos.pricelists.find(pl => pl.id === item.pricelist_id);
                            if (pricelist) {
                                if (!pricelist.items) pricelist.items = [];
                                // Update or add item
                                const existing_idx = pricelist.items.findIndex(i => i.id === item.id);
                                if (existing_idx >= 0) {
                                    pricelist.items[existing_idx] = item;
                                } else {
                                    pricelist.items.push(item);
                                }
                            }
                        });
                    }
                    
                    processed += items.length;
                    console.log(`📦 Pricelist items fetched: ${processed}/${total_count}`);
                } else {
                    console.warn(`⚠️ No pricelist items returned for offset ${offset}`);
                }
                
                // If less than batch size, we're done
                if (!items || items.length < batch_size) {
                    break;
                }
            }
            
            console.log(`✅ Pricelist items fetch complete: ${processed} items processed`);
            
            // Check for deleted items on every sync (very lightweight now)
            console.log('🔄 Triggering deletion sync check...');
            await this._remove_deleted_pricelist_items();
            
            this.pricelist_fetch_in_progress = false;
            return processed;
            
        } catch (error) {
            console.error('Error fetching pricelist items:', error);
            this.pricelist_fetch_in_progress = false;
            throw error;
        }
    },

    /**
     * Fetch partners in background (non-blocking)
     */
    _fetch_partners_background: function(last_sync) {
        const self = this;
        
        console.log('🔄 Starting background partners sync...');
        
        setTimeout(async function() {
            try {
                const partners = await rpc.query({
                    route: '/pos/get_updates_partners',
                    params: {
                        session_id: self.pos.pos_session.id,
                        last_write_date: last_sync
                    }
                });

                if (partners && partners.length > 0) {
                    console.log(`Processing ${partners.length} partners...`);
                    await self.db.save_partners_to_indexeddb(partners);
                    self.pos.db.add_partners(partners);
                    console.log(`✓ Updated ${partners.length} partners`);
                }
                
                // Check for deleted partners
                console.log('🔄 Checking for deleted partners...');
                await self._remove_deleted_partners();
                
                console.log(`✅ Background partners sync complete`);
            } catch (error) {
                console.error('Background partners sync error:', error);
            }
        }, 500);
    },

    /**
     * Fetch pricelist items in background (non-blocking)
     */
    _fetch_pricelist_items_background: function(last_sync, total_count) {
        const self = this;
        
        console.log('🔄 Starting background pricelist items sync...');
        
        // Run after a short delay to let UI load
        setTimeout(function() {
            self._fetch_pricelist_items_in_batches(last_sync, total_count)
                .then(function(count) {
                    console.log(`✅ Background pricelist sync complete: ${count} items synced`);
                })
                .catch(function(error) {
                    console.error('Background pricelist sync error:', error);
                });
        }, 500);
    },

    /**
     * Fetch initial pricelist items in background (first sync)
     */
    _fetch_initial_pricelist_items_background: function() {
        const self = this;
        
        console.log('🔄 Starting initial pricelist items load in background...');
        
        setTimeout(async function() {
            try {
                const all_items_result = await rpc.query({
                    route: '/pos/get_updates_pricelist_items',
                    params: {
                        session_id: self.pos.pos_session.id,
                        last_write_date: null,  // Get all items
                        limit: 1000,
                        offset: 0
                    }
                });
                
                if (all_items_result && all_items_result.length > 0) {
                    console.log(`Loading ${all_items_result.length} initial pricelist items...`);
                    
                    // Clean items before saving
                    const clean_items = all_items_result.map(item => ({
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
                    }));
                    
                    await self.db.save_pricelist_items_to_indexeddb(clean_items);
                    
                    // Add to memory
                    if (self.pos.pricelists) {
                        clean_items.forEach(item => {
                            const pricelist = self.pos.pricelists.find(pl => pl.id === item.pricelist_id);
                            if (pricelist) {
                                if (!pricelist.items) pricelist.items = [];
                                pricelist.items.push(item);
                            }
                        });
                    }
                    
                    console.log(`✅ Loaded ${clean_items.length} initial pricelist items in background`);
                }
            } catch (error) {
                console.error('Error loading initial pricelist items:', error);
            }
        }, 500);
    },

    /**
     * Remove pricelist items that were deleted on server
     * Uses deletion tracking table - very efficient
     */
    _remove_deleted_pricelist_items: async function() {
        try {
            // Get last deletion check timestamp
            const last_check = await this.db.get_sync_metadata('last_deletion_check_pricelist_items');
            
            // Only check deletions once per minute
            if (last_check) {
                const last_check_time = new Date(last_check);
                const now = new Date();
                const minutes_since_check = (now - last_check_time) / (1000 * 60);
                
                if (minutes_since_check < 1) {
                    console.log(`⏸️ Pricelist deletion check skipped - last check was ${Math.round(minutes_since_check * 60)} seconds ago`);
                    return;
                }
            }
            
            console.log('═══════════════════════════════════════════════════');
            console.log('🗑️  STARTING DELETION SYNC FOR PRICELIST ITEMS');
            console.log('═══════════════════════════════════════════════════');
            const since_timestamp = last_check || '2000-01-01 00:00:00';
            
            console.log(`📅 Last deletion check: ${last_check || 'NEVER'}`);
            console.log(`📅 Checking deletions since: ${since_timestamp}`);
            console.log(`📡 Calling server route: /pos/get_deleted_pricelist_items`);
            console.log(`📋 Session ID: ${this.pos.pos_session.id}`);
            
            // Get deleted item IDs from server (only records deleted since last check)
            const deleted_ids = await rpc.query({
                route: '/pos/get_deleted_pricelist_items',
                params: {
                    session_id: this.pos.pos_session.id,
                    since_timestamp: since_timestamp
                }
            });
            
            console.log(`📬 Server response:`, deleted_ids);
            
            if (!deleted_ids || !Array.isArray(deleted_ids)) {
                console.warn('⚠️  Failed to get deleted pricelist item IDs (not an array)');
                console.log('═══════════════════════════════════════════════════');
                return;
            }
            
            console.log(`📊 Found ${deleted_ids.length} deleted pricelist items`);
            
            if (deleted_ids.length > 0) {
                console.log(`🗑️  Deleted item IDs:`, deleted_ids);
                console.log(`💾 Removing from IndexedDB...`);
                
                // Remove from IndexedDB
                const deleted_from_db = await this.db.delete_pricelist_items_from_indexeddb(deleted_ids);
                console.log(`✓ Removed ${deleted_from_db} items from IndexedDB`);
                
                // Remove from memory
                console.log(`🧠 Removing from POS memory...`);
                let removed_from_memory = 0;
                if (this.pos.pricelists) {
                    this.pos.pricelists.forEach(pricelist => {
                        if (pricelist.items) {
                            const before_count = pricelist.items.length;
                            pricelist.items = pricelist.items.filter(item => !deleted_ids.includes(item.id));
                            const after_count = pricelist.items.length;
                            removed_from_memory += (before_count - after_count);
                            if (before_count !== after_count) {
                                console.log(`  - Pricelist "${pricelist.name}": ${before_count - after_count} items removed`);
                            }
                        }
                    });
                }
                console.log(`✓ Removed ${removed_from_memory} items from memory`);
                
                console.log(`✅ Successfully removed ${deleted_ids.length} deleted pricelist items`);
            } else {
                console.log('✓ No deleted items found (all in sync)');
            }
            
            // Update last check timestamp
            const now = moment().format('YYYY-MM-DD HH:mm:ss');
            console.log(`💾 Updating last deletion check timestamp to: ${now}`);
            await this.db.set_sync_metadata('last_deletion_check_pricelist_items', now);
            
            console.log('═══════════════════════════════════════════════════');
            console.log('✅ DELETION SYNC COMPLETED SUCCESSFULLY');
            console.log('═══════════════════════════════════════════════════');
            
        } catch (error) {
            console.error('═══════════════════════════════════════════════════');
            console.error('❌ ERROR IN DELETION SYNC:', error);
            console.error('Stack trace:', error.stack);
            console.error('═══════════════════════════════════════════════════');
        }
    },

    /**
     * Remove products that were deleted on server
     */
    _remove_deleted_products: async function() {
        try {
            // Get last deletion check timestamp
            const last_check = await this.db.get_sync_metadata('last_deletion_check_products');
            
            // Only check deletions once per minute
            if (last_check) {
                const last_check_time = new Date(last_check);
                const now = new Date();
                const minutes_since_check = (now - last_check_time) / (1000 * 60);
                
                if (minutes_since_check < 1) {
                    console.log(`⏸️ Product deletion check skipped - last check was ${Math.round(minutes_since_check * 60)} seconds ago`);
                    return;
                }
            }
            
            console.log('═══════════════════════════════════════════════════');
            console.log('🗑️  STARTING DELETION SYNC FOR PRODUCTS');
            console.log('═══════════════════════════════════════════════════');
            const since_timestamp = last_check || '2000-01-01 00:00:00';
            
            console.log(`📅 Last deletion check: ${last_check || 'NEVER'}`);
            console.log(`📅 Checking deletions since: ${since_timestamp}`);
            
            const deleted_ids = await rpc.query({
                route: '/pos/get_deleted_products',
                params: {
                    session_id: this.pos.pos_session.id,
                    since_timestamp: since_timestamp
                }
            });
            
            console.log(`📬 Server response:`, deleted_ids);
            
            if (!deleted_ids || !Array.isArray(deleted_ids)) {
                console.warn('⚠️  Failed to get deleted product IDs');
                console.log('═══════════════════════════════════════════════════');
                return;
            }
            
            console.log(`📊 Found ${deleted_ids.length} deleted products`);
            
            if (deleted_ids.length > 0) {
                console.log(`🗑️  Deleted product IDs:`, deleted_ids);
                
                // Remove from IndexedDB
                const deleted_from_db = await this.db.delete_products_from_indexeddb(deleted_ids);
                console.log(`✓ Removed ${deleted_from_db} products from IndexedDB`);
                
                // Remove from POS memory
                deleted_ids.forEach(id => {
                    const product = this.pos.db.get_product_by_id(id);
                    if (product) {
                        // Remove from various indexes
                        delete this.pos.db.product_by_id[id];
                        if (product.barcode) {
                            delete this.pos.db.product_by_barcode[product.barcode];
                        }
                    }
                });
                console.log(`✓ Removed ${deleted_ids.length} products from memory`);
                
                console.log(`✅ Successfully removed ${deleted_ids.length} deleted products`);
            } else {
                console.log('✓ No deleted products found');
            }
            
            const now = moment().format('YYYY-MM-DD HH:mm:ss');
            await this.db.set_sync_metadata('last_deletion_check_products', now);
            
            console.log('═══════════════════════════════════════════════════');
            console.log('✅ PRODUCT DELETION SYNC COMPLETED');
            console.log('═══════════════════════════════════════════════════');
            
        } catch (error) {
            console.error('═══════════════════════════════════════════════════');
            console.error('❌ ERROR IN PRODUCT DELETION SYNC:', error);
            console.error('═══════════════════════════════════════════════════');
        }
    },

    /**
     * Remove partners that were deleted on server
     */
    _remove_deleted_partners: async function() {
        try {
            // Get last deletion check timestamp
            const last_check = await this.db.get_sync_metadata('last_deletion_check_partners');
            
            // Only check deletions once per minute
            if (last_check) {
                const last_check_time = new Date(last_check);
                const now = new Date();
                const minutes_since_check = (now - last_check_time) / (1000 * 60);
                
                if (minutes_since_check < 1) {
                    console.log(`⏸️ Partner deletion check skipped - last check was ${Math.round(minutes_since_check * 60)} seconds ago`);
                    return;
                }
            }
            
            console.log('═══════════════════════════════════════════════════');
            console.log('🗑️  STARTING DELETION SYNC FOR PARTNERS');
            console.log('═══════════════════════════════════════════════════');
            const since_timestamp = last_check || '2000-01-01 00:00:00';
            
            console.log(`📅 Last deletion check: ${last_check || 'NEVER'}`);
            console.log(`📅 Checking deletions since: ${since_timestamp}`);
            
            const deleted_ids = await rpc.query({
                route: '/pos/get_deleted_partners',
                params: {
                    session_id: this.pos.pos_session.id,
                    since_timestamp: since_timestamp
                }
            });
            
            console.log(`📬 Server response:`, deleted_ids);
            
            if (!deleted_ids || !Array.isArray(deleted_ids)) {
                console.warn('⚠️  Failed to get deleted partner IDs');
                console.log('═══════════════════════════════════════════════════');
                return;
            }
            
            console.log(`📊 Found ${deleted_ids.length} deleted partners`);
            
            if (deleted_ids.length > 0) {
                console.log(`🗑️  Deleted partner IDs:`, deleted_ids);
                
                // Remove from IndexedDB
                const deleted_from_db = await this.db.delete_partners_from_indexeddb(deleted_ids);
                console.log(`✓ Removed ${deleted_from_db} partners from IndexedDB`);
                
                // Remove from POS memory
                deleted_ids.forEach(id => {
                    delete this.pos.db.partner_by_id[id];
                });
                console.log(`✓ Removed ${deleted_ids.length} partners from memory`);
                
                console.log(`✅ Successfully removed ${deleted_ids.length} deleted partners`);
            } else {
                console.log('✓ No deleted partners found');
            }
            
            const now = moment().format('YYYY-MM-DD HH:mm:ss');
            await this.db.set_sync_metadata('last_deletion_check_partners', now);
            
            console.log('═══════════════════════════════════════════════════');
            console.log('✅ PARTNER DELETION SYNC COMPLETED');
            console.log('═══════════════════════════════════════════════════');
            
        } catch (error) {
            console.error('═══════════════════════════════════════════════════');
            console.error('❌ ERROR IN PARTNER DELETION SYNC:', error);
            console.error('═══════════════════════════════════════════════════');
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

    /**
     * Sync stock quantities from server (initial load)
     */
    sync_stock_quantities: async function() {
        const config = this.pos.config;
        
        // Check if stock sync is enabled
        if (!config.enable_stock_sync) {
            console.log('📦 Stock sync is disabled in POS configuration');
            return {success: false, reason: 'disabled'};
        }

        console.log('📦 Starting stock quantities sync...');
        
        try {
            const result = await rpc.query({
                route: '/pos/get_stock_quantities',
                params: {
                    session_id: this.pos.pos_session.id
                }
            }, {
                timeout: 60000,
                shadow: true
            });

            if (result && result.length > 0) {
                // Save to IndexedDB
                await this.db.save_stock_to_indexeddb(result);
                
                // Update product models in memory
                result.forEach(stock => {
                    const product = this.pos.db.get_product_by_id(stock.product_id);
                    if (product) {
                        product.stock_data = stock;
                    }
                });
                
                // Update sync metadata
                await this.db.set_sync_metadata('stock_last_sync', new Date().toISOString());
                await this.db.set_sync_metadata('stock_count', result.length);
                
                console.log(`✅ Stock sync completed: ${result.length} products`);
                
                return {
                    success: true,
                    count: result.length
                };
            } else {
                console.log('⚠️ No stock data returned from server');
                return {success: false, reason: 'no_data'};
            }
        } catch (error) {
            console.error('❌ Stock sync failed:', error);
            return {
                success: false,
                error: error.message || 'Unknown error'
            };
        }
    },

    /**
     * Sync stock quantity changes (delta sync)
     */
    sync_delta_stock: async function() {
        const config = this.pos.config;
        
        // Check if stock sync is enabled
        if (!config.enable_stock_sync) {
            return {success: false, reason: 'disabled'};
        }

        // Check time interval
        const last_check = await this.db.get_sync_metadata('stock_delta_last_check');
        const interval_minutes = config.stock_sync_interval || 5;
        
        if (last_check) {
            const last_check_time = new Date(last_check);
            const now = new Date();
            const minutes_since_check = (now - last_check_time) / (1000 * 60);
            
            if (minutes_since_check < interval_minutes) {
                console.log(`⏸️ Stock delta sync skipped - last check was ${Math.round(minutes_since_check)} minutes ago (interval: ${interval_minutes} min)`);
                return {success: false, reason: 'interval_not_reached'};
            }
        }

        console.log(`📦 Starting delta stock sync (interval: ${interval_minutes} min)...`);

        try {
            const last_sync = await this.db.get_sync_metadata('stock_last_sync');
            const since_timestamp = last_sync || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

            const result = await rpc.query({
                route: '/pos/get_stock_updates',
                params: {
                    session_id: this.pos.pos_session.id,
                    since_timestamp: since_timestamp
                }
            }, {
                timeout: 30000,
                shadow: true
            });

            // Update last check time
            await this.db.set_sync_metadata('stock_delta_last_check', new Date().toISOString());

            if (result && result.length > 0) {
                // Save updated stock to IndexedDB
                await this.db.save_stock_to_indexeddb(result);
                
                // Update product models in memory
                result.forEach(stock => {
                    const product = this.pos.db.get_product_by_id(stock.product_id);
                    if (product) {
                        product.stock_data = stock;
                    }
                });
                
                // Update sync metadata
                await this.db.set_sync_metadata('stock_last_sync', new Date().toISOString());
                
                console.log(`✅ Delta stock sync: ${result.length} products updated`);
                
                return {
                    success: true,
                    updated: result.length
                };
            } else {
                console.log('✅ Delta stock sync: no changes');
                return {success: true, updated: 0};
            }
        } catch (error) {
            console.error('❌ Delta stock sync failed:', error);
            return {
                success: false,
                error: error.message || 'Unknown error'
            };
        }
    },

    /**
     * Check for deleted stock records (products removed from location)
     */
    sync_deleted_stock: async function(product_ids) {
        if (!product_ids || product_ids.length === 0) {
            return {success: true, deleted: 0};
        }

        try {
            // Delete stock records for deleted products
            await this.db.delete_stock_from_indexeddb(product_ids);
            
            console.log(`🗑️ Deleted stock for ${product_ids.length} products`);
            
            return {
                success: true,
                deleted: product_ids.length
            };
        } catch (error) {
            console.error('❌ Delete stock sync failed:', error);
            return {
                success: false,
                error: error.message || 'Unknown error'
            };
        }
    },
});

return SyncService;

});
