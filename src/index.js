require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const { client, registerCommands } = require('./bot');
const EmojiSorterService = require('./sorter');
const authRouter = require('./routes/auth');
const createApiRouter = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize sorter service with Discord client
const sorterService = new EmojiSorterService(client);

// Trust proxy for Render / HTTPS environments
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'discord-emoji-sorter-secret-default',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    secure: process.env.NODE_ENV === 'production' && !process.env.DISABLE_SECURE_COOKIE,
    sameSite: 'lax'
  }
}));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint (for Render / pingers)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    botReady: client.isReady(),
    botUser: client.user ? client.user.tag : null
  });
});

// App configuration endpoint for frontend
app.get('/api/config', (req, res) => {
  res.json({
    clientId: process.env.DISCORD_CLIENT_ID || null,
    hasToken: !!process.env.DISCORD_TOKEN
  });
});

// Mount routes
app.use('/auth', authRouter);
app.use('/api', createApiRouter(client, sorterService));

// Fallback to index.html for SPA-style routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start web server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Web] Dashboard running at http://0.0.0.0:${PORT}`);
});

// Login Discord Bot
if (process.env.DISCORD_TOKEN) {
  client.login(process.env.DISCORD_TOKEN)
    .then(() => {
      if (process.env.DISCORD_CLIENT_ID) {
        registerCommands(process.env.DISCORD_TOKEN, process.env.DISCORD_CLIENT_ID);
      }
    })
    .catch(err => {
      console.error('[Discord] Failed to connect bot:', err.message);
    });
} else {
  console.warn('[Discord] ⚠️ DISCORD_TOKEN не указан в .env файле. Веб-интерфейс запущен, но бот не подключен.');
}

module.exports = { app, server, client, sorterService };

