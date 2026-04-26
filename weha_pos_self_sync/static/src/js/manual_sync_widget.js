odoo.define('weha_pos_self_sync.manual_sync_widget', function (require) {
"use strict";

var PosBaseWidget = require('point_of_sale.BaseWidget');

/**
 * Manual Sync Controls Widget (Odoo 13)
 *
 * Follows the same pattern as SynchNotificationWidget:
 *   - Template is a plain div.oe_status with icon states (idle / syncing / done / error)
 *   - Clicking the icon opens a popup that is appended directly to <body>
 *     so position:fixed covers the full viewport regardless of POS transforms.
 */
var ManualSyncControls = PosBaseWidget.extend({
    template: 'ManualSyncControls',

    events: {
        'click .js_idle':  '_toggle_popup',
        'click .js_done':  '_toggle_popup',
        'click .js_error': '_toggle_popup',
    },

    init: function(parent, options) {
        this._super(parent, options);
        this._busy    = false;
        this._$popup  = null;
    },

    start: function() {
        var self   = this;
        var result = this._super.apply(this, arguments);

        // Build popup HTML and attach to <body> so position:fixed is viewport-relative
        this._$popup = $(
            '<div class="sync-popup-overlay" style="display:none;">' +
              '<div class="sync-popup">' +
                '<div class="sync-popup-header">' +
                  '<span class="sync-popup-title">' +
                    '<i class="fa fa-refresh"></i> Sync Options' +
                  '</span>' +
                  '<span class="sync-popup-close">&#x2715;</span>' +
                '</div>' +
                '<div class="sync-popup-body">' +
                  '<button class="sync-popup-btn btn-sync-all">' +
                    '<i class="fa fa-cloud-upload"></i>' +
                    '<span>' +
                      '<span class="sync-popup-btn-label">Sync All</span>' +
                      '<span class="sync-popup-btn-desc">Delta + Delete + Stock</span>' +
                    '</span>' +
                  '</button>' +
                  '<div class="sync-popup-divider"></div>' +
                  '<button class="sync-popup-btn btn-delta-sync">' +
                    '<i class="fa fa-exchange"></i>' +
                    '<span>' +
                      '<span class="sync-popup-btn-label">Delta Sync</span>' +
                      '<span class="sync-popup-btn-desc">Products, partners &amp; pricelists</span>' +
                    '</span>' +
                  '</button>' +
                  '<button class="sync-popup-btn btn-delete-sync">' +
                    '<i class="fa fa-trash"></i>' +
                    '<span>' +
                      '<span class="sync-popup-btn-label">Delete Sync</span>' +
                      '<span class="sync-popup-btn-desc">Remove deleted records</span>' +
                    '</span>' +
                  '</button>' +
                  '<button class="sync-popup-btn btn-stock-sync">' +
                    '<i class="fa fa-cubes"></i>' +
                    '<span>' +
                      '<span class="sync-popup-btn-label">Stock Sync</span>' +
                      '<span class="sync-popup-btn-desc">Update stock quantities</span>' +
                    '</span>' +
                  '</button>' +
                '</div>' +
                '<div class="sync-popup-status" style="display:none;"></div>' +
              '</div>' +
            '</div>'
        ).appendTo('body');

        // Bind popup events
        this._$popup.on('click', '.sync-popup-close', function() { self._close_popup(); });
        this._$popup.on('click', function(e) {
            if ($(e.target).hasClass('sync-popup-overlay')) { self._close_popup(); }
        });
        this._$popup.on('click', '.btn-sync-all',    function() { self._sync_all(); });
        this._$popup.on('click', '.btn-delta-sync',  function() { self._sync_delta(); });
        this._$popup.on('click', '.btn-delete-sync', function() { self._sync_delete(); });
        this._$popup.on('click', '.btn-stock-sync',  function() { self._sync_stock(); });

        return result;
    },

    destroy: function() {
        if (this._$popup) { this._$popup.remove(); this._$popup = null; }
        this._super.apply(this, arguments);
    },

    // ── icon state (mirrors SynchNotificationWidget.set_status) ──────────
    _set_icon: function(state) {
        // state: 'idle' | 'syncing' | 'done' | 'error'
        this.$('.js_idle, .js_syncing, .js_done, .js_error').addClass('oe_hidden');
        this.$('.js_' + state).removeClass('oe_hidden');
    },

    // ── popup helpers ─────────────────────────────────────────────────────
    _toggle_popup: function() {
        if (this._$popup && this._$popup.is(':visible')) {
            this._close_popup();
        } else {
            this._set_status('');
            if (this._$popup) { this._$popup.show(); }
        }
    },

    _close_popup: function() {
        if (this._$popup) { this._$popup.hide(); }
    },

    _set_status: function(msg, type) {
        if (!this._$popup) return;
        var $s = this._$popup.find('.sync-popup-status');
        if (!msg) { $s.hide().text('').removeClass('success error'); return; }
        $s.text(msg).removeClass('success error').addClass(type || '').show();
    },

    _set_buttons_disabled: function(disabled) {
        if (this._$popup) { this._$popup.find('.sync-popup-btn').prop('disabled', disabled); }
    },

    // ── sync runner ───────────────────────────────────────────────────────
    _run: function(label, promise_fn) {
        var self = this;
        if (this._busy) return;
        var svc = this.pos.sync_service || null;
        if (!svc) { return this._set_status('Sync service not available.', 'error'); }

        this._busy = true;
        this._set_buttons_disabled(true);
        this._set_icon('syncing');
        this._set_status(label + '…');

        promise_fn(svc).then(function() {
            self._set_status(label + ' complete ✓', 'success');
            self._set_icon('done');
            setTimeout(function() {
                self._close_popup();
                self._set_icon('idle');
            }, 1500);
        }).catch(function(err) {
            console.error('[ManualSync] ' + label + ' failed:', err);
            self._set_status(label + ' failed: ' + (err && err.message || err), 'error');
            self._set_icon('error');
        }).finally(function() {
            self._busy = false;
            self._set_buttons_disabled(false);
        });
    },

    // ── actions ───────────────────────────────────────────────────────────
    _sync_all: function() {
        this._run('Sync All', function(svc) {
            return Promise.all([
                svc.sync_delta_updates              ? svc.sync_delta_updates()              : Promise.resolve(),
                svc._remove_deleted_products        ? svc._remove_deleted_products()        : Promise.resolve(),
                svc._remove_deleted_partners        ? svc._remove_deleted_partners()        : Promise.resolve(),
                svc._remove_deleted_pricelist_items ? svc._remove_deleted_pricelist_items() : Promise.resolve(),
                svc.sync_stock_quantities           ? svc.sync_stock_quantities()           : Promise.resolve(),
            ]);
        });
    },

    _sync_delta: function() {
        this._run('Delta Sync', function(svc) {
            return svc.sync_delta_updates ? svc.sync_delta_updates() : Promise.resolve();
        });
    },

    _sync_delete: function() {
        this._run('Delete Sync', function(svc) {
            return Promise.all([
                svc._remove_deleted_products        ? svc._remove_deleted_products()        : Promise.resolve(),
                svc._remove_deleted_partners        ? svc._remove_deleted_partners()        : Promise.resolve(),
                svc._remove_deleted_pricelist_items ? svc._remove_deleted_pricelist_items() : Promise.resolve(),
            ]);
        });
    },

    _sync_stock: function() {
        this._run('Stock Sync', function(svc) {
            return svc.sync_stock_quantities ? svc.sync_stock_quantities() : Promise.resolve();
        });
    },
});

return ManualSyncControls;

});
