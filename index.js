// ============================================================
// index.js
// BL@CKN1TE-NXS V16 — Entry Point
// Simply boots server.js (which contains the full bot logic)
// ============================================================

console.log('╔═══════════════════════════════════════════╗');
console.log('║  ░▒▓█  BL@CKN1TE-NXS  •  V16  █▓▒░        ║');
console.log('║  ⚡ Booting via index.js → server.js       ║');
console.log('╚═══════════════════════════════════════════╝');

// ============================================================
// 📁 SESSION PRE-FLIGHT CHECK (informational only — never blocks)
// ============================================================
try {
    const fs = require('fs');
    const path = require('path');
    const AUTH_DIR = path.join(__dirname, 'auth_info');
    const SESSION_NAME = process.env.BOT_NAME || 'BLACKNITE_NXS';
    const SESSION_PATH = path.join(AUTH_DIR, SESSION_NAME);
    const CREDS_PATH = path.join(SESSION_PATH, 'creds.json');

    // Ensure folders exist (server.js will also ensure, but this is cheap)
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

    if (fs.existsSync(CREDS_PATH)) {
        try {
            const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'));
            if (creds && creds.registered) {
                console.log('✅ [SESSION] creds.json found & registered → auto-link on boot');
                console.log(`📱 [SESSION] Number: ${creds.me?.id?.split(':')[0] || 'unknown'}`);
                console.log(`📁 [SESSION] Path: ${SESSION_PATH}`);
            } else {
                console.log('⚠️  [SESSION] creds.json exists but NOT registered → pairing needed');
            }
        } catch (e) {
            console.log(`⚠️  [SESSION] creds.json exists but unreadable: ${e.message}`);
        }
    } else {
        console.log('ℹ️  [SESSION] No creds.json found for this host.');
        console.log(`   → Set BOT_NUMBER in env vars to auto-pair on boot (console code)`);
        console.log(`   → OR import a session zip via the dashboard (Export from Katabump → Import here)`);
        console.log(`   → OR pair via the dashboard login page as usual`);
    }
} catch (e) {
    console.log(`⚠️  [SESSION] Pre-flight check skipped: ${e.message}`);
}

// ============================================================
// Load the real server
// ============================================================
require('./server.js');

// Keep process alive (server.js already listens, this is belt-and-suspenders)
process.stdin.resume();

// ♾️ Never let the process die from stray signals
process.on('SIGINT', () => console.log('♾️ [index.js] SIGINT ignored — staying online'));
process.on('SIGTERM', () => console.log('♾️ [index.js] SIGTERM ignored — staying online'));
