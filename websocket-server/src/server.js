// Entry point — only runs when executed directly
const { start_server } = require('./index');
const PORT = parseInt(process.env.PORT || '8080', 10);
start_server(PORT).then(() => {
    console.log(`[WS Server] Running on port ${PORT}`);
}).catch((err) => {
    console.error('[WS Server] Fatal error:', err);
    process.exit(1);
});
