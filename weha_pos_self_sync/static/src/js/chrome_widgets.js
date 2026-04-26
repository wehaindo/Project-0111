odoo.define('weha_pos_self_sync.chrome_widgets', function (require) {
"use strict";

var chrome = require('point_of_sale.chrome');
var ManualSyncControls = require('weha_pos_self_sync.manual_sync_widget');

/**
 * Register the ManualSyncControls widget into the Chrome widgets array
 * so it gets instantiated by load_widgets() and appended to .pos-rightheader.
 * This is the standard Odoo 13 way to add header widgets.
 */
chrome.Chrome.prototype.widgets.push({
    name:      'manual_sync',
    widget:    ManualSyncControls,
    prepend:   '.pos-rightheader',
    condition: function() {
        return !!(this.pos.config && this.pos.config.enable_hybrid_sync);
    },
});

});

