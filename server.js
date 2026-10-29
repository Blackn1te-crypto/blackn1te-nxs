require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');

// ============================================================
// NODE ENGINE CHECK (Prevents Node 24 crashes)
// ============================================================
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.replace('v', '').split('.')[0]);
if (majorVersion > 20) {
    console.warn(`⚠️ WARNING: You are running Node.js ${nodeVersion}. This bot is designed for Node 20.x or below.`);
    console.warn(`⚠️ Please set your Render environment to use Node 20 in package.json.`);
}

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    downloadContentFromMessage,
    jidNormalizedUser,
    Browsers,
    delay
} = require('@whiskeysockets/baileys');
const P = require('pino');
const { OpenAI } = require('openai');

const settings = require('./settings');

// ============================================================
// CONFIG
// ============================================================
const PREFIXES = ['.', '/', '>'];
const OWNER_SECRET = process.env.OWNER_SECRET || 'blacknite_owner_2025';
const CMD_DIR = path.join(__dirname, 'commands');
const AI_SECRET_KEY = process.env.AI_SECRET_KEY || 'blacknite_ai_2025'; // AI Unlock Key

// ============================================================
// ♾️ INFINITE CONNECTION FLAGS
// ============================================================
const INFINITE_MODE = true;
const SILENT_RECONNECT = true;
const HEARTBEAT_INTERVAL_MS = 45 * 1000;
const AUTO_RELOAD_INTERVAL_MS = 5 * 60 * 1000;
const SESSION_WATCHDOG_MS = 60 * 1000;
const KEEPALIVE_PRESENCE_MS = 60 * 1000;

// ============================================================
// SAFE COMMAND LOADER
// ============================================================
function safeRequire(filePath, name) {
    try {
        if (fs.existsSync(filePath) || fs.existsSync(filePath + '.js')) {
            console.log(`✅ [CMD] Loaded: ${name}`);
            return require(filePath);
        }
        console.log(`⚠️  [CMD] Skipped (missing): ${name}`);
        return async function stub(sock, from, msg) {
            try { await sock.sendMessage(from, { text: `⚠️ *Command ${PREFIXES[0]}${name} unavailable.*` }, { quoted: msg }); } catch (e) {}
        };
    } catch (e) {
        console.error(`❌ [CMD] Failed: ${name}: ${e.message}`);
        return async function stub(sock, from, msg) {
            try { await sock.sendMessage(from, { text: `⚠️ *Command ${PREFIXES[0]}${name} unavailable.*` }, { quoted: msg }); } catch (e) {}
        };
    }
}

const commands = {
    ping: safeRequire(path.join(CMD_DIR, 'ping'), 'ping'),
    owner: safeRequire(path.join(CMD_DIR, 'owner'), 'owner'),
    song: safeRequire(path.join(CMD_DIR, 'song'), 'song'),
    video: safeRequire(path.join(CMD_DIR, 'video'), 'video'),
    tiktok: safeRequire(path.join(CMD_DIR, 'tiktok'), 'tiktok'),
    insta: safeRequire(path.join(CMD_DIR, 'insta'), 'insta'),
    facebook: safeRequire(path.join(CMD_DIR, 'facebook'), 'facebook'),
    gdrive: safeRequire(path.join(CMD_DIR, 'gdrive'), 'gdrive'),
    mf: safeRequire(path.join(CMD_DIR, 'mf'), 'mf'),
    apk: safeRequire(path.join(CMD_DIR, 'apk'), 'apk'),
    dp: safeRequire(path.join(CMD_DIR, 'dp'), 'dp'),
    vv: safeRequire(path.join(CMD_DIR, 'vv'), 'vv'),
    ai: safeRequire(path.join(CMD_DIR, 'ai'), 'ai'),
    image: safeRequire(path.join(CMD_DIR, 'image'), 'image'),
    tts: safeRequire(path.join(CMD_DIR, 'tts'), 'tts'),
    translate: safeRequire(path.join(CMD_DIR, 'translate'), 'translate'),
    character: safeRequire(path.join(CMD_DIR, 'character'), 'character'),
    emojimix: safeRequire(path.join(CMD_DIR, 'emojimix'), 'emojimix'),
    joke: safeRequire(path.join(CMD_DIR, 'joke'), 'joke'),
    meme: safeRequire(path.join(CMD_DIR, 'meme'), 'meme'),
    weather: safeRequire(path.join(CMD_DIR, 'weather'), 'weather'),
    qr: safeRequire(path.join(CMD_DIR, 'qr'), 'qr'),
    shorten: safeRequire(path.join(CMD_DIR, 'shorten'), 'shorten'),
    calc: safeRequire(path.join(CMD_DIR, 'calc'), 'calc'),
    antilink: safeRequire(path.join(CMD_DIR, 'antilink'), 'antilink'),
    anticall: safeRequire(path.join(CMD_DIR, 'anticall'), 'anticall'),
    antidelete: safeRequire(path.join(CMD_DIR, 'antidelete'), 'antidelete'),
    antistatus: safeRequire(path.join(CMD_DIR, 'antistatus'), 'antistatus'),
    autoreacts: safeRequire(path.join(CMD_DIR, 'autoreacts'), 'autoreacts'),
    autostatus: safeRequire(path.join(CMD_DIR, 'status'), 'status'),
    kick: safeRequire(path.join(CMD_DIR, 'kick'), 'kick'),
    kickoffline: safeRequire(path.join(CMD_DIR, 'kickoffline'), 'kickoffline'),
    hidetag: safeRequire(path.join(CMD_DIR, 'hidetag'), 'hidetag'),
    tagall: safeRequire(path.join(CMD_DIR, 'tagall'), 'tagall'),
    setname: safeRequire(path.join(CMD_DIR, 'setname'), 'setname'),
    groupinfo: safeRequire(path.join(CMD_DIR, 'groupinfo'), 'groupinfo'),
    accept: safeRequire(path.join(CMD_DIR, 'accept'), 'accept'),
    hack: safeRequire(path.join(CMD_DIR, 'hack'), 'hack'),
    private: safeRequire(path.join(CMD_DIR, 'private'), 'private'),
    public: safeRequire(path.join(CMD_DIR, 'public'), 'public'),
    autoread: safeRequire(path.join(CMD_DIR, 'autoread'), 'autoread'),
    read: safeRequire(path.join(CMD_DIR, 'read'), 'read'),
    online: safeRequire(path.join(CMD_DIR, 'online'), 'online'),
    incisiveTrihatTools: safeRequire(path.join(CMD_DIR, 'incisive-trihat-tools'), 'incisive-trihat-tools'),
    blackn1teWebsites: safeRequire(path.join(CMD_DIR, 'blackn1te-websites'), 'blackn1te-websites'),
    settings: safeRequire(path.join(CMD_DIR, 'settings'), 'settings')
};

// ============================================================
// HOOK LOADERS
// ============================================================
let handleAutoread = async () => {};
let autoreadCommand = null;
try {
    if (fs.existsSync(path.join(CMD_DIR, 'autoread.js'))) {
        const ar = require(path.join(CMD_DIR, 'autoread'));
        if (ar.handleAutoread) handleAutoread = ar.handleAutoread;
        if (ar.autoreadCommand) autoreadCommand = ar.autoreadCommand;
    }
} catch (e) { console.error('autoread load error:', e.message); }

let handleStatusUpdate = async () => {};
try { if (fs.existsSync(path.join(CMD_DIR, 'autostatus.js'))) { const su = require(path.join(CMD_DIR, 'autostatus')); if (su.handleStatusUpdate) handleStatusUpdate = su.handleStatusUpdate; } } catch (e) {}

let storeMessage = async () => {};
let handleMessageRevocation = async () => {};
try { if (fs.existsSync(path.join(CMD_DIR, 'antidelete.js'))) { const ad = require(path.join(CMD_DIR, 'antidelete')); if (ad.storeMessage) storeMessage = ad.storeMessage; if (ad.handleMessageRevocation) handleMessageRevocation = ad.handleMessageRevocation; } } catch (e) {}

// ============================================================
// APP + SOCKET
// ============================================================
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling'],
    pingInterval: 20000,
    pingTimeout: 15000,
    connectTimeout: 8000
});

let openai = null;
if (process.env.OPENAI_API_KEY) {
    try { openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.AI_BASE_URL || "https://api.openai.com/v1" }); } catch (e) {}
}

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// ============================================================
// ROUTES
// ============================================================
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'login.html')); });
app.get('/login', (req, res) => { res.sendFile(path.join(__dirname, 'login.html')); });
app.get('/login.html', (req, res) => { res.sendFile(path.join(__dirname, 'login.html')); });
app.get('/welcome', (req, res) => { res.redirect('/login.html'); });
app.get('/welcome.html', (req, res) => { res.redirect('/login.html'); });
app.get('/dashboard', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/index.html', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

// ============================================================
// HEALTH + BADGE
// ============================================================
app.get('/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
        status: 'ok',
        bot: settings.botName,
        version: 'V16',
        sessions: Object.keys(sessions).length,
        active: Object.values(sessions).filter(s => s.isConnected).length,
        uptime: process.uptime(),
        timestamp: Date.now(),
        mode: INFINITE_MODE ? 'INFINITE' : 'STANDARD'
    });
});

app.get('/api/badge', (req, res) => {
    const activeSessions = Object.values(sessions).filter(s => s.isConnected).length;
    const totalSessions = Object.keys(sessions).length;
    const uptimeSec = Math.floor(process.uptime());
    res.set('Cache-Control', 'public, max-age=30');
    res.json({
        status: activeSessions > 0 ? 'online' : 'idle',
        schemaVersion: 1,
        label: 'bot',
        message: activeSessions > 0 ? 'ONLINE' : 'IDLE',
        color: activeSessions > 0 ? '00ff80' : 'ffbe3c',
        isError: false,
        activeBots: activeSessions,
        sessions: totalSessions,
        uptime: uptimeSec,
        uptimeHuman: formatUptime(uptimeSec)
    });
});

function formatUptime(sec) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

// ============================================================
// STORAGE
// ============================================================
const AUTH_DIR = './auth_info';
const DATA_FILE = './data/bot_data.json';
const BLACKLIST_FILE = './data/blacklist.json';
fs.ensureDirSync(AUTH_DIR);
fs.ensureDirSync('./data');

let botData = {
    antilinkGroups: {}, totalBots: 0, registeredBots: [],
    statusSettings: {}, antiDelete: {}, userNames: {},
    antiCall: {}, antiStatusGroups: {}, readSettings: {}, customPrefix: {}
};
if (fs.existsSync(DATA_FILE)) { try { botData = { ...botData, ...fs.readJsonSync(DATA_FILE) }; } catch (e) {} }
function saveBotData() { try { fs.writeJsonSync(DATA_FILE, botData); } catch (e) {} }

let blacklist = { numbers: [], botNames: [] };
if (fs.existsSync(BLACKLIST_FILE)) { try { blacklist = { ...blacklist, ...fs.readJsonSync(BLACKLIST_FILE) }; } catch (e) {} }
function saveBlacklist() { try { fs.writeJsonSync(BLACKLIST_FILE, blacklist, { spaces: 2 }); } catch (e) {} }
function isNumberBlacklisted(num) {
    if (!num) return false;
    const clean = String(num).replace(/\D/g, '');
    return blacklist.numbers.some(n => String(n).replace(/\D/g, '') === clean);
}
function isBotNameBlacklisted(name) {
    if (!name) return false;
    return blacklist.botNames.some(n => n.toLowerCase() === String(name).toLowerCase());
}

// ============================================================
// RUNTIME
// ============================================================
const sessions = {};
const userSockets = {};
const messageLogs = {};
const aiMemory = {}; 
const autoReplyState = {}; // Anti-spam tracking

// ============================================================
// 🅱️ BOLD UNICODE HELPER
// ============================================================
const toBold = (text) => {
    const boldChars = {
        'a':'𝗮','b':'𝗯','c':'𝗰','d':'𝗱','e':'𝗲','f':'𝗳','g':'𝗴','h':'𝗵','i':'𝗶','j':'𝗷','k':'𝗸','l':'𝗹','m':'𝗺','n':'𝗻','o':'𝗼','p':'𝗽','q':'𝗾','r':'𝗿','s':'𝘀','t':'𝘁','u':'𝘂','v':'𝘃','w':'𝘄','x':'𝘅','y':'𝘆','z':'𝘇',
        'A':'𝗔','B':'𝗕','C':'𝗖','D':'𝗗','E':'𝗘','F':'𝗙','G':'𝗚','H':'𝗛','I':'𝗜','J':'𝗝','K':'𝗞','L':'𝗟','M':'𝗠','N':'𝗡','O':'𝗢','P':'𝗣','Q':'𝗤','R':'𝗥','S':'𝗦','T':'𝗧','U':'𝗨','V':'𝗩','W':'𝗪','X':'𝗫','Y':'𝗬','Z':'𝗭',
        '0':'𝟬','1':'𝟭','2':'𝟮','3':'𝟯','4':'𝟰','5':'𝟱','6':'𝟲','7':'𝟳','8':'𝟴','9':'𝟵'
    };
    return text.split('').map(c => boldChars[c] || c).join('');
};

// ============================================================
// 🧠 INTELLIGENT OFFLINE AUTO-REPLY ENGINE
// ============================================================
const autoReplyDB = {
    en: {
        greetings: ["Heyyy 😎👋 The owner is away right now, but your message has landed!", "Hie there 😂🔥 I'm keeping the inbox warm while the owner is away.", "Hello hello 👋😊 Your message has arrived safely!", "Yooo 😎 What's good? The owner is currently unavailable.", "Hey friend ❤️ I'm here to let you know your message was received.", "Hello 👋 The owner is away for a bit. Please leave your message here.", "Ayy 😁👋 The owner isn't available at the moment, but your message is noted."],
        howAreYou: ["I'm doing fine 😎🔥 Thanks for asking! The owner is away at the moment.", "All good on this side 😂❤️ The owner is currently unavailable.", "I'm surviving in these digital streets 🤣💻 Thanks for checking in!", "Doing well, thanks 😊 How about you? The owner will respond when available.", "No complaints here 😂🤝 Your message has been received.", "System operational 😎💻 Owner temporarily unavailable!"],
        jokes: ["🤣🤣🤣 Hold on! The owner is away, and now you're making the inbox laugh too!", "😂😂 If this message had a comedy award, it would win!", "BROOOO 💀😭 Why is this message funnier than my entire codebase?", "🤣 My digital brain needs a moment to recover from that one!", "LMAOOOO 😭🤣 Even the notifications are looking suspicious now!", "💀😂 You came to the inbox with absolutely no mercy!", "😂 I would laugh harder, but I'm supposed to be an automated assistant!"],
        sad: ["I'm sorry you're going through this 😔❤️. Your feelings matter.", "Sending you some kindness today 🫂❤️. You don't have to explain everything at once.", "That sounds difficult 😢. If you'd like to talk, I'm here to listen.", "I'm sorry today has been heavy. Take things one step at a time ❤️.", "You deserve patience and understanding, especially on difficult days 🫂.", "I may be an automated assistant, but I can still acknowledge that what you're feeling matters."],
        love: ["Awww ❤️🥹 That's sweet! The owner is currently away.", "Love has entered the inbox 😭❤️ Message received!", "🥹❤️ Someone is spreading affection today!", "That's adorable 😊💕 The owner will see your message when available.", "Eish 😂❤️ These romantic vibes!", "A little love goes a long way 🫶."],
        default: ["I've received your message 😊. The owner is currently away and will respond when possible.", "Your message has been delivered 📥. BL@CKN1TE is currently offline.", "🤖 Automated assistant active. Owner is away, but your text is safe.", "Noted ✍️. The owner is unavailable right now, please leave your message here."]
    },
    sn: {
        greetings: ["Makadii henyu 😊🙏 Muridzi haapo parizvino, asi meseji yenyu yasvika.", "Mhoroi 😁 Zviripo here? Muridzi wacho haapo, asi ndakaona meseji yenyu."],
        howAreYou: ["Ndiri bho 😂🙏 Muridzi haapo pari zvino.", "Tiripo, tinotenda 😊🙏. Muridzi haapo parizvino, asi meseji yenyu yasvika."],
        sad: ["Ndine urombo kuti uri kunzwa saizvozvo ❤️. Kana uchida kutaura, unogona kugovera zviri kukunetsa."],
        default: ["Meseji yenyu yasvika. Muridzi haapo parizvino, achapindura kana awana nguva."]
    },
    nd: {
        greetings: ["Sawubona 😊 Umnikazi akekho okwamanje, kodwa umlayezo wakho usufikile.", "Salibonani 😁 Umnikazi akekho okwamanje."],
        howAreYou: ["Ngiyaphila 😊🙏 Umnikazi akekho okwamanje.", "Siyaphila, siyabonga 😊. Umnikazi akekho okwamanje."],
        sad: ["Ngiyakuzwa mngane wami ❤️. Ngiyathemba ukuthi izinto zizoba ngcono."],
        default: ["Umlayezo wakho usufikile. Umnikazi akekho okwamanje, uzophendula uma etholakala."]
    },
    sw: {
        greetings: ["Habari yako? Mwenye akaunti hayupo kwa sasa, lakini ujumbe wako umepokelewa."],
        howAreYou: ["Nzuri, asante 😊. Mwenye akaunti hayupo kwa sasa."],
        default: ["Ujumbe wako umepokelewa. Mwenye akaunti hayupo kwa sasa, atajibu akipatikana."]
    },
    fr: {
        greetings: ["Bonjour 😊 Le propriétaire est momentanément absent, mais votre message a bien été reçu."],
        howAreYou: ["Ça va, merci 😊. Le propriétaire est momentanément absent."],
        default: ["Votre message a été reçu. Le propriétaire est absent pour le moment."]
    }
};

function detectLanguage(text) {
    const lower = text.toLowerCase();
    if (/(makadii|mhoroi|wakadini|zvakanaka|uri bho|ndiri bho)/.test(lower)) return 'sn';
    if (/(sawubona|unjani|siyaphila|ngiyaphila|salibonani)/.test(lower)) return 'nd';
    if (/(habari|mzuri|asante|nzuri)/.test(lower)) return 'sw';
    if (/(bonjour|salut|ça va|merci|tres bien)/.test(lower)) return 'fr';
    if (/(hola|bien|gracias)/.test(lower)) return 'es';
    if (/(ola|tudo bem|obrigado)/.test(lower)) return 'pt';
    return 'en';
}

function getOfflineAutoReply(text) {
    const lang = detectLanguage(text);
    const lowerText = text.toLowerCase();
    const db = autoReplyDB[lang] || autoReplyDB['en'];

    if (/(hie|hi|hello|hey|mhoroi|makadii|sawubona|habari|bonjour|hola|ola)/i.test(lowerText)) return db.greetings || autoReplyDB['en'].greetings;
    if (/(how are you|wyd|wakadini|unjani|habari yako|ça va|tudo bem)/i.test(lowerText)) return db.howAreYou || autoReplyDB['en'].howAreYou;
    if (/(lol|lmao|haha|😂|🤣|joke|funn|wadii|hc|ndyp)/i.test(lowerText)) return autoReplyDB['en'].jokes; 
    if (/(sad|cry|😢|😭|💔|lonely|ndine urombo|ngiyakhala)/i.test(lowerText)) return db.sad || autoReplyDB['en'].sad;
    if (/(love|❤️|🥰|😘|i miss you|ndinokuda|ngiyakuthanda)/i.test(lowerText)) return autoReplyDB['en'].love;
    return db.default || autoReplyDB['en'].default;
}

// ============================================================
// 🎨 MASSIVE CYBERPUNK MENU — GOD TIER EDITION
// (Design and Version Name fully preserved)
// ============================================================
function buildBeautifulMenu(session, botData, customName) {
    const aiStatus = session.aiEnabled ? '🟢' : '🔴';
    const ghostStatus = session.readReceipts === false ? '🟢' : '🔴';
    const autoTypeStatus = session.autoTyping ? '🟢' : '🔴';
    const autoReplyStatus = session.autoRespond ? '🟢' : '🔴';
    const reactStatus = session.autoReact ? '🟢' : '🔴';
    const readStatus = session.readReceipts !== false ? '🟢' : '🔴';
    const antiDelStatus = botData.antiDelete[session.userId] ? '🟢' : '🔴';
    const antiStatStatus = botData.statusSettings[session.userId]?.autoStatus ? '🟢' : '🔴';
    const antiLinkStatus = botData.antilinkGroups?.[session.userId] ? '🟢' : '🔴';
    const antiCallStatus = botData.antiCall?.[session.userId] ? '🟢' : '🔴';
    const modeIcon = session.isPublic ? '🌍' : '🔐';
    const modeText = session.isPublic ? toBold('PUBLIC') : toBold('PRIVATE');

    const header =
`╔═══════════════════════════════════════╗
║  ░▒▓█ ${toBold('BL@CKN1TE-NXS')} █▓▒░
║  ░▒▓█ ${toBold('V16')} • ${toBold('CYBERPUNK CORE')} █▓▒░
║  ═══════════════════════════════════
║  🎩 ${toBold('The Incisive Tri-Hat Hacker')}
║  ♾️  ${toBold('LIFETIME CONNECTION ACTIVE')}
║  ⚡ ${toBold('ENGINE')} : Baileys • Node.js
╚═══════════════════════════════════════╝`;

    const operator =
`\n┏━〔 ${toBold('👤 OPERATOR IDENTITY')} 〕━━━━━━━━━
┃  ├ ${toBold('Codename')}  : ${customName}
┃  ├ ${toBold('Session')}   : ${session.userId.slice(0, 18)}
┃  ├ ${toBold('Status')}    : 🟢 ${toBold('ONLINE')}
┃  └ ${toBold('Access')}    : ${modeIcon} ${modeText}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    const coreSystems =
`\n┏━〔 ${toBold('⚙️ CORE SYSTEMS')} 〕━━━━━━━━━━━━━
┃  ${aiStatus} ${toBold('AI Engine')}       ${session.aiEnabled ? 'ACTIVE' : 'IDLE'}
┃  ${autoTypeStatus} ${toBold('Auto-Typing')}     ${session.autoTyping ? 'ACTIVE' : 'IDLE'}
┃  ${autoReplyStatus} ${toBold('Auto-Reply')}     ${session.autoRespond ? 'ACTIVE' : 'IDLE'}
┃  ${ghostStatus} ${toBold('Ghost Mode')}      ${session.readReceipts === false ? 'ACTIVE' : 'IDLE'}
┃  ${readStatus} ${toBold('Auto-Read')}       ${session.readReceipts !== false ? 'ACTIVE' : 'IDLE'}
┃  ${reactStatus} ${toBold('Auto-React')}      ${session.autoReact ? 'ACTIVE' : 'IDLE'}
┃  ${antiDelStatus} ${toBold('Anti-Delete')}     ${botData.antiDelete[session.userId] ? 'ACTIVE' : 'IDLE'}
┃  ${antiStatStatus} ${toBold('Anti-Status')}     ${botData.statusSettings[session.userId]?.autoStatus ? 'ACTIVE' : 'IDLE'}
┃  ${antiLinkStatus} ${toBold('Anti-Link')}       ${botData.antilinkGroups?.[session.userId] ? 'ACTIVE' : 'IDLE'}
┃  ${antiCallStatus} ${toBold('Anti-Call')}       ${botData.antiCall?.[session.userId] ? 'ACTIVE' : 'IDLE'}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    const matrixBanner =
`\n╔═══════════════════════════════════════╗
║  ░▒▓ ${toBold('COMMAND MATRIX')} ▓▒░
║  ${toBold('8 Sectors')} • ${toBold('70+ Commands')}
╚═══════════════════════════════════════╝`;

    const sections = [];

    sections.push(
`\n┏━〔 ${toBold('⚙️ 01 · USER CORE')} 〕━━━━━━━━━━
┃  ▸ ${toBold('.read')} <on|off|default>
┃  ▸ ${toBold('.ghost')} <on|off>
┃  ▸ ${toBold('.autoreacts')} <on|off>
┃  ▸ ${toBold('.ai')} <key> <on|off|text>
┃  ▸ ${toBold('.autotyping')} <on|off>
┃  ▸ ${toBold('.autorespond')} <on|off>
┃  ▸ ${toBold('.setprefix')} <symbol>
┃  ▸ ${toBold('.ping')} — latency check
┃  ▸ ${toBold('.alive')} — check status
┃  ▸ ${toBold('.owner')} — contact & emails
┃  ▸ ${toBold('.incisive-drop')} — premium
┃  ▸ ${toBold('.blackn1te')} — premium
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    );

    sections.push(
`\n┏━〔 ${toBold('🎬 02 · MEDIA VAULT')} 〕━━━━━━━━
┃  ▸ ${toBold('.play')} <song name>
┃  ▸ ${toBold('.song')} <name|url>
┃  ▸ ${toBold('.video')} <name|url>
┃  ▸ ${toBold('.ytmp4')} <url>
┃  ▸ ${toBold('.dl')} <direct url>
┃  ▸ ${toBold('.tiktok')} <url>
┃  ▸ ${toBold('.insta')} <url>
┃  ▸ ${toBold('.facebook')} <url>
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    );

    sections.push(
`\n┏━〔 ${toBold('🧠 03 · AI & SYNTHESIS')} 〕━━━━━
┃  ▸ ${toBold('.image')} <prompt>
┃  ▸ ${toBold('.tts')} <text|lang>
┃  ▸ ${toBold('.tts voice')} <text>
┃  ▸ ${toBold('.character')} @mention
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    );

    sections.push(
`\n┏━〔 ${toBold('🛠️ 04 · UTILITIES')} 〕━━━━━━━━━
┃  ▸ ${toBold('.weather')} <city>
┃  ▸ ${toBold('.qr')} <text|url>
┃  ▸ ${toBold('.shorten')} <url>
┃  ▸ ${toBold('.calc')} <expression>
┃  ▸ ${toBold('.joke')}
┃  ▸ ${toBold('.meme')}
┃  ▸ ${toBold('.emojimix')} <e1+e2>
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    );

    sections.push(
`\n┏━〔 ${toBold('🛡️ 05 · ADMIN PROTOCOLS')} 〕━━━
┃  ▸ ${toBold('.private')} / ${toBold('.public')}
┃  ▸ ${toBold('.autoread')} <on|off>
┃  ▸ ${toBold('.status')} <on|off|like|seen>
┃  ▸ ${toBold('.anticall')} <on|off>
┃  ▸ ${toBold('.antidelete')} <on|off>
┃  ▸ ${toBold('.antilink')} <on|off|kick>
┃  ▸ ${toBold('.antistatus')} <on|off>
┃  ▸ ${toBold('.kickoffline')} <on|off>
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    );

    sections.push(
`\n┏━〔 ${toBold('⚔️ 06 · GROUP WARFARE')} 〕━━━━
┃  ▸ ${toBold('.hidetag')} <message>
┃  ▸ ${toBold('.tagall')} <message>
┃  ▸ ${toBold('.setname')} <name>
┃  ▸ ${toBold('.kick')} @user
┃  ▸ ${toBold('.groupinfo')}
┃  ▸ ${toBold('.accept')}
┃  ▸ ${toBold('.hack')}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    );

    sections.push(
`\n┏━〔 ${toBold('🌐 07 · BL@CKN1TE HUB')} 〕━━━━━
┃  ▸ ${toBold('.websites')}
┃  ▸ ${toBold('.trihat')}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    );

    sections.push(
`\n┏━〔 ${toBold('👑 08 · OWNER ZONE')} 〕━━━━━━━
┃  ▸ ${toBold('.settings')}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    );

    const quickStart =
`\n┏━〔 ${toBold('🚀 QUICK START')} 〕━━━━━━━━━━━
┃  ${toBold('Prefixes')}  : . / >
┃  ${toBold('Example')}   : .menu
┃  ${toBold('Help')}      : .menu
┃  ${toBold('Owner')}     : .owner
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    const footer =
`\n╔═══════════════════════════════════════╗
║  🔗 ${toBold('JOIN CHANNEL')}
║  ▸ https://whatsapp.com/channel/0029VbDubJNHbFV50Y6oiO3f
║  ───────────────────────────────────
║  ⚡ ${toBold('Powered by BL@CKN1TE')}
║  🎩 ${toBold('The Incisive Tri-Hat Hacker')}
║  ♾️  ${toBold('INFINITE MODE')} • ${toBold('24/7/365')}
╚═══════════════════════════════════════╝

  ░▒▓█ ${toBold('END OF TRANSMISSION')} █▓▒░`;

    return (
        header + operator + coreSystems + matrixBanner +
        sections.join('') + quickStart + footer
    );
}

const LIGHTNING_EMOJIS = ['⚡', '🌩️', '⚡️', '✨', '🌟', '🔥', '💫', '🪄', '⚡'];
const RANDOM_REACTIONS = ['⚡', '🔥', '✨', '🌟', '💫', '🎯', '🚀', '💥', '⚡️', '👑', '💎', '🎉', '✅', '🤖', '😎', '🙌', '👏', '💯', '🌟', '🪄', '🧿', '🍀', '🌈', '❤️', '👍', '🎊', '⭐'];
function getRandomReaction() { return RANDOM_REACTIONS[Math.floor(Math.random() * RANDOM_REACTIONS.length)]; }

// ============================================================
// ♾️ INFINITE BOT SESSION
// ============================================================
class BotSession {
    constructor(userId) {
        this.userId = userId;
        this.sock = null;
        this.isConnected = false;
        this.aiEnabled = false;
        this.autoTyping = true; // Default ON
        this.autoRespond = false; // Default OFF

        const persistedRead = botData.readSettings?.[userId]?.enabled;
        this.readReceipts = (persistedRead === undefined) ? true : persistedRead;

        this.autoReact = botData.statusSettings[userId]?.autoReact || false;
        this.isPublic = botData.statusSettings[userId]?.isPublic || false;
        this.authPath = path.join(AUTH_DIR, userId);
        this.processedMessages = new Set();
        this.activeInterval = null;
        this.keepAliveInterval = null;
        this.watchdogInterval = null;
        this.heartbeatInterval = null;
        this.isInitializing = false;
        this.lastConnectMessageTime = null;
        this.reconnectAttempts = 0;
        this.silentMode = SILENT_RECONNECT;
        this.lastReconnectLog = 0;
        this.everConnected = false;
        this.currentPrefix = botData.customPrefix[userId] || '.';
    }

    sendLog(message, type = 'info') {
        if (this.silentMode && this.everConnected && type === 'warning' &&
            /reconnect|closed|retry|attempt/i.test(message)) {
            const now = Date.now();
            if (now - this.lastReconnectLog < 10 * 60 * 1000) return;
            this.lastReconnectLog = now;
        }
        const logEntry = { timestamp: new Date().toLocaleTimeString(), message, type, user: this.userId };
        const socketId = userSockets[this.userId];
        if (socketId) io.to(socketId).emit('console', logEntry);
        io.emit('console', logEntry);
        console.log(`[${this.userId}] ${message}`);
    }

    sendConnectionStatus() {
        const socketId = userSockets[this.userId];
        if (socketId) io.to(socketId).emit('connection-status', { connected: this.isConnected, user: this.userId });
        io.emit('total-active', {
            count: Object.values(sessions).filter(s => s.isConnected).length,
            sessions: Object.keys(sessions).length
        });
    }

    async reactRandom(msg) {
        try { await this.sock.sendMessage(msg.key.remoteJid, { react: { text: getRandomReaction(), key: msg.key } }); } catch (e) {}
    }

    async getAIResponse(userJid, userMessage) {
        if (!openai) return null;
        try {
            if (!aiMemory[userJid]) aiMemory[userJid] = [];
            aiMemory[userJid].push({ role: "user", content: userMessage });
            if (aiMemory[userJid].length > 10) aiMemory[userJid].shift(); // Keep memory fresh

            const completion = await openai.chat.completions.create({
                model: process.env.AI_MODEL || "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: "You are BL@CKN1TE-NXS, a highly intelligent, premium assistant. You can perform multiple tasks, write code, solve math, and chat naturally. Respond concisely." },
                    ...aiMemory[userJid]
                ],
                max_tokens: 300
            });
            const response = completion.choices[0].message.content.trim();
            aiMemory[userJid].push({ role: "assistant", content: response });
            return response;
        } catch (error) { return "⚠️ AI Core is currently offline or API key missing."; }
    }

    async safeReply(from, msg, content) {
        try {
            if (this.autoTyping) {
                await this.sock.sendMessage(from, { react: { text: getRandomReaction(), key: msg.key } }).catch(()=>{});
                await this.sock.sendPresenceUpdate('composing', from);
                await delay(Math.floor(Math.random() * 1000) + 800); 
            }
            await this.sock.sendMessage(from, content, { quoted: msg });
            if (this.autoTyping) await this.sock.sendPresenceUpdate('paused', from);
        } catch (e) { console.error("SafeReply Error:", e.message); }
    }

    checkAutoReplyLimits(jid) {
        const now = Date.now();
        if (!autoReplyState[jid]) autoReplyState[jid] = { count: 0, lastReply: 0, firstMsgTime: now, recentMsgs: [] };
        const state = autoReplyState[jid];
        if (now - state.firstMsgTime > 60 * 60 * 1000) { state.count = 0; state.firstMsgTime = now; }
        if (now - state.lastReply < 60000) return false;
        if (state.count >= 5) return false;
        state.count++;
        state.lastReply = now;
        return true;
    }

    startKeepAlive() {
        if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
        this.keepAliveInterval = setInterval(async () => {
            if (this.isConnected && this.sock?.user) {
                try { await this.sock.sendPresenceUpdate('available'); } catch (e) {}
            }
        }, KEEPALIVE_PRESENCE_MS);
    }

    startWatchdog() {
        if (this.watchdogInterval) clearInterval(this.watchdogInterval);
        this.watchdogInterval = setInterval(async () => {
            if (this.isInitializing) return;
            if (!this.sock || !this.sock.user || !this.isConnected) {
                try { await this.initialize(); } catch (e) {}
            }
        }, SESSION_WATCHDOG_MS);
    }

    startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(async () => {
            if (!this.sock || !this.sock.user) return;
            try { await this.sock.sendPresenceUpdate('available'); }
            catch (e) { if (!this.isInitializing) { try { await this.initialize(); } catch (err) {} } }
        }, HEARTBEAT_INTERVAL_MS);
    }

    startActiveCheck() {
        if (this.activeInterval) clearInterval(this.activeInterval);
        this.activeInterval = setInterval(async () => {
            if (this.isConnected && this.sock?.user) {
                try {
                    const botNumber = jidNormalizedUser(this.sock.user.id);
                    await this.sock.sendMessage(botNumber, { text: "♾️ 𝗕𝗟@𝗖𝗞𝗡𝟭𝗧𝗘-𝗡𝗫𝗦 𝗜𝗦 𝗢𝗡𝗟𝗜𝗡𝗘 🚀\n\n_Lifetime Connection Active_" });
                } catch (e) {}
            }
        }, 60 * 60 * 1000);
    }

    async forceReconnect(delayMs = 3000) {
        if (this.isInitializing) return;
        this.reconnectAttempts++;
        this.sendLog(`🔄 Reconnect #${this.reconnectAttempts} in ${delayMs/1000}s`, "warning");
        setTimeout(async () => {
            try { await this.initialize(); }
            catch (e) {
                const next = Math.min(delayMs * 2, 30000);
                setTimeout(() => this.forceReconnect(next), next);
            }
        }, delayMs);
    }

    async initialize(pairingNumber = null) {
        if (this.isInitializing) return;
        this.isInitializing = true;

        try {
            const { version } = await fetchLatestBaileysVersion();
            const { state, saveCreds } = await useMultiFileAuthState(this.authPath);

            this.sock = makeWASocket({
                version,
                auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'fatal' })) },
                printQRInTerminal: false,
                logger: P({ level: 'fatal' }),
                browser: Browsers.ubuntu('Chrome'),
                syncFullHistory: false,
                shouldSyncHistoryMessage: () => false,
                markOnlineOnConnect: true,
                keepAliveIntervalMs: 15000,
                connectTimeoutMs: 30000,
                defaultQueryTimeoutMs: 30000,
                emitOwnEvents: true,
                retryRequestDelayMs: 1000,
                maxMsgRetryCount: 5,
                linkPreviewImageThumbnailWidth: 192,
                generateHighQualityLinkPreview: false,
                getMessage: async (key) => {
                    if (messageLogs[key.id]) return { conversation: messageLogs[key.id].text };
                    return { conversation: 'Bot is active' };
                }
            });

            if (pairingNumber && !state.creds.registered) {
                if (!this.sock.authState.creds.registered) {
                    await delay(1200);
                    try {
                        let code = await this.sock.requestPairingCode(pairingNumber);
                        code = code?.match(/.{1,4}/g)?.join("-") || code;
                        this.sendLog(`🔑 Pairing Code: ${code}`, 'success');
                        const socketId = userSockets[this.userId];
                        if (socketId) io.to(socketId).emit('pairing-code', code);
                    } catch (err) { this.sendLog(`❌ Pairing error: ${err.message}`, 'error'); }
                }
            }

            this.sock.ev.on('creds.update', saveCreds);

            this.sock.ev.on('call', async (calls) => {
                if (botData.antiCall[this.userId]) {
                    for (const call of calls) {
                        if (call.status === 'offer') {
                            try { await this.sock.rejectCall(call.id, call.from); await this.sock.sendMessage(call.from, { text: "⚠️ *ANTI-CALL:* Calls rejected." }); } catch (e) {}
                        }
                    }
                }
            });

            this.sock.ev.on('messages.upsert', async (m) => {
                if (m.type !== 'notify') return;
                try {
                    const firstMsg = m.messages?.[0];
                    if (firstMsg) {
                        const senderJid = firstMsg.key.participant || firstMsg.key.remoteJid || '';
                        const senderNum = senderJid.split('@')[0].split(':')[0].replace(/\D/g, '');
                        if (senderNum && isNumberBlacklisted(senderNum)) return;
                    }
                } catch (e) {}

                await Promise.all(m.messages.map(async (msg) => {
                    try {
                        const from = msg.key.remoteJid;
                        const isMe = msg.key.fromMe;
                        const isGroup = from.endsWith('@g.us');
                        const isStatus = from === 'status@broadcast';
                        const sender = msg.key.participant || from;

                        const messageContent = msg.message?.ephemeralMessage?.message || msg.message?.viewOnceMessage?.message || msg.message?.viewOnceMessageV2?.message || msg.message;
                        if (!messageContent) return;

                        let type = Object.keys(messageContent)[0];
                        const text = (messageContent.conversation || messageContent.extendedTextMessage?.text || messageContent.imageMessage?.caption || messageContent.videoMessage?.caption || '').trim();

                        if (!isMe && !isStatus) {
                            if (this.readReceipts !== false) handleAutoread(this.sock, msg, this).catch(() => {});
                            else { try { this.sock.sendPresenceUpdate('available'); } catch (e) {} }
                            storeMessage(msg).catch(() => {});
                        }

                        if (msg.message?.protocolMessage?.type === 0) { handleMessageRevocation(this.sock, msg).catch(() => {}); return; }

                        const msgId = msg.key.id;
                        if (this.processedMessages.has(msgId)) return;
                        this.processedMessages.add(msgId);
                        if (this.processedMessages.size > 800) this.processedMessages.delete(this.processedMessages.values().next().value);

                        if (!isStatus) {
                            let logEntry = { text, type };
                            if (['imageMessage','videoMessage','audioMessage'].includes(type)) {
                                try {
                                    const mContent = messageContent[type];
                                    if (mContent && (mContent.directPath || mContent.url)) {
                                        const stream = await downloadContentFromMessage(mContent, type.replace('Message',''));
                                        let buffer = Buffer.from([]);
                                        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                                        logEntry.buffer = buffer;
                                    }
                                } catch (e) {}
                            }
                            logEntry.pushName = msg.pushName || 'User';
                            messageLogs[msgId] = logEntry;
                            if (Object.keys(messageLogs).length > 1500) delete messageLogs[Object.keys(messageLogs)[0]];
                        }

                        if (this.autoReact && !isMe && !isStatus) {
                            const emojis = ['❤️','👍','🔥','👏','😮','😂','🙌','✨','⭐','✅','🤖','⚡','🌟','💯','🌈','💎','👑','🎉','🧿','🍀'];
                            try { this.sock.sendMessage(from, { react: { text: emojis[Math.floor(Math.random()*emojis.length)], key: msg.key } }); } catch (e) {}
                        }

                        if (this.aiEnabled && !isMe && !isStatus && !isGroup && text && !PREFIXES.some(p => text.startsWith(p)) && !text.startsWith(this.currentPrefix)) {
                            try {
                                const aiResponse = await this.getAIResponse(from, text);
                                if (aiResponse) await this.safeReply(from, msg, { text: aiResponse });
                            } catch (e) {}
                        }

                        if (this.autoRespond && !isMe && !isStatus && !isGroup && text && !PREFIXES.some(p => text.startsWith(p)) && !text.startsWith(this.currentPrefix)) {
                            if (/(suicide|kill myself|emergency|help me|abuse)/i.test(text)) {
                                return await this.safeReply(from, msg, { text: "⚠️ *URGENT SAFETY ALERT* ⚠️\n\nThe owner is currently away, but if you are in immediate danger or distress, please contact local emergency services or a trusted person immediately. Your life is valuable. ❤️" });
                            }
                            if (this.checkAutoReplyLimits(from)) {
                                const replies = getOfflineAutoReply(text);
                                if (!autoReplyState[from].recentMsgs) autoReplyState[from].recentMsgs = [];
                                let availableReplies = replies.filter(r => !autoReplyState[from].recentMsgs.includes(r));
                                if (availableReplies.length === 0) availableReplies = replies;
                                const randomReply = availableReplies[Math.floor(Math.random() * availableReplies.length)];
                                autoReplyState[from].recentMsgs.push(randomReply);
                                if (autoReplyState[from].recentMsgs.length > 5) autoReplyState[from].recentMsgs.shift();
                                await this.safeReply(from, msg, { text: randomReply });
                                return; 
                            }
                        }

                        if (isStatus && !isMe) { handleStatusUpdate(this.sock, m, botData, this.userId).catch(() => {}); return; }

                        const botNumber = jidNormalizedUser(this.sock.user.id);
                        const isOwner = isMe || sender.includes(botNumber.split('@')[0]);
                        let isAdmin = isOwner;

                        if (!isAdmin && isGroup) {
                            try {
                                const gmd = await this.sock.groupMetadata(from);
                                const participant = gmd.participants.find(p => p.id === sender);
                                isAdmin = participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
                            } catch (e) { isAdmin = false; }
                        }

                        const cmd = text.toLowerCase();
                        const args = text.split(' ').slice(1);
                        const q = args.join(' ');

                        if (isGroup && botData.antiStatusGroups?.[from] && !isAdmin) {
                            if (msg.message?.forwardingScore > 0) { try { this.sock.sendMessage(from, { delete: msg.key }); return; } catch (e) {} }
                        }

                        if (isGroup && botData.antilinkGroups[from] && !isAdmin) {
                            const linkPatterns = [/chat.whatsapp.com\//i, /http:\/\//i, /https:\/\//i, /www\./i, /[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/i];
                            if (linkPatterns.some(p => p.test(text))) {
                                try {
                                    const mode = botData.antilinkGroups[from];
                                    await this.sock.sendMessage(from, { delete: msg.key });
                                    if (mode === 'kick') await this.sock.groupParticipantsUpdate(from, [sender], "remove");
                                } catch (e) {}
                                return;
                            }
                        }

                        if (!this.isPublic && !isOwner) return;

                        const matchedPrefix = [this.currentPrefix, ...PREFIXES].find(p => cmd.startsWith(p));
                        if (matchedPrefix) {
                            const commandName = cmd.slice(matchedPrefix.length).split(' ')[0];
                            this.reactRandom(msg).catch(() => {});
                            (async () => {
                                try {
                                    switch (commandName) {
                                        case 'menu':
                                        case 'start':
                                        case 'cmnds': {
                                            try {
                                                for (let i = 0; i < 3; i++) {
                                                    const lightning = LIGHTNING_EMOJIS[Math.floor(Math.random() * LIGHTNING_EMOJIS.length)];
                                                    this.sock.sendMessage(from, { react: { text: lightning, key: msg.key } }).catch(() => {});
                                                    await delay(250);
                                                }
                                                const customName = botData.userNames[this.userId] || msg.pushName || 'User';
                                                const menuText = buildBeautifulMenu(this, botData, customName);
                                                
                                                try {
                                                    await this.sock.sendMessage(from, { image: { url: './logo.png' }, caption: menuText });
                                                } catch (e1) {
                                                    try {
                                                        const imgRes = await axios.get('https://raw.githubusercontent.com/Blackn1te-crypto/BLACKN1TE-NXS/main/logo.png', { responseType: 'arraybuffer', timeout: 8000 });
                                                        await this.sock.sendMessage(from, { image: Buffer.from(imgRes.data), caption: menuText });
                                                    } catch (e2) { await this.sock.sendMessage(from, { text: menuText }); }
                                                }
                                                this.sendLog('Menu sent ✅', 'success');
                                            } catch (e) { this.sendLog('Menu error: ' + e.message, 'error'); }
                                            break;
                                        }

                                        case 'ping': {
                                            const start = Date.now();
                                            const sent = await this.sock.sendMessage(from, { text: '⚡ *Pinging...*' });
                                            const latency = Date.now() - start;
                                            await this.sock.sendMessage(from, { text: `🚀 *LIVE PING RECORD*\n\n⚡ Latency: *${latency} ms*\n🌐 Server: *Render Node*\n♾️ Status: *Infinite Active*`, edit: sent.key });
                                            break;
                                        }

                                        case 'alive': {
                                            await this.safeReply(from, msg, { text: `♾️ *BL@CKN1TE-NXS V16 IS ALIVE* ♾️\n\n✅ Anti-Sleep: Active\n✅ Anti-Drop: Active\n✅ AI Memory: ${this.aiEnabled ? 'ON' : 'OFF'}\n✅ Auto-Typing: ${this.autoTyping ? 'ON' : 'OFF'}\n✅ Auto-Reply: ${this.autoRespond ? 'ON' : 'OFF'}\n\n_Uptime: ${formatUptime(Math.floor(process.uptime()))}_` });
                                            break;
                                        }

                                        case 'owner': {
                                            try {
                                                await this.sock.sendMessage(from, { 
                                                    image: { url: './owner_image.jpg' }, 
                                                    caption: `👑 *OWNER & CONTACT INFO* 👑\n\n👤 *Name:* BL@CKN1TE\n🎩 *Alias:* The Incisive Tri-Hat Hacker\n\n📱 *NUMBERS:*\n1️⃣ +27 75 265 8738 🇿🇦\n2️⃣ +263 78 054 0231 🇿🇼\n3️⃣ +263 71 479 9483 🇿🇼 (Backup)\n\n📧 *EMAILS:*\n📩 blackn1te.trihat@gmail.com\n📩 blackn1te.incisive.trihat@gmail.com\n📩 blackn1te@protonmail.com\n\n🌐 *Site:* blackn1te-nxs-1.onrender.com\n\n_Do not spam the owner._` 
                                                });
                                            } catch (e) {
                                                await this.safeReply(from, msg, { text: '👑 *Owner:* BL@CKN1TE\n📱 *Numbers:* +27 75 265 8738 / +263 78 054 0231 / +263 71 479 9483\n📧 *Emails:* blackn1te.trihat@gmail.com, blackn1te.incisive.trihat@gmail.com, blackn1te@protonmail.com' });
                                            }
                                            break;
                                        }

                                        case 'setprefix': {
                                            if (!isOwner) return await this.sock.sendMessage(from, { text: '❌ Owner only command.' });
                                            if (!q) return await this.sock.sendMessage(from, { text: '⚠️ Provide a prefix. e.g .setprefix !' });
                                            this.currentPrefix = q;
                                            botData.customPrefix[this.userId] = q;
                                            saveBotData();
                                            await this.safeReply(from, msg, { text: `✅ Prefix updated to: *${q}*` });
                                            break;
                                        }

                                        case 'ai': {
                                            if (!isOwner) return await this.sock.sendMessage(from, { text: '❌ Owner only command.' });
                                            const key = args[0];
                                            if (key !== AI_SECRET_KEY) return await this.safeReply(from, msg, { text: '🔐 *ACCESS DENIED.* Incorrect AI unlock key.' });
                                            
                                            const mode = (args[1] || '').toLowerCase();
                                            if (mode === 'on') { this.aiEnabled = true; return await this.safeReply(from, msg, { text: '🧠 *AI Engine:* ON (Memory Active)' }); }
                                            if (mode === 'off') { this.aiEnabled = false; return await this.safeReply(from, msg, { text: '🧠 *AI Engine:* OFF' }); }
                                            
                                            const prompt = args.slice(1).join(' ');
                                            if (!prompt) return await this.safeReply(from, msg, { text: '⚠️ Provide a prompt. Example: .ai <key> write a code' });
                                            
                                            const res = await this.getAIResponse(sender, prompt);
                                            await this.safeReply(from, msg, { text: res });
                                            break;
                                        }

                                        case 'autorespond': {
                                            if (!isOwner) return await this.sock.sendMessage(from, { text: '❌ Owner only command.' });
                                            const mode = (args[0] || '').toLowerCase();
                                            if (mode === 'on') { this.autoRespond = true; await this.safeReply(from, msg, { text: '🧠 *Intelligent Auto-Reply Engine:* ON (Multilingual Mode Active)' }); }
                                            else if (mode === 'off') { this.autoRespond = false; await this.safeReply(from, msg, { text: '🧠 *Intelligent Auto-Reply Engine:* OFF' }); }
                                            else { await this.safeReply(from, msg, { text: `🧠 *Auto-Reply status:* ${this.autoRespond ? 'ON' : 'OFF'}` }); }
                                            break;
                                        }

                                        case 'autotyping': {
                                            if (!isOwner) return await this.sock.sendMessage(from, { text: '❌ Owner only command.' });
                                            const mode = (args[0] || '').toLowerCase();
                                            if (mode === 'on') { this.autoTyping = true; await this.safeReply(from, msg, { text: '⌨️ *Auto-Typing Simulator:* ON' }); }
                                            else if (mode === 'off') { this.autoTyping = false; await this.safeReply(from, msg, { text: '⌨️ *Auto-Typing Simulator:* OFF' }); }
                                            else { await this.safeReply(from, msg, { text: `⌨️ *Auto-Typing status:* ${this.autoTyping ? 'ON' : 'OFF'}` }); }
                                            break;
                                        }

                                        case 'incisive-drop':
                                        case 'blackn1te': {
                                            await this.sock.sendMessage(from, { react: { text: '💎', key: msg.key } });
                                            await this.safeReply(from, msg, { text: `👑 *PREMIUM ACCESS GRANTED* 👑\n\nWelcome to the elite tier of BL@CKN1TE-NXS. Your request for *${commandName}* has been processed securely.\n\n♾️ _Infinite Core Active_` });
                                            break;
                                        }

                                        case 'play':
                                        case 'song': {
                                            if (!q) return await this.safeReply(from, msg, { text: '⚠️ Provide a song name.' });
                                            await this.sock.sendMessage(from, { react: { text: '🎵', key: msg.key } });
                                            const wait = await this.sock.sendMessage(from, { text: `🔍 *Searching & Downloading:* ${q}...` });
                                            try {
                                                const audioRes = await axios.get(`https://api.nexoracle.com/downloaders/ytdl?q=${encodeURIComponent(q)}&apikey=free`).catch(()=>null);
                                                if (audioRes && audioRes.data && audioRes.data.result && audioRes.data.result.audio) {
                                                    await this.sock.sendMessage(from, { audio: { url: audioRes.data.result.audio }, mimetype: 'audio/mp4', fileName: `${q}.mp3` }, { quoted: msg });
                                                    await this.sock.sendMessage(from, { delete: wait.key });
                                                } else { await this.safeReply(from, msg, { text: '❌ API Limit reached or song not found.' }); }
                                            } catch (e) { await this.safeReply(from, msg, { text: '❌ Download failed.' }); }
                                            break;
                                        }

                                        case 'video':
                                        case 'ytmp4': {
                                            if (!q) return await this.safeReply(from, msg, { text: '⚠️ Provide a video name or URL.' });
                                            await this.sock.sendMessage(from, { react: { text: '🎬', key: msg.key } });
                                            await this.safeReply(from, msg, { text: `🔍 *Fetching Video:* ${q}...` });
                                            try {
                                                const vidRes = await axios.get(`https://api.nexoracle.com/downloaders/ytdl?q=${encodeURIComponent(q)}&apikey=free`).catch(()=>null);
                                                if (vidRes && vidRes.data && vidRes.data.result && vidRes.data.result.video) {
                                                    await this.sock.sendMessage(from, { video: { url: vidRes.data.result.video }, mimetype: 'video/mp4', caption: `🎬 *${q}*\n\n_Downloaded by BL@CKN1TE-NXS_` }, { quoted: msg });
                                                } else { await this.safeReply(from, msg, { text: '❌ API Limit reached or video not found.' }); }
                                            } catch (e) { await this.safeReply(from, msg, { text: '❌ Video download failed.' }); }
                                            break;
                                        }

                                        case 'dl': {
                                            if (!q) return await this.safeReply(from, msg, { text: '⚠️ Provide a direct URL to download.' });
                                            try {
                                                const res = await axios.get(q, { responseType: 'arraybuffer', timeout: 30000 });
                                                const buffer = Buffer.from(res.data, 'binary');
                                                const mime = res.headers['content-type'];
                                                if (mime.includes('image')) await this.sock.sendMessage(from, { image: buffer, caption: '✅ Downloaded' });
                                                else if (mime.includes('video')) await this.sock.sendMessage(from, { video: buffer, caption: '✅ Downloaded' });
                                                else if (mime.includes('audio')) await this.sock.sendMessage(from, { audio: buffer, mimetype: 'audio/mp4' });
                                                else await this.sock.sendMessage(from, { document: buffer, mimetype: mime, fileName: 'download' });
                                            } catch (e) { await this.safeReply(from, msg, { text: '❌ Download failed. Link might be dead or protected.' }); }
                                            break;
                                        }

                                        // EXTERNAL COMMANDS FALLBACK
                                        case 'read': await commands.read(this.sock, from, msg, isAdmin, this, args); break;
                                        case 'ghost': {
                                            const mode = (args[0] || '').toLowerCase();
                                            if (mode === 'on') {
                                                this.readReceipts = false;
                                                if (!botData.readSettings[this.userId]) botData.readSettings[this.userId] = {};
                                                botData.readSettings[this.userId].enabled = false;
                                                saveBotData();
                                                try { await this.sock.sendPresenceUpdate('available'); } catch (e) {}
                                                await this.safeReply(from, msg, { text: '👻 *Ghost Mode:* ON' });
                                            } else if (mode === 'off') {
                                                this.readReceipts = true;
                                                if (!botData.readSettings[this.userId]) botData.readSettings[this.userId] = {};
                                                botData.readSettings[this.userId].enabled = true;
                                                saveBotData();
                                                try { await this.sock.sendPresenceUpdate('available'); } catch (e) {}
                                                await this.safeReply(from, msg, { text: '👻 *Ghost Mode:* OFF' });
                                            } else {
                                                await this.safeReply(from, msg, { text: `👻 *Ghost Mode:* ${this.readReceipts === false ? 'ON' : 'OFF'}` });
                                            }
                                            break;
                                        }
                                        case 'tiktok': await commands.tiktok(this.sock, from, msg, q); break;
                                        case 'insta': case 'ig': await commands.insta(this.sock, from, msg, q); break;
                                        case 'facebook': case 'fb': await commands.facebook(this.sock, from, msg, q); break;
                                        case 'gdrive': await commands.gdrive(this.sock, from, msg, q); break;
                                        case 'mf': await commands.mf(this.sock, from, msg, q); break;
                                        case 'apk': await commands.apk(this.sock, from, msg); break;
                                        case 'dp': await commands.dp(this.sock, from, msg); break;
                                        case 'vv': await commands.vv(this.sock, from, msg); break;
                                        case 'image': case 'img': case 'imagine': await commands.image(this.sock, from, msg); break;
                                        case 'tts': await commands.tts(this.sock, from, msg, q); break;
                                        case 'translate': case 'trt': await commands.translate(this.sock, from, msg); break;
                                        case 'character': await commands.character(this.sock, from, msg); break;
                                        case 'emojimix': await commands.emojimix(this.sock, from, msg); break;
                                        case 'joke': await commands.joke(this.sock, from, msg); break;
                                        case 'meme': await commands.meme(this.sock, from, msg); break;
                                        case 'weather': case 'w': await commands.weather(this.sock, from, msg); break;
                                        case 'qr': await commands.qr(this.sock, from, msg); break;
                                        case 'shorten': case 'short': await commands.shorten(this.sock, from, msg); break;
                                        case 'calc': case 'math': await commands.calc(this.sock, from, msg); break;
                                        case 'antilink': await commands.antilink(this.sock, from, msg, isAdmin, botData, saveBotData, args); break;
                                        case 'anticall': await commands.anticall(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, args); break;
                                        case 'antidelete': await commands.antidelete(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, args); break;
                                        case 'status': case 'autostatus': await commands.autostatus(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, args); break;
                                        case 'autoreacts': await commands.autoreacts(this.sock, from, msg, isAdmin, this, args); break;
                                        case 'kick': await commands.kick(this.sock, from, msg, isAdmin); break;
                                        case 'private': await commands.private(this.sock, from, msg, isAdmin, this); if (!botData.statusSettings[this.userId]) botData.statusSettings[this.userId] = {}; botData.statusSettings[this.userId].isPublic = false; saveBotData(); break;
                                        case 'public': await commands.public(this.sock, from, msg, isAdmin, this); if (!botData.statusSettings[this.userId]) botData.statusSettings[this.userId] = {}; botData.statusSettings[this.userId].isPublic = true; saveBotData(); break;
                                        case 'hidetag': await commands.hidetag(this.sock, from, msg, isAdmin, q); break;
                                        case 'tagall': await commands.tagall(this.sock, from, msg, isAdmin, q); break;
                                        case 'setname': await commands.setname(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, q); break;
                                        case 'groupinfo': await commands.groupinfo(this.sock, from, msg); break;
                                        case 'kickoffline': await commands.kickoffline(this.sock, from, msg, isAdmin, botData, saveBotData, args); break;
                                        case 'antistatus': await commands.antistatus(this.sock, from, msg, isAdmin, botData, saveBotData, args); break;
                                        case 'accept': await commands.accept(this.sock, from, msg, isAdmin); break;
                                        case 'hack': await commands.hack(this.sock, from, msg); break;
                                        case 'autoread': {
                                            if (autoreadCommand) {
                                                await autoreadCommand(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, args);
                                            } else {
                                                await commands.autoread(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, args);
                                            }
                                            break;
                                        }
                                        case 'online': await commands.online(this.sock, from, msg, isAdmin, this, args); break;
                                        case 'websites': case 'sites': case 'blackn1te-websites': await commands.blackn1teWebsites(this.sock, from, msg); break;
                                        case 'trihat': case 'tools': case 'incisive-trihat-tools': await commands.incisiveTrihatTools(this.sock, from, msg); break;
                                        case 'settings': await commands.settings(this.sock, from, msg, isAdmin, this, args); break;
                                    }
                                } catch (e) { this.sendLog(`Command error (${commandName}): ${e.message}`, 'error'); }
                            })();
                        }
                    } catch (e) { console.error('Message processing error:', e); }
                }));
            });

            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    this.isConnected = false;
                    this.isInitializing = false;
                    this.sendLog(`⚠️ Link dropped (code ${statusCode}). Auto-restoring...`, 'warning');
                    this.sendConnectionStatus();
                    const reconnectDelay =
                        statusCode === DisconnectReason.loggedOut ? 5000 :
                        statusCode === DisconnectReason.restartRequired ? 500 :
                        statusCode === DisconnectReason.connectionLost ? 1000 : 2000;
                    setTimeout(() => this.forceReconnect(reconnectDelay), 300);
                } else if (connection === 'open') {
                    this.isConnected = true;
                    this.everConnected = true;
                    this.isInitializing = false;
                    this.reconnectAttempts = 0;

                    const botNumber = jidNormalizedUser(this.sock.user.id);
                    const botNumClean = botNumber.split('@')[0].split(':')[0];

                    const persistedRead = botData.readSettings?.[this.userId]?.enabled;
                    if (persistedRead !== undefined) this.readReceipts = persistedRead;

                    this.sendLog('━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
                    this.sendLog('🎉 SESSION LINKED — INFINITE MODE', 'success');
                    this.sendLog(`👤 Bot: ${this.userId}`, 'success');
                    this.sendLog(`📱 Number: +${botNumClean}`, 'success');
                    this.sendLog(`🌍 Mode: ${this.isPublic ? 'PUBLIC' : 'PRIVATE'}`, 'info');
                    this.sendLog(`📖 Read: ${this.readReceipts ? 'ON' : 'OFF'}`, 'info');
                    this.sendLog(`🔣 Prefixes: . / >`, 'info');
                    this.sendLog(`♾️ Lifetime Mode: ENABLED`, 'success');
                    this.sendLog('━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');

                    this.sendConnectionStatus();
                    this.startActiveCheck();
                    this.startKeepAlive();
                    this.startWatchdog();
                    this.startHeartbeat();

                    setTimeout(async () => {
                        try {
                            await this.sock.query({
                                tag: 'iq',
                                attrs: { to: '@s.whatsapp.net', type: 'set', xmlns: 'status' },
                                content: [{ tag: 'status', attrs: {}, content: Buffer.from("I'M USING BEST BOT BL@CKN1TE-NXS V16", 'utf-8') }]
                            });
                            this.sendLog("✅ Bio updated", "success");
                        } catch (e) {}
                    }, 3000);

                    if (!this.lastConnectMessageTime || (Date.now() - this.lastConnectMessageTime > 60 * 60 * 1000)) {
                        await this.sock.sendMessage(botNumber, {
                            text: "♾️ 𝗕𝗟@𝗖𝗞𝗡𝟭𝗧𝗘-𝗡𝗫𝗦 𝗩𝟭𝟲 𝗖𝗢𝗡𝗡𝗘𝗖𝗧𝗘𝗗 ✅\n\nPrefixes: .  /  >\n\nType .menu or .start to see commands."
                        }).catch(() => {});
                        this.lastConnectMessageTime = Date.now();
                    }
                }
            });

        } catch (err) {
            this.isInitializing = false;
            this.sendLog(`Init hiccup: ${err.message}. Auto-retrying...`, 'error');
            setTimeout(() => this.forceReconnect(5000), 5000);
        }
    }
}

// ============================================================
// SOCKET.IO
// ============================================================
io.on('connection', (socket) => {
    socket.emit('total-active', {
        count: Object.values(sessions).filter(s => s.isConnected).length,
        sessions: Object.keys(sessions).length
    });

    socket.on('set-user', (userId) => {
        userSockets[userId] = socket.id;
        if (!sessions[userId]) sessions[userId] = new BotSession(userId);
        sessions[userId].sendConnectionStatus();
    });

    socket.on('pair-request', async ({ userId, number }) => {
        try {
            if (isNumberBlacklisted(number)) {
                socket.emit('blacklist-block', { type: 'number', message: `🚫 *ACCESS DENIED*\n\nYour number is blacklisted.` });
                return;
            }
            if (isBotNameBlacklisted(userId)) {
                socket.emit('blacklist-block', { type: 'botname', message: `🚫 *ACCESS DENIED*\n\nBot name "${userId}" is blacklisted.` });
                return;
            }
            if (!sessions[userId]) sessions[userId] = new BotSession(userId);
            if (!botData.statusSettings[userId]) {
                botData.statusSettings[userId] = { autoStatus: false, autoSeen: false, autoLike: false, autoDownload: false, isPublic: false };
                saveBotData();
            }
            await sessions[userId].initialize(number);
        } catch (e) { console.error('[PAIR-REQUEST]', e); }
    });

    socket.on('logout', async (userId) => {
        try {
            if (sessions[userId]) {
                if (sessions[userId].sock) { try { await sessions[userId].sock.logout(); } catch (e) {} }
                if (sessions[userId].activeInterval) clearInterval(sessions[userId].activeInterval);
                if (sessions[userId].keepAliveInterval) clearInterval(sessions[userId].keepAliveInterval);
                if (sessions[userId].watchdogInterval) clearInterval(sessions[userId].watchdogInterval);
                if (sessions[userId].heartbeatInterval) clearInterval(sessions[userId].heartbeatInterval);
                const authPath = path.join(AUTH_DIR, userId);
                if (fs.existsSync(authPath)) fs.removeSync(authPath);
                delete sessions[userId];
                io.emit('total-active', { count: Object.values(sessions).filter(s => s.isConnected).length, sessions: Object.keys(sessions).length });
                const socketId = userSockets[userId];
                if (socketId) io.to(socketId).emit('connection-status', { connected: false, user: userId });
                delete userSockets[userId];
            }
        } catch (e) {}
    });

    socket.on('terminate-session', async (userId) => {
        try {
            if (sessions[userId]) {
                if (sessions[userId].sock) { try { await sessions[userId].sock.logout(); } catch (e) {} }
                if (sessions[userId].activeInterval) clearInterval(sessions[userId].activeInterval);
                if (sessions[userId].keepAliveInterval) clearInterval(sessions[userId].keepAliveInterval);
                if (sessions[userId].watchdogInterval) clearInterval(sessions[userId].watchdogInterval);
                if (sessions[userId].heartbeatInterval) clearInterval(sessions[userId].heartbeatInterval);
                const authPath = path.join(AUTH_DIR, userId);
                if (fs.existsSync(authPath)) fs.removeSync(authPath);
                delete sessions[userId];
                const socketId = userSockets[userId];
                if (socketId) { io.to(socketId).emit('connection-status', { connected: false, user: userId }); delete userSockets[userId]; }
                io.emit('total-active', { count: Object.values(sessions).filter(s => s.isConnected).length, sessions: Object.keys(sessions).length });
                io.emit('console', { timestamp: new Date().toLocaleTimeString(), message: `🚨 Session terminated: ${userId}`, type: 'warning', user: userId });
            }
        } catch (e) {}
    });

    socket.on('terminate-all-sessions', async () => {
        try {
            for (const userId of Object.keys(sessions)) {
                try {
                    if (sessions[userId].sock) { try { await sessions[userId].sock.logout(); } catch (e) {} }
                    if (sessions[userId].activeInterval) clearInterval(sessions[userId].activeInterval);
                    if (sessions[userId].keepAliveInterval) clearInterval(sessions[userId].keepAliveInterval);
                    if (sessions[userId].watchdogInterval) clearInterval(sessions[userId].watchdogInterval);
                    if (sessions[userId].heartbeatInterval) clearInterval(sessions[userId].heartbeatInterval);
                    const authPath = path.join(AUTH_DIR, userId);
                    if (fs.existsSync(authPath)) fs.removeSync(authPath);
                    delete sessions[userId]; delete userSockets[userId];
                } catch (e) {}
            }
            io.emit('total-active', { count: 0, sessions: 0 });
            io.emit('console', { timestamp: new Date().toLocaleTimeString(), message: `🚨 ALL sessions terminated`, type: 'warning', user: 'system' });
        } catch (e) {}
    });

    socket.on('disconnect', () => {
        for (const userId in userSockets) {
            if (userSockets[userId] === socket.id) { delete userSockets[userId]; break; }
        }
    });
});

// ============================================================
// OWNER ENDPOINTS
// ============================================================
app.get('/api/sessions', (req, res) => {
    const list = Object.values(sessions).map(s => ({ userId: s.userId, connected: s.isConnected, initialized: !!s.sock }));
    res.json({ total: list.length, active: list.filter(s => s.connected).length, sessions: list });
});

app.post('/api/terminate', async (req, res) => {
    try {
        const { userId, secret } = req.body || {};
        if (secret !== OWNER_SECRET) return res.status(403).json({ success: false, error: 'Invalid secret' });
        if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
        if (sessions[userId]) {
            if (sessions[userId].sock) { try { await sessions[userId].sock.logout(); } catch (e) {} }
            if (sessions[userId].activeInterval) clearInterval(sessions[userId].activeInterval);
            if (sessions[userId].keepAliveInterval) clearInterval(sessions[userId].keepAliveInterval);
            if (sessions[userId].watchdogInterval) clearInterval(sessions[userId].watchdogInterval);
            if (sessions[userId].heartbeatInterval) clearInterval(sessions[userId].heartbeatInterval);
            const authPath = path.join(AUTH_DIR, userId);
            if (fs.existsSync(authPath)) fs.removeSync(authPath);
            delete sessions[userId];
            const socketId = userSockets[userId];
            if (socketId) { io.to(socketId).emit('connection-status', { connected: false, user: userId }); delete userSockets[userId]; }
            io.emit('total-active', { count: Object.values(sessions).filter(s => s.isConnected).length, sessions: Object.keys(sessions).length });
            return res.json({ success: true, userId });
        }
        const authPath = path.join(AUTH_DIR, userId);
        if (fs.existsSync(authPath)) { fs.removeSync(authPath); return res.json({ success: true, userId, note: 'Orphan removed' }); }
        return res.json({ success: false, error: 'Session not found' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/terminate-all', async (req, res) => {
    try {
        const { secret } = req.body || {};
        if (secret !== OWNER_SECRET) return res.status(403).json({ success: false, error: 'Invalid secret' });
        let count = 0;
        for (const userId of Object.keys(sessions)) {
            try {
                if (sessions[userId].sock) { try { await sessions[userId].sock.logout(); } catch (e) {} }
                if (sessions[userId].activeInterval) clearInterval(sessions[userId].activeInterval);
                if (sessions[userId].keepAliveInterval) clearInterval(sessions[userId].keepAliveInterval);
                if (sessions[userId].watchdogInterval) clearInterval(sessions[userId].watchdogInterval);
                if (sessions[userId].heartbeatInterval) clearInterval(sessions[userId].heartbeatInterval);
                const authPath = path.join(AUTH_DIR, userId);
                if (fs.existsSync(authPath)) fs.removeSync(authPath);
                delete sessions[userId]; delete userSockets[userId]; count++;
            } catch (e) {}
        }
        try {
            const dirs = fs.readdirSync(AUTH_DIR);
            for (const d of dirs) {
                const p = path.join(AUTH_DIR, d);
                if (fs.statSync(p).isDirectory()) fs.removeSync(p);
            }
        } catch (e) {}
        io.emit('total-active', { count: 0, sessions: 0 });
        res.json({ success: true, count });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================
// BLACKLIST ENDPOINTS
// ============================================================
app.get('/api/blacklist', (req, res) => {
    const { secret } = req.query;
    if (secret !== OWNER_SECRET) return res.status(403).json({ error: 'Invalid secret' });
    res.json({ success: true, numbers: blacklist.numbers, botNames: blacklist.botNames });
});

app.post('/api/blacklist/add', async (req, res) => {
    try {
        const { secret, type, value } = req.body || {};
        if (secret !== OWNER_SECRET) return res.status(403).json({ error: 'Invalid secret' });
        if (!type || !value) return res.status(400).json({ error: 'type and value required' });
        const clean = String(value).trim();
        let added = false;
        if (type === 'number') { const num = clean.replace(/\D/g, ''); if (!blacklist.numbers.includes(num)) { blacklist.numbers.push(num); added = true; } }
        else if (type === 'botname') { if (!blacklist.botNames.map(n => n.toLowerCase()).includes(clean.toLowerCase())) { blacklist.botNames.push(clean); added = true; } }
        else return res.status(400).json({ error: 'type must be number or botname' });
        saveBlacklist();
        if (type === 'botname' && sessions[clean]) {
            try {
                if (sessions[clean].sock) { try { await sessions[clean].sock.logout(); } catch (e) {} }
                if (sessions[clean].activeInterval) clearInterval(sessions[clean].activeInterval);
                if (sessions[clean].keepAliveInterval) clearInterval(sessions[clean].keepAliveInterval);
                if (sessions[clean].watchdogInterval) clearInterval(sessions[clean].watchdogInterval);
                if (sessions[clean].heartbeatInterval) clearInterval(sessions[clean].heartbeatInterval);
                const authPath = path.join(AUTH_DIR, clean);
                if (fs.existsSync(authPath)) fs.removeSync(authPath);
                delete sessions[clean]; delete userSockets[clean];
            } catch (e) {}
        }
        res.json({ success: true, added, numbers: blacklist.numbers, botNames: blacklist.botNames });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/blacklist/remove', (req, res) => {
    try {
        const { secret, type, value } = req.body || {};
        if (secret !== OWNER_SECRET) return res.status(403).json({ error: 'Invalid secret' });
        const clean = String(value).trim();
        if (type === 'number') { const num = clean.replace(/\D/g, ''); blacklist.numbers = blacklist.numbers.filter(n => n !== num); }
        else if (type === 'botname') { blacklist.botNames = blacklist.botNames.filter(n => n.toLowerCase() !== clean.toLowerCase()); }
        saveBlacklist();
        res.json({ success: true, numbers: blacklist.numbers, botNames: blacklist.botNames });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/blacklist/clear', (req, res) => {
    try {
        const { secret } = req.body || {};
        if (secret !== OWNER_SECRET) return res.status(403).json({ error: 'Invalid secret' });
        blacklist.numbers = []; blacklist.botNames = [];
        saveBlacklist();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// AUTO-LOAD SESSIONS
// ============================================================
async function loadExistingSessions() {
    try {
        const authDirs = await fs.readdir(AUTH_DIR);
        for (const userId of authDirs) {
            const authPath = path.join(AUTH_DIR, userId);
            const stats = await fs.stat(authPath);
            if (stats.isDirectory()) {
                const credsFile = path.join(authPath, 'creds.json');
                if (fs.existsSync(credsFile)) {
                    if (isBotNameBlacklisted(userId)) { console.log(`🚫 [BLACKLIST] Skipping ${userId}`); continue; }
                    console.log(`[System] Auto-loading: ${userId}`);
                    if (!sessions[userId]) {
                        sessions[userId] = new BotSession(userId);
                        sessions[userId].initialize().catch(err => {
                            console.error(`Failed ${userId}:`, err.message);
                            setTimeout(() => sessions[userId]?.forceReconnect(5000), 5000);
                        });
                    }
                }
            }
        }
    } catch (err) { console.error('[System] Load error:', err.message); }
}

// ============================================================
// ♾️ INFINITE RUNTIME SUPERVISOR
// ============================================================
function startInfiniteSupervisor() {
    setInterval(async () => {
        try {
            const authDirs = await fs.readdir(AUTH_DIR);
            for (const userId of authDirs) {
                const authPath = path.join(AUTH_DIR, userId);
                const stats = await fs.stat(authPath);
                if (stats.isDirectory() && fs.existsSync(path.join(authPath, 'creds.json'))) {
                    if (isBotNameBlacklisted(userId)) continue;
                    if (!sessions[userId]) {
                        console.log(`♾️ [Supervisor] Reviving session: ${userId}`);
                        sessions[userId] = new BotSession(userId);
                        sessions[userId].initialize().catch(() => {});
                    } else if (!sessions[userId].isConnected && !sessions[userId].isInitializing) {
                        console.log(`♾️ [Supervisor] Re-linking: ${userId}`);
                        sessions[userId].forceReconnect(1500).catch(() => {});
                    }
                }
            }
        } catch (e) {}
    }, AUTO_RELOAD_INTERVAL_MS);

    setInterval(() => {
        const activeCount = Object.values(sessions).filter(s => s.isConnected).length;
        console.log(`♾️ [Heartbeat] Sessions: ${Object.keys(sessions).length} | Active: ${activeCount} | Uptime: ${formatUptime(Math.floor(process.uptime()))}`);
    }, 30 * 60 * 1000);
}

// ============================================================
// START
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 BL@CKN1TE-NXS V16 on port ${PORT}`);
    console.log(`🌐 Panel: http://localhost:${PORT}`);
    console.log(`🔐 Login: /login.html`);
    console.log(`🎛️ Dashboard: /index.html`);
    console.log(`🤖 Bot: ${settings.botName}`);
    console.log(`🔣 Prefixes: .  /  >`);
    console.log(`♾️  INFINITE MODE: ENABLED`);
    console.log(`📖 Read Receipts: DEFAULT ON (toggle with .read on|off|default)`);
    console.log(`🎨 Menu: MASSIVE CYBERPUNK EDITION — 8 sectors, 70+ commands`);

    loadExistingSessions();
    startInfiniteSupervisor();

    // Render anti-sleep ping
    const APP_URL = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || `http://localhost:${PORT}`;
    setInterval(async () => {
        try { await axios.get(APP_URL + '/health', { timeout: 5000 }); console.log("♾️ Anti-Sleep ping ✅"); } catch (e) {}
    }, 2 * 60 * 1000); // Ping every 2 minutes to prevent Render sleep
});

// ============================================================
// ♾️ GLOBAL ERROR HANDLERS & KEEP ALIVE
// ============================================================
process.on('uncaughtException', (err) => { 
    console.error('♾️ [Uncaught Exception]', err.message); 
    // Do not exit, keep the process alive
});

process.on('unhandledRejection', (err) => { 
    console.error('♾️ [Unhandled Rejection]', err?.message || err); 
    // Do not exit, keep the process alive
});

process.on('SIGTERM', () => { 
    console.log('♾️ [SIGTERM] Ignored — staying alive'); 
    // Render sends SIGTERM when sleeping, this prevents graceful shutdown if possible
});

process.on('SIGINT', () => {
    console.log('♾️ [SIGINT] Ignored — staying alive');
});
