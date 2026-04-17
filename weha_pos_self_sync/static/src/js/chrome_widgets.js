odoo.define('weha_pos_self_sync.chrome_widgets', function (require) {
"use strict";

const Chrome = require('point_of_sale.Chrome');
const { Gui } = require('point_of_sale.Gui');

/**
 * Extend Chrome to add Manual Sync Controls
 */
const PosChrome = Chrome =>
    class extends Chrome {
        /**
         * Check if manual sync controls should be shown
         */
        get showManualSyncControls() {
            return this.env.pos.config && 
                   this.env.pos.config.enable_hybrid_sync &&
                   this.env.pos.sync_service;
        }
    };

Chrome.include(PosChrome);

return Chrome;

});
