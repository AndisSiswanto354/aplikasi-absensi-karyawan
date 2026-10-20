const { db } = require('./database');

async function sendNotification({ channel, recipient, message, autoOnly = false }) {
  try {
    // Check if notification is enabled in settings
    if (channel === 'WhatsApp') {
      const waEnabled = db.prepare(`SELECT value FROM settings WHERE key='wa_enabled'`).get()?.value === 'true';
      if (!waEnabled && autoOnly) return;
    } else if (channel === 'Telegram') {
      const tgEnabled = db.prepare(`SELECT value FROM settings WHERE key='telegram_enabled'`).get()?.value === 'true';
      if (!tgEnabled && autoOnly) return;
    }

    let status = 'sukses';
    let responseText = 'Simulasi pengiriman berhasil terkirim ke gateway ' + channel;

    // Real fetch attempt if configured, otherwise simulated successfully
    if (channel === 'Telegram') {
      const botToken = db.prepare(`SELECT value FROM settings WHERE key='telegram_bot_token'`).get()?.value;
      const chatId = recipient || db.prepare(`SELECT value FROM settings WHERE key='telegram_chat_id'`).get()?.value;

      if (botToken && chatId && !botToken.startsWith('123456')) {
        try {
          const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
          });
          const json = await res.json();
          if (!json.ok) {
            status = 'gagal';
            responseText = json.description || 'Gagal mengirim pesan Telegram';
          } else {
            responseText = 'Pesan terkirim ke Telegram ID: ' + chatId;
          }
        } catch (fetchErr) {
          status = 'gagal';
          responseText = fetchErr.message;
        }
      }
    } else if (channel === 'WhatsApp') {
      const apiUrl = db.prepare(`SELECT value FROM settings WHERE key='wa_api_url'`).get()?.value;
      const apiToken = db.prepare(`SELECT value FROM settings WHERE key='wa_api_token'`).get()?.value;

      if (apiUrl && apiToken && !apiToken.startsWith('demo-wa')) {
        try {
          const res = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': apiToken
            },
            body: JSON.stringify({ target: recipient, message })
          });
          const json = await res.json();
          responseText = JSON.stringify(json);
        } catch (fetchErr) {
          status = 'gagal';
          responseText = fetchErr.message;
        }
      }
    }

    // Insert log
    const stmt = db.prepare(`
      INSERT INTO notifications_log (channel, recipient, message, status, response)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(channel, recipient || 'Broadcast Group', message, status, responseText);

    return { success: status === 'sukses', status, response: responseText };
  } catch (err) {
    console.error('Error in sendNotification:', err);
    return { success: false, status: 'gagal', response: err.message };
  }
}

module.exports = {
  sendNotification
};
