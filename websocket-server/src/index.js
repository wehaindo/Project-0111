'use strict';

const WebSocket  = require('ws');
const { v4: uuidv4 } = require('uuid');
const redis = require('./redis');

// Map: pos_id → WebSocket
const pos_clients = new Map();
// Map: client_id → WebSocket  (dashboard connections)
const dashboard_clients = new Map();

// ── helpers ───────────────────────────────────────────────────────────────────
function send(ws, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function broadcast_to_dashboards(data) {
    dashboard_clients.forEach((ws) => send(ws, data));
}

// ── POS message handler ───────────────────────────────────────────────────────
async function handle_pos_message(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const pos_id   = msg.pos_id;
    const pos_name = msg.pos_name || pos_id;

    if (!pos_id) return;

    // ── register ──
    if (msg.type === 'register') {
        pos_clients.set(pos_id, ws);
        console.log(`[POS] Registered: ${pos_id} (${pos_name})`);
        send(ws, { type: 'ack', message: 'Registered', pos_id });

        await redis.set_pos_status(pos_id, {
            pos_id,
            pos_name,
            session_id: msg.session_id,
            status:     'online',
            last_seen:  msg.timestamp || new Date().toISOString(),
            sync_status: 'idle',
            sync_progress: 0,
        });

        broadcast_to_dashboards({ type: 'pos_update', ...await redis.get_pos_status(pos_id) });
        return;
    }

    // ── heartbeat ──
    if (msg.type === 'heartbeat') {
        if (!pos_clients.has(pos_id)) pos_clients.set(pos_id, ws);

        const prev = await redis.get_pos_status(pos_id) || {};
        const updated = {
            ...prev,
            pos_id,
            pos_name:  pos_name,
            session_id: msg.session_id,
            status:    'online',
            last_seen: msg.timestamp || new Date().toISOString(),
        };
        await redis.set_pos_status(pos_id, updated);
        broadcast_to_dashboards({ type: 'pos_update', ...updated });
        return;
    }

    // ── sync_status ──
    if (msg.type === 'sync_status') {
        const prev = await redis.get_pos_status(pos_id) || { pos_id, pos_name };
        const updated = {
            ...prev,
            sync_status:   msg.status,
            sync_progress: msg.progress || 0,
            sync_message:  msg.message || '',
            last_sync:     msg.status === 'complete' ? msg.timestamp : (prev.last_sync || null),
        };
        await redis.set_pos_status(pos_id, updated);
        await redis.set_pos_sync(pos_id, { pos_id, ...msg });
        broadcast_to_dashboards({ type: 'pos_update', ...updated });

        console.log(`[POS] ${pos_id} sync_status: ${msg.status} (${msg.progress || 0}%)`);
        return;
    }

    // ── pong ──
    if (msg.type === 'pong') {
        // heartbeat reply — no further action needed
        return;
    }

    console.warn('[POS] Unknown message type:', msg.type);
}

// ── Dashboard message handler ─────────────────────────────────────────────────
async function handle_dashboard_message(ws, client_id, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ── get_all_pos — initial load ──
    if (msg.type === 'get_all_pos') {
        const all = await redis.get_all_pos();
        // Mark those whose WS is disconnected as offline
        const enriched = all.map(p => ({
            ...p,
            status: pos_clients.has(p.pos_id) && pos_clients.get(p.pos_id).readyState === WebSocket.OPEN
                    ? 'online' : 'offline',
        }));
        send(ws, { type: 'all_pos', terminals: enriched });
        return;
    }

    // ── trigger sync ──
    if (msg.type === 'trigger_sync') {
        const { pos_id, sync_type } = msg;
        console.log(`[Dashboard] Trigger sync → ${pos_id}  type=${sync_type}`);

        const cmd = { type: 'command', action: 'sync', sync_type: sync_type || 'all', timestamp: new Date().toISOString() };

        if (pos_id === 'ALL') {
            pos_clients.forEach((pos_ws) => send(pos_ws, cmd));
        } else {
            const pos_ws = pos_clients.get(pos_id);
            if (pos_ws && pos_ws.readyState === WebSocket.OPEN) {
                send(pos_ws, cmd);
                send(ws, { type: 'ack', message: `Sync command sent to ${pos_id}` });
            } else {
                send(ws, { type: 'error', message: `POS ${pos_id} is offline` });
            }
        }

        // Publish to Redis (for other server instances)
        await redis.publish(redis.CHANNELS.CMD_TRIGGER, { pos_id, sync_type, from: client_id });
        return;
    }

    // ── ping individual POS ──
    if (msg.type === 'ping_pos') {
        const pos_ws = pos_clients.get(msg.pos_id);
        if (pos_ws && pos_ws.readyState === WebSocket.OPEN) {
            send(pos_ws, { type: 'command', action: 'ping', timestamp: new Date().toISOString() });
            send(ws, { type: 'ack', message: `Ping sent to ${msg.pos_id}` });
        } else {
            send(ws, { type: 'error', message: `POS ${msg.pos_id} is offline` });
        }
        return;
    }

    // ── reload POS ──
    if (msg.type === 'reload_pos') {
        const pos_ws = pos_clients.get(msg.pos_id);
        if (pos_ws && pos_ws.readyState === WebSocket.OPEN) {
            send(pos_ws, { type: 'command', action: 'reload', timestamp: new Date().toISOString() });
            send(ws, { type: 'ack', message: `Reload sent to ${msg.pos_id}` });
        } else {
            send(ws, { type: 'error', message: `POS ${msg.pos_id} is offline` });
        }
        return;
    }

    console.warn('[Dashboard] Unknown message type:', msg.type);
}

// ── WebSocket server setup ────────────────────────────────────────────────────
async function start_server(port) {
    await redis.connect();

    const wss = new WebSocket.Server({ port });
    console.log(`[WS Server] Listening on ws://0.0.0.0:${port}`);

    // Subscribe to Redis CMD channel (for multi-instance support)
    await redis.subscriber.subscribe(redis.CHANNELS.CMD_TRIGGER, (message) => {
        const msg = JSON.parse(message);
        console.log('[Redis] CMD from another instance:', msg);
    });

    wss.on('connection', (ws, req) => {
        const client_id = uuidv4();
        const ip        = req.socket.remoteAddress;
        const path      = req.url || '/';
        console.log(`[WS] New connection  id=${client_id}  ip=${ip}  path=${path}`);

        // Classify by path: /pos = POS terminal, /dashboard = command center
        const is_pos       = path.startsWith('/pos');
        const is_dashboard = path.startsWith('/dashboard');

        if (is_dashboard) {
            dashboard_clients.set(client_id, ws);
            send(ws, { type: 'connected', role: 'dashboard', client_id });
        } else {
            // Treat unknown paths as POS (for convenience)
            send(ws, { type: 'connected', role: 'pos', client_id });
        }

        ws.on('message', (raw) => {
            if (is_dashboard) {
                handle_dashboard_message(ws, client_id, raw).catch(console.error);
            } else {
                handle_pos_message(ws, raw).catch(console.error);
            }
        });

        ws.on('close', () => {
            console.log(`[WS] Disconnected  id=${client_id}`);
            if (is_dashboard) {
                dashboard_clients.delete(client_id);
            } else {
                // Mark POS as offline in Redis + broadcast
                pos_clients.forEach((v, k) => {
                    if (v === ws) {
                        pos_clients.delete(k);
                        redis.get_pos_status(k).then(async (status) => {
                            if (status) {
                                status.status = 'offline';
                                await redis.set_pos_status(k, status);
                                broadcast_to_dashboards({ type: 'pos_update', ...status });
                            }
                        }).catch(console.error);
                    }
                });
            }
        });

        ws.on('error', (err) => {
            console.error(`[WS] Error  id=${client_id}:`, err.message);
        });
    });

    // Periodic offline check: every 60s mark stale heartbeats as offline
    setInterval(async () => {
        const all = await redis.get_all_pos();
        const now = Date.now();
        for (const p of all) {
            const last = p.last_seen ? new Date(p.last_seen).getTime() : 0;
            const age_s = (now - last) / 1000;
            const pos_ws = pos_clients.get(p.pos_id);
            const ws_alive = pos_ws && pos_ws.readyState === WebSocket.OPEN;

            if (!ws_alive && age_s > 90 && p.status !== 'offline') {
                p.status = 'offline';
                await redis.set_pos_status(p.pos_id, p);
                broadcast_to_dashboards({ type: 'pos_update', ...p });
                console.log(`[Monitor] ${p.pos_id} marked offline (last seen ${Math.round(age_s)}s ago)`);
            }
        }
    }, 60_000);

    return wss;
}

module.exports = { start_server };
