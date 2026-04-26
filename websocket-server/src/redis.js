const { createClient } = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Publisher client (for sending commands)
const publisher = createClient({ url: REDIS_URL });
// Subscriber client (for receiving events)
const subscriber = createClient({ url: REDIS_URL });
// Data client (for key/value storage)
const dataClient = createClient({ url: REDIS_URL });

async function connect() {
    await Promise.all([
        publisher.connect(),
        subscriber.connect(),
        dataClient.connect(),
    ]);
    console.log('[Redis] Connected ✓');
}

// ── key helpers ──────────────────────────────────────────────────────────────
const KEYS = {
    pos_status:    (id) => `pos:status:${id}`,
    pos_sync:      (id) => `pos:sync:${id}`,
    pos_list:      () =>   'pos:list',               // Set of all known pos_ids
};

// ── channels ─────────────────────────────────────────────────────────────────
const CHANNELS = {
    HEARTBEAT:    'pos.heartbeat',
    SYNC_STATUS:  'pos.sync.status',
    CMD_TRIGGER:  'cmd.sync.trigger',
    DASHBOARD_OUT:'dashboard.update',     // server → dashboard
};

// ── write helpers ─────────────────────────────────────────────────────────────
async function set_pos_status(pos_id, payload) {
    const key = KEYS.pos_status(pos_id);
    await dataClient.set(key, JSON.stringify(payload), { EX: 300 }); // 5-min TTL
    await dataClient.sAdd(KEYS.pos_list(), pos_id);
}

async function set_pos_sync(pos_id, payload) {
    const key = KEYS.pos_sync(pos_id);
    await dataClient.set(key, JSON.stringify(payload), { EX: 600 });
}

async function get_pos_status(pos_id) {
    const val = await dataClient.get(KEYS.pos_status(pos_id));
    return val ? JSON.parse(val) : null;
}

async function get_all_pos() {
    const ids = await dataClient.sMembers(KEYS.pos_list());
    const results = [];
    for (const id of ids) {
        const status = await get_pos_status(id);
        if (status) {
            results.push(status);
        } else {
            // TTL expired = offline — remove from set
            await dataClient.sRem(KEYS.pos_list(), id);
        }
    }
    return results;
}

async function publish(channel, message) {
    await publisher.publish(channel, JSON.stringify(message));
}

module.exports = {
    publisher,
    subscriber,
    dataClient,
    CHANNELS,
    KEYS,
    connect,
    set_pos_status,
    set_pos_sync,
    get_pos_status,
    get_all_pos,
    publish,
};
