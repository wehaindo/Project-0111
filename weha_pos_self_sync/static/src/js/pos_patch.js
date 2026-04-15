odoo.define('weha_pos_self_sync.pos_patch', function (require) {
"use strict";

const models = require('point_of_sale.models');
const screens = require('point_of_sale.screens');
const chrome = require('point_of_sale.chrome');
const SyncService = require('weha_pos_self_sync.sync_service');

/**
 * Main POS Integration Patch
 * Integrates sync service and hybrid sync functionality
 */

const _super_posmodel = models.PosModel.prototype;

models.PosModel = models.PosModel.extend({
    /**
     * Initialize sync service
     */
    initialize: function(session, attributes) {
        _super_posmodel.initialize.call(this, session, attributes);
        
        this.sync_service = null;
        this.sync_status = {
            is_online: navigator.onLine,
            pending_count: 0,
            syncing: false,
            last_sync: null
        };
    },

    /**
     * After load - start sync service
     */
    after_load_server_data: async function() {
        await _super_posmodel.after_load_server_data.call(this);

        // Initialize sync service if enabled
        if (this.config && this.config.enable_hybrid_sync) {
            await this.init_sync_service();
        }
    },

    /**
     * Initialize sync service
     */
    init_sync_service: async function() {
        try {
            console.log('Initializing hybrid sync service...');

            // Create sync service
            this.sync_service = new SyncService(this);

            // Setup event listeners
            this.sync_service.on('sync-started', this, this.on_sync_started);
            this.sync_service.on('sync-completed', this, this.on_sync_completed);
            this.sync_service.on('sync-error', this, this.on_sync_error);
            this.sync_service.on('network-status-changed', this, this.on_network_status_changed);
            this.sync_service.on('delta-sync-completed', this, this.on_delta_sync_completed);

            // Start service
            this.sync_service.start();

            console.log('Sync service initialized successfully');

            // Initial delta sync
            if (this.config.enable_delta_sync) {
                setTimeout(() => {
                    this.sync_service.sync_delta_updates();
                }, 5000);
            }

        } catch (error) {
            console.error('Error initializing sync service:', error);
        }
    },

    /**
     * Sync started event
     */
    on_sync_started: function() {
        this.sync_status.syncing = true;
        this.trigger('sync-status-changed', this.sync_status);
        console.log('Sync started...');
    },

    /**
     * Sync completed event
     */
    on_sync_completed: function(data) {
        this.sync_status.syncing = false;
        this.sync_status.last_sync = new Date();
        this.sync_status.pending_count = data.stats ? data.stats.pending_count : 0;
        
        this.trigger('sync-status-changed', this.sync_status);
        
        console.log('Sync completed:', data);

        // Show notification if any synced
        if (data.synced > 0) {
            console.log(`${data.synced} order(s) synced successfully`);
        }

        // Show warning if any failed
        if (data.failed > 0) {
            console.warn(`${data.failed} order(s) failed to sync`);
        }
    },

    /**
     * Sync error event
     */
    on_sync_error: function(data) {
        this.sync_status.syncing = false;
        this.trigger('sync-status-changed', this.sync_status);
        
        console.error('Sync error:', data.error);
        console.log('Sync error occurred', 5000);
    },

    /**
     * Network status changed event
     */
    on_network_status_changed: function(data) {
        this.sync_status.is_online = data.online;
        this.trigger('sync-status-changed', this.sync_status);
        
        if (data.online) {
            console.log('Connection restored - syncing...', 3000);
        } else {
            console.log('Working offline', 3000);
        }
    },

    /**
     * Delta sync completed event
     */
    on_delta_sync_completed: function(data) {
        console.log('Delta sync completed:', data);
        
        if (data.products > 0 || data.partners > 0) {
            Gui.showNotification(
                `Updated: ${data.products} products, ${data.partners} partners`,
                3000
            );
        }
    },

    /**
     * On close - stop sync service
     */
    close: function() {
        if (this.sync_service) {
            this.sync_service.stop();
        }
        
        return _super_posmodel.close.call(this);
    },
});

// Extend ProductScreen for lazy loading
const ProductScreenWidget = screens.ProductScreenWidget;

ProductScreenWidget.include({
    /**
     * Override category click to lazy load products
     */
    click_product_category: async function(category) {
        const self = this;
        
        // Call parent
        this._super(category);

        // Lazy load products if enabled
        if (this.pos.config.lazy_load_products) {
            try {
                const category_id = category ? category.id : null;
                
                // Load products for this category
                await this.pos.load_products_by_category(category_id);
                
                // Refresh product list
                this.product_list_widget.renderElement();

            } catch (error) {
                console.error('Error loading category products:', error);
            }
        }
    },

    /**
     * Override search to load products from server if not found locally
     */
    perform_search: async function(category, query, buy_result) {
        const self = this;
        
        // Try local search first
        this._super(category, query, buy_result);

        // If lazy loading enabled and query provided
        if (this.pos.config.lazy_load_products && query && query.length >= 3) {
            try {
                // Search server for additional products
                const products = await this.pos.search_products_server(query);
                
                if (products && products.length > 0) {
                    // Refresh product list to show new products
                    this.product_list_widget.renderElement();
                }

            } catch (error) {
                console.error('Error searching products:', error);
            }
        }
    },
});

// Add sync status widget to Chrome
const Chrome = chrome.Chrome;

Chrome.include({
    start: function() {
        const self = this;
        this._super();

        // Add sync status indicator
        if (this.pos && this.pos.config && this.pos.config.enable_hybrid_sync) {
            this.render_sync_status_widget();
            
            // Update on sync status changes
            this.pos.on('sync-status-changed', this, this.update_sync_status);
        }
    },

    /**
     * Render sync status widget
     */
    render_sync_status_widget: function() {
        const self = this;
        
        // Create widget container
        const $status_widget = $('<div>')
            .addClass('pos-sync-status')
            .appendTo(this.$('.pos-branding'));

        // Add sync indicator
        this.$sync_indicator = $('<span>')
            .addClass('sync-indicator')
            .attr('title', 'Sync Status')
            .appendTo($status_widget);

        // Add pending count
        this.$pending_count = $('<span>')
            .addClass('pending-count')
            .hide()
            .appendTo($status_widget);

        // Add click handler
        $status_widget.click(function() {
            self.show_sync_details();
        });

        // Initial update
        this.update_sync_status(this.pos.sync_status);
    },

    /**
     * Update sync status display
     */
    update_sync_status: function(status) {
        if (!this.$sync_indicator) return;

        // Update indicator
        this.$sync_indicator
            .removeClass('online offline syncing')
            .addClass(status.is_online ? 'online' : 'offline');

        if (status.syncing) {
            this.$sync_indicator.addClass('syncing');
        }

        // Update tooltip
        let tooltip = status.is_online ? 'Online' : 'Offline';
        if (status.syncing) {
            tooltip += ' - Syncing...';
        }
        if (status.last_sync) {
            tooltip += `\nLast sync: ${status.last_sync.toLocaleTimeString()}`;
        }
        this.$sync_indicator.attr('title', tooltip);

        // Update pending count
        if (status.pending_count > 0) {
            this.$pending_count
                .text(status.pending_count)
                .show();
        } else {
            this.$pending_count.hide();
        }
    },

    /**
     * Show sync details popup
     */
    show_sync_details: async function() {
        const self = this;

        try {
            // Get queue status
            const queue_status = await this.pos.get_sync_queue_status();
            const sync_stats = this.pos.sync_service.get_sync_stats();

            // Create popup content
            let content = '<div class="sync-details">';
            content += '<h3>Sync Status</h3>';
            content += `<p><strong>Network:</strong> ${this.pos.sync_status.is_online ? 'Online' : 'Offline'}</p>`;
            
            if (queue_status) {
                content += '<h4>Queue Status</h4>';
                content += `<p>Pending: ${queue_status.pending}</p>`;
                content += `<p>Failed: ${queue_status.failed}</p>`;
                content += `<p>Synced: ${queue_status.synced}</p>`;
                content += `<p>Total: ${queue_status.total}</p>`;
            }

            content += '<h4>Sync Statistics</h4>';
            content += `<p>Total Synced: ${sync_stats.total_synced}</p>`;
            content += `<p>Total Failed: ${sync_stats.total_failed}</p>`;
            if (sync_stats.last_sync) {
                content += `<p>Last Sync: ${new Date(sync_stats.last_sync).toLocaleString()}</p>`;
            }

            content += '<div class="sync-actions" style="margin-top: 20px;">';
            content += '<button class="button btn-sync-now">Sync Now</button> ';
            content += '<button class="button btn-retry-failed">Retry Failed</button> ';
            content += '<button class="button btn-clear-synced">Clear Synced</button>';
            content += '</div>';

            content += '</div>';

            // Show status in console (Odoo 13 doesn't have Gui in this context)
            console.log('Hybrid Sync Status:', content);

            // Add button handlers
            setTimeout(function() {
                $('.btn-sync-now').click(function() {
                    self.pos.sync_service.force_sync();
                });

                $('.btn-retry-failed').click(function() {
                    self.pos.sync_service.retry_failed_orders();
                });

                $('.btn-clear-synced').click(function() {
                    self.pos.clear_synced_orders();
                });
            }, 100);

        } catch (error) {
            console.error('Error showing sync details:', error);
            console.log('Error loading sync details', 3000);
        }
    },
});

// Override payment screen to handle offline payments
const PaymentScreenWidget = screens.PaymentScreenWidget;

PaymentScreenWidget.include({
    /**
     * Override validate order to use queue
     */
    validate_order: async function(force_validation) {
        const self = this;
        const order = this.pos.get_order();

        // If hybrid sync enabled
        if (this.pos && this.pos.config && this.pos.config.enable_hybrid_sync) {
            // Validate order data
            if (!order.get_orderlines().length) {
                console.log('Empty order');
                return;
            }

            // Check if fully paid
            if (order.is_paid_with_cash() || order.get_due() === 0 || force_validation) {
                try {
                    // Add to sync queue
                    await order.add_to_sync_queue();
                    
                    // Show success
                    this.show_receipt();

                } catch (error) {
                    console.error('Error queuing order:', error);
                }
            } else {
                console.log('Order not fully paid');
            }
        } else {
            // Standard validation
            return this._super(force_validation);
        }
    },
});

console.log('POS Hybrid Sync patches loaded');

});
