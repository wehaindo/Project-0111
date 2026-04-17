odoo.define('weha_pos_self_sync.manual_sync_widget', function (require) {
"use strict";

const PosComponent = require('point_of_sale.PosComponent');
const Registries = require('point_of_sale.Registries');
const { useListener } = require('web.custom_hooks');

/**
 * Manual Sync Controls Widget
 * Provides buttons for manual sync operations
 */
class ManualSyncControls extends PosComponent {
    constructor() {
        super(...arguments);
        this.state = {
            delta_syncing: false,
            delete_syncing: false,
            stock_syncing: false
        };
    }

    get sync_service() {
        return this.env.pos.sync_service;
    }

    /**
     * Manual Delta Sync - Sync product/partner changes
     */
    async manual_delta_sync() {
        if (!this.sync_service) {
            this.showPopup('ErrorPopup', {
                title: 'Sync Service Not Available',
                body: 'Sync service is not initialized. Please enable hybrid sync in POS configuration.'
            });
            return;
        }

        if (this.state.delta_syncing) {
            return; // Already syncing
        }

        this.state.delta_syncing = true;
        this.render();

        try {
            console.log('🔄 Manual delta sync started...');
            
            // Trigger delta sync which includes products, partners, and pricelists
            const result = await this.sync_service.sync_delta_updates();

            if (result !== false) {
                this.showPopup('ConfirmPopup', {
                    title: 'Delta Sync Complete',
                    body: 'Successfully synced products, partners, and pricelists',
                    confirmText: 'OK',
                    cancelText: false
                });

                console.log(`✅ Manual delta sync complete`);
            } else {
                throw new Error('Delta sync failed or already in progress');
            }
        } catch (error) {
            console.error('❌ Manual delta sync failed:', error);
            this.showPopup('ErrorPopup', {
                title: 'Delta Sync Failed',
                body: error.message || 'An error occurred during delta sync'
            });
        } finally {
            this.state.delta_syncing = false;
            this.render();
        }
    }

    /**
     * Manual Delete Sync - Sync deleted products/partners
     */
    async manual_delete_sync() {
        if (!this.sync_service) {
            this.showPopup('ErrorPopup', {
                title: 'Sync Service Not Available',
                body: 'Sync service is not initialized. Please enable hybrid sync in POS configuration.'
            });
            return;
        }

        if (this.state.delete_syncing) {
            return; // Already syncing
        }

        this.state.delete_syncing = true;
        this.render();

        try {
            console.log('🗑️ Manual delete sync started...');
            
            // Call the internal deletion check methods
            await this.sync_service._remove_deleted_products();
            await this.sync_service._remove_deleted_partners();
            await this.sync_service._remove_deleted_pricelist_items();

            this.showPopup('ConfirmPopup', {
                title: 'Delete Sync Complete',
                body: 'Successfully checked and removed deleted records',
                confirmText: 'OK',
                cancelText: false
            });

            console.log(`✅ Manual delete sync complete`);
        } catch (error) {
            console.error('❌ Manual delete sync failed:', error);
            this.showPopup('ErrorPopup', {
                title: 'Delete Sync Failed',
                body: error.message || 'An error occurred during delete sync'
            });
        } finally {
            this.state.delete_syncing = false;
            this.render();
        }
    }

    /**
     * Manual Stock Sync - Sync stock quantities
     */
    async manual_stock_sync() {
        if (!this.sync_service) {
            this.showPopup('ErrorPopup', {
                title: 'Sync Service Not Available',
                body: 'Sync service is not initialized. Please enable hybrid sync in POS configuration.'
            });
            return;
        }

        if (!this.env.pos.config.enable_stock_sync) {
            this.showPopup('ErrorPopup', {
                title: 'Stock Sync Disabled',
                body: 'Stock sync is not enabled in POS configuration. Please enable it first.'
            });
            return;
        }

        if (this.state.stock_syncing) {
            return; // Already syncing
        }

        this.state.stock_syncing = true;
        this.render();

        try {
            console.log('📦 Manual stock sync started...');
            
            // Full stock sync
            const result = await this.sync_service.sync_stock_quantities();

            if (result.success) {
                this.showPopup('ConfirmPopup', {
                    title: 'Stock Sync Complete',
                    body: `Successfully synced stock quantities for ${result.count} products`,
                    confirmText: 'OK',
                    cancelText: false
                });

                console.log(`✅ Manual stock sync complete: ${result.count} products`);
                
                // Trigger product list refresh if needed
                this.trigger('stock-updated');
            } else {
                throw new Error(result.error || result.reason || 'Unknown error');
            }
        } catch (error) {
            console.error('❌ Manual stock sync failed:', error);
            this.showPopup('ErrorPopup', {
                title: 'Stock Sync Failed',
                body: error.message || 'An error occurred during stock sync'
            });
        } finally {
            this.state.stock_syncing = false;
            this.render();
        }
    }
}

ManualSyncControls.template = 'ManualSyncControls';

Registries.Component.add(ManualSyncControls);

return ManualSyncControls;

});
