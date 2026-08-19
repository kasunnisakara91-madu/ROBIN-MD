const express = require("express");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require("@whiskeysockets/baileys");
const P = require("pino");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock;

async function startBot(phoneNumber = null) {
    const sessionPath = "./session";

    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
    }

    const { state, saveCreds } =
        await useMultiFileAuthState(sessionPath);

    sock = makeWASocket({
        auth: state,
        logger: P({ level: "silent" }),
        browser: ["ROBIN MD", "Chrome", "1.0.0"]
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
            console.log("ROBIN MD Connected!");
        }

        if (connection === "close") {
            const code =
                lastDisconnect?.error?.output?.statusCode;

            if (code !== DisconnectReason.loggedOut) {
                console.log("Reconnecting...");
                startBot();
            }
        }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];

        if (!msg?.message) return;
        if (msg.key.fromMe) return;

        const jid = msg.key.remoteJid;

        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            "";

        const command = text.trim().toLowerCase();

        if (command === ".ping") {
            await sock.sendMessage(jid, {
                text: "🏓 ROBIN MD\n\nPong! ⚡"
            });
        }

        if (command === ".alive") {
            await sock.sendMessage(jid, {
                text:
`🤖 ROBIN MD

✅ Bot Online
⚡ Baileys
🚀 Version 1.0.0`
            });
        }

        if (command === ".menu") {
            await sock.sendMessage(jid, {
                text:
`╭━━━〔 🤖 ROBIN MD 〕━━━╮

┃ ⚡ .ping
┃ 🤖 .alive
┃ 📋 .menu

╰━━━━━━━━━━━━━━━━━━━━╯`
            });
        }
    });

    // Pairing Code
    if (phoneNumber && !sock.authState.creds.registered) {
        const number = phoneNumber.replace(/[^0-9]/g, "");

        try {
            const code =
                await sock.requestPairingCode(number);

            console.log("PAIRING CODE:", code);
            return code;
        } catch (error) {
            console.error("Pairing error:", error);
            throw error;
        }
    }
}

// Pair page
app.get("/pair", (req, res) => {
    res.sendFile(path.join(__dirname, "pair.html"));
});

// Pairing API
app.post("/pair", async (req, res) => {
    try {
        const { number } = req.body;

        if (!number) {
            return res.status(400).json({
                success: false,
                message: "Phone number required"
            });
        }

        const code = await startBot(number);

        res.json({
            success: true,
            code: code
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Failed to generate pairing code"
        });
    }
});

app.get("/", (req, res) => {
    res.redirect("/pair");
});

app.listen(PORT, () => {
    console.log(`ROBIN MD running on port ${PORT}`);
});
