odoo.define('weha_pos_self_sync.pos_ws_client', function(require) {
    'use strict';

    var models = require('point_of_sale.models');

    /**
     * POS WebSocket Monitor Client
     * ─────────────────────────────
     * Connects to the external WebSocket server (Redis-backed) when
     * `enable_ws_monitor` is true on the POS config.
     *
     * Messages sent TO server:
     *   { type: 'register',   pos_id, pos_name, session_id }
     *   { type: 'heartbeat',  pos_id, pos_name, session_id, timestamp, status }
     *   { type: 'sync_status',pos_id, status, progress, message, timestamp }
     *
     * Commands received FROM server:
     *   { type: 'command', action: 'sync',     sync_type: 'all|products|stock|pricelist' }
     *   { type: 'command', action: 'ping' }
     *   { type: 'command', action: 'reload' }
     */

    var PosWsClient = {

        // ── state ────────────────────────────────────────────────────────
        ws:                 null,
        pos:                null,
        heartbeat_timer:    null,
        reconnect_timer:    null,
        reconnect_delay:    3000,   // ms, doubles on each failure up to 60 s
        reconnect_attempts: 0,
        max_reconnect_delay: 60000,
        connected:          false,

        // ── init ─────────────────────────────────────────────────────────
        init: function(pos_model) {
            var self = this;
            self.pos = pos_model;

            var cfg = pos_model.config;

            console.group('[WS Monitor] init()');
            console.log('enable_ws_monitor :', cfg ? cfg.enable_ws_monitor : 'no config');
            console.log('ws_server_url     :', cfg ? cfg.ws_server_url     : '—');
            console.log('ws_pos_id         :', cfg ? cfg.ws_pos_id         : '—');
            console.log('ws_heartbeat_inter:', cfg ? cfg.ws_heartbeat_interval : '—');
            console.groupEnd();

            if (!cfg || !cfg.enable_ws_monitor) {
                console.warn('[WS Monitor] ⚠ Disabled — enable_ws_monitor is', cfg ? cfg.enable_ws_monitor : 'undefined');
                return;
            }
            if (!cfg.ws_server_url) {
                console.warn('[WS Monitor] ⚠ ws_server_url not configured — skipping.');
                return;
            }

            self.pos_id   = cfg.ws_pos_id || cfg.name || ('POS-' + cfg.id);
            self.pos_name = cfg.name || self.pos_id;

            // Always connect to the /pos path on the WS server
            var base_url = cfg.ws_server_url.replace(/\/+$/, '');
            self.ws_url  = base_url.endsWith('/pos') ? base_url : base_url + '/pos';
            self.heartbeat_interval = (cfg.ws_heartbeat_interval || 30) * 1000;

            console.log('[WS Monitor] ✔ Initialised  pos_id=' + self.pos_id + '  url=' + self.ws_url);
            self.connect();
        },

        // ── connection ───────────────────────────────────────────────────
        connect: function() {
            var self = this;
            try {
                console.log('[WS Monitor] 🔌 Connecting to ' + self.ws_url + ' …');
                self.ws = new WebSocket(self.ws_url);

                self.ws.onopen    = function() { self._on_open(); };
                self.ws.onmessage = function(e) { self._on_message(e); };
                self.ws.onclose   = function(e) { self._on_close(e); };
                self.ws.onerror   = function(e) { self._on_error(e); };
            } catch(e) {
                console.error('[WS Monitor] Could not create WebSocket:', e);
                self._schedule_reconnect();
            }
        },

        disconnect: function() {
            var self = this;
            self._clear_timers();
            if (self.ws) {
                self.ws.onclose = null;   // prevent auto-reconnect on manual close
                self.ws.close();
                self.ws = null;
            }
            self.connected = false;
            console.log('[WS Monitor] Disconnected.');
        },

        // ── event handlers ───────────────────────────────────────────────
        _on_open: function() {
            var self = this;
            self.connected = true;
            self.reconnect_attempts = 0;
            self.reconnect_delay    = 3000;
            console.log('%c[WS Monitor] ✅ Connected → ' + self.ws_url, 'color:#22c55e;font-weight:bold');

            // Register terminal with server
            var reg_msg = {
                type:       'register',
                pos_id:     self.pos_id,
                pos_name:   self.pos_name,
                session_id: self.pos.pos_session && self.pos.pos_session.id,
                timestamp:  new Date().toISOString(),
            };
            console.log('[WS Monitor] → Sending register:', JSON.stringify(reg_msg));
            self._send(reg_msg);

            // Start heartbeat loop
            self._start_heartbeat();
        },

        _on_message: function(event) {
            var self = this;
            var msg;
            try { msg = JSON.parse(event.data); }
            catch(e) { console.warn('[WS Monitor] Bad JSON:', event.data); return; }

            console.log('[WS Monitor] ← Received:', msg);

            if (msg.type === 'command') {
                self._handle_command(msg);
            } else if (msg.type === 'pong') {
                // heartbeat acknowledged, nothing to do
            } else if (msg.type === 'ack') {
                // registration acknowledged
                console.log('[WS Monitor] Server acknowledged registration.');
            }
        },

        _on_close: function(event) {
            var self = this;
            self.connected = false;
            self._clear_timers();
            console.warn('%c[WS Monitor] 🔴 Disconnected  code=' + event.code + '  reason=' + (event.reason || '—'), 'color:#f97316');
            self._schedule_reconnect();
        },

        _on_error: function(event) {
            console.error('%c[WS Monitor] ❌ WebSocket error — check that ' + self.ws_url + ' is reachable from the browser', 'color:#ef4444', event);
        },

        // ── commands from server ──────────────────────────────────────────
        _handle_command: function(msg) {
            var self = this;
            var action = msg.action;
            console.log('[WS Monitor] 🎯 Command received:', action, msg);

            if (action === 'sync') {
                self._trigger_sync(msg.sync_type || 'all');
            } else if (action === 'ping') {
                self._send({ type: 'pong', pos_id: self.pos_id, timestamp: new Date().toISOString() });
            } else if (action === 'reload') {
                console.log('[WS Monitor] Reload command — reloading page …');
                setTimeout(function() { window.location.reload(); }, 500);
            } else if (action === 'get_status') {
                self._send_status('idle');
            } else {
                console.warn('[WS Monitor] Unknown command:', action);
            }
        },

        _trigger_sync: function(sync_type) {
            var self = this;
            console.log('[WS Monitor] ▶ Triggering sync:', sync_type);
            self._send_status('syncing', 0, 'Remote sync triggered: ' + sync_type);

            var sync_service = self.pos.sync_service || null;

            if (!sync_service) {
                // Fallback: call manual sync button logic if available
                if (self.pos.do_manual_sync) {
                    self.pos.do_manual_sync(sync_type).then(function() {
                        self._send_status('complete', 100, 'Sync finished: ' + sync_type);
                    }).catch(function(err) {
                        self._send_status('error', 0, String(err));
                    });
                } else {
                    console.warn('[WS Monitor] No sync service found.');
                    self._send_status('error', 0, 'Sync service not available');
                }
                return;
            }

            // Use existing sync service methods
            var sync_promise;
            switch(sync_type) {
                case 'products':
                    // sync_delta_updates covers products + pricelist + partners
                    sync_promise = sync_service.sync_delta_updates
                        ? sync_service.sync_delta_updates()
                        : null;
                    break;
                case 'stock':
                    sync_promise = sync_service.sync_stock_quantities
                        ? sync_service.sync_stock_quantities()
                        : null;
                    break;
                case 'pricelist':
                    sync_promise = sync_service.sync_delta_updates
                        ? sync_service.sync_delta_updates()
                        : null;
                    break;
                default: // 'all'
                    // Full sync: delta updates (products/pricelist/partners) + stock
                    sync_promise = Promise.all([
                        sync_service.sync_delta_updates
                            ? sync_service.sync_delta_updates()
                            : Promise.resolve(),
                        sync_service.sync_stock_quantities
                            ? sync_service.sync_stock_quantities()
                            : Promise.resolve(),
                    ]);
                    break;
            }

            if (!sync_promise) {
                console.warn('[WS Monitor] No method for sync_type:', sync_type);
                self._send_status('error', 0, 'No handler for sync_type: ' + sync_type);
                return;
            }

            sync_promise.then(function() {
                self._send_status('complete', 100, 'Sync finished: ' + sync_type);
            }).catch(function(err) {
                self._send_status('error', 0, String(err));
            });
        },

        // ── outgoing messages ────────────────────────────────────────────
        _send: function(data) {
            var self = this;
            if (self.ws && self.ws.readyState === WebSocket.OPEN) {
                self.ws.send(JSON.stringify(data));
            }
        },

        send_heartbeat: function() {
            var self = this;
            if (!self.connected) return;
            self._send({
                type:       'heartbeat',
                pos_id:     self.pos_id,
                pos_name:   self.pos_name,
                session_id: self.pos.pos_session && self.pos.pos_session.id,
                timestamp:  new Date().toISOString(),
                status:     'online',
            });
        },

        _send_status: function(status, progress, message) {
            var self = this;
            self._send({
                type:      'sync_status',
                pos_id:    self.pos_id,
                status:    status,
                progress:  progress || 0,
                message:   message || '',
                timestamp: new Date().toISOString(),
            });
        },

        // public helper — call from sync service to report progress
        report_sync_progress: function(progress, message) {
            this._send_status('syncing', progress, message);
        },
        report_sync_complete: function(message) {
            this._send_status('complete', 100, message || 'Sync complete');
        },
        report_sync_error: function(message) {
            this._send_status('error', 0, message || 'Sync error');
        },

        // ── helpers ──────────────────────────────────────────────────────
        _start_heartbeat: function() {
            var self = this;
            self._clear_timers();
            self.send_heartbeat();   // immediate first beat
            self.heartbeat_timer = setInterval(function() {
                self.send_heartbeat();
            }, self.heartbeat_interval);
        },

        _schedule_reconnect: function() {
            var self = this;
            self._clear_timers();
            self.reconnect_attempts++;
            var delay = Math.min(self.reconnect_delay * Math.pow(1.5, self.reconnect_attempts - 1),
                                 self.max_reconnect_delay);
            console.log('[WS Monitor] 🔄 Reconnect in ' + Math.round(delay / 1000) + 's (attempt ' + self.reconnect_attempts + ')  url=' + self.ws_url);
            self.reconnect_timer = setTimeout(function() { self.connect(); }, delay);
        },

        _clear_timers: function() {
            if (this.heartbeat_timer)  { clearInterval(this.heartbeat_timer);  this.heartbeat_timer  = null; }
            if (this.reconnect_timer)  { clearTimeout(this.reconnect_timer);   this.reconnect_timer  = null; }
        },
    };

    return PosWsClient;
});
