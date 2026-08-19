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

let sock = null;
let pairingPromise = null;

async function startBot(phoneNumber) {
    const sessionPath = "./session";

    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
    }

    const { state, saveCreds } =
        await useMultiFileAuthState(sessionPath);

    sock = makeWASocket({
        auth: state,
        logger: P({ level: "silent" }),
        browser: ["ROBIN MD", "Chrome", "1.0.0"],
        markOnlineOnConnect: false
    });

    sock.ev.on("creds.update", saveCreds);

    /*
     * Pairing Code
     */
    if (phoneNumber && !state.creds.registered) {

        const number = String(phoneNumber)
            .replace(/\D/g, "");

        if (!number) {
            throw new Error("Invalid phone number");
        }

        console.log("Waiting for WhatsApp connection...");

        pairingPromise = new Promise((resolve, reject) => {

            let finished = false;

            const timer = setTimeout(async () => {
                try {

                    if (finished) return;

                    const code =
                        await sock.requestPairingCode(number);

                    finished = true;

                    console.log(
                        "ROBIN MD Pairing Code:",
                        code
                    );

                    resolve(code);

                } catch (err) {

                    if (!finished) {
                        finished = true;
                        reject(err);
                    }

                }
            }, 5000);

        });
    }

    /*
     * Connection
     */
    sock.ev.on("connection.update", async (update) => {

        const {
            connection,
            lastDisconnect
        } = update;

        if (connection === "connecting") {
            console.log("ROBIN MD connecting...");
        }

        if (connection === "open") {
            console.log("✅ ROBIN MD Connected!");
        }

        if (connection === "close") {

            const code =
                lastDisconnect?.error?.output?.statusCode;

            console.log(
                "Connection closed:",
                code
            );

            if (code !== DisconnectReason.loggedOut) {

                console.log(
                    "🔄 Reconnecting..."
                );

                setTimeout(() => {
                    startBot();
                }, 3000);

            } else {

                console.log(
                    "❌ Logged out."
                );
            }
        }
    });

    /*
     * Commands
     */
    sock.ev.on("messages.upsert", async ({ messages }) => {

        try {

            const msg = messages[0];

            if (!msg?.message) return;
            if (msg.key.fromMe) return;

            const jid = msg.key.remoteJid;

            const text =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                "";

            const command =
                text.trim().toLowerCase();

            console.log(
                `📩 ${command} | ${jid}`
            );

            /*
             * PING
             */
            if (command === ".ping") {

                await sock.sendMessage(jid, {
                    text:
`🏓 *ROBIN MD*

⚡ Pong!
🤖 Bot Online`
                });
            }

            /*
             * ALIVE
             */
            else if (command === ".alive") {

                await sock.sendMessage(jid, {
                    text:
`╭━━〔 🤖 ROBIN MD 〕━━╮

┃ ✅ Status : Online
┃ ⚡ Engine : Baileys
┃ 🚀 Version : 1.0.0

╰━━━━━━━━━━━━━━━━━━╯`
                });
            }

            /*
             * MENU
             */
            else if (command === ".menu") {

                await sock.sendMessage(jid, {
                    text:
`╭━━━〔 🤖 ROBIN MD 〕━━━╮

┃ ⚡ .ping
┃ 🤖 .alive
┃ 📋 .menu

╰━━━━━━━━━━━━━━━━━━━━╯`
                });
            }

        } catch (err) {
            console.error(
                "Message error:",
                err
            );
        }
    });

    /*
     * Return pairing code
     */
    if (pairingPromise) {
        return await pairingPromise;
    }

    return null;
}


/*
 * Pair Page
 */
app.get("/pair", (req, res) => {

    res.sendFile(
        path.join(__dirname, "pair.html")
    );

});


/*
 * Pair API
 */
app.post("/pair", async (req, res) => {

    try {

        const { number } = req.body;

        if (!number) {

            return res.status(400).json({
                success: false,
                message: "Phone number required"
            });

        }

        const cleanNumber =
            String(number).replace(/\D/g, "");

        if (cleanNumber.length < 10) {

            return res.status(400).json({
                success: false,
                message: "Invalid phone number"
            });

        }

        /*
         * Don't create multiple sockets
         */
        if (
            sock &&
            sock.authState?.creds?.registered
        ) {

            return res.json({
                success: false,
                message: "Bot already paired"
            });

        }

        const code =
            await startBot(cleanNumber);

        return res.json({
            success: true,
            code: code
        });

    } catch (error) {

        console.error(
            "PAIR ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error?.message ||
                "Failed to generate pairing code"
        });
    }
});


/*
 * Home
 */
app.get("/", (req, res) => {
    res.redirect("/pair");
});


/*
 * Server
 */
app.listen(PORT, () => {

    console.log(
        `🤖 ROBIN MD running on port ${PORT}`
    );

});
