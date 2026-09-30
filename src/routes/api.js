const express = require('express');
const router = express.Router();
const { stripPrefix } = require('../utils/emojiHelper');

// Permission bits
const MANAGE_EXPRESSIONS_BIT = 1n << 30n; // 1073741824n
const ADMINISTRATOR_BIT = 1n << 3n;        // 8n

function hasGuildPermission(permissionsBigInt, isOwner) {
  if (isOwner) return true;
  return (permissionsBigInt & ADMINISTRATOR_BIT) !== 0n || 
         (permissionsBigInt & MANAGE_EXPRESSIONS_BIT) !== 0n;
}

module.exports = function(botClient, sorterService) {
  // Middleware to ensure user is logged in
  function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'Необходима авторизация через Discord' });
    }
    next();
  }

  // Get current user profile
  router.get('/me', (req, res) => {
    if (!req.session || !req.session.user) {
      return res.json({ authenticated: false, user: null });
    }
    const { id, username, globalName, avatar } = req.session.user;
    res.json({
      authenticated: true,
      user: { id, username, globalName, avatar }
    });
  });

  // Get bot invite URL
  router.get('/invite', (req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const guildId = req.query.guild_id;
    let url = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=1073741824&scope=bot%20applications.commands`;
    if (guildId) {
      url += `&guild_id=${guildId}&disable_guild_select=true`;
    }
    res.json({ url });
  });

  // Get list of manageable guilds
  router.get('/guilds', requireAuth, (req, res) => {
    const userGuilds = req.session.user.guilds || [];
    const botGuilds = botClient.guilds.cache;

    const manageableGuilds = userGuilds
      .filter(g => {
        const perms = BigInt(g.permissions || '0');
        return hasGuildPermission(perms, g.owner);
      })
      .map(g => {
        const botGuild = botGuilds.get(g.id);
        const botInGuild = !!botGuild;
        let botCanManage = false;

        if (botGuild) {
          const botMember = botGuild.members.me;
          if (botMember) {
            botCanManage = botMember.permissions.has('ManageGuildExpressions') || 
                           botMember.permissions.has('Administrator');
          }
        }

        const iconUrl = g.icon 
          ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128`
          : null;

        return {
          id: g.id,
          name: g.name,
          icon: iconUrl,
          isOwner: g.owner,
          botInGuild,
          botCanManage,
          inviteUrl: `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&permissions=1073741824&scope=bot%20applications.commands&guild_id=${g.id}&disable_guild_select=true`
        };
      });

    res.json({ guilds: manageableGuilds });
  });

  // Refresh user guilds from Discord API
  router.post('/guilds/refresh', requireAuth, async (req, res) => {
    try {
      const accessToken = req.session.user.accessToken;
      const guildsRes = await fetch('https://discord.com/api/v10/users/@me/guilds', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!guildsRes.ok) {
        return res.status(guildsRes.status).json({ error: 'Не удалось обновить список серверов в Discord' });
      }
      const userGuilds = await guildsRes.json();
      req.session.user.guilds = Array.isArray(userGuilds) ? userGuilds : [];
      req.session.save(() => {
        res.json({ success: true, count: req.session.user.guilds.length });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Verify access to a specific guild
  async function checkGuildAccess(req, res, guildId) {
    const userGuilds = req.session.user.guilds || [];
    const targetGuild = userGuilds.find(g => g.id === guildId);
    if (!targetGuild) {
      res.status(403).json({ error: 'Вы не состоите на данном сервере!' });
      return null;
    }

    const perms = BigInt(targetGuild.permissions || '0');
    if (!hasGuildPermission(perms, targetGuild.owner)) {
      res.status(403).json({ error: 'У вас нет прав "Управлять выражениями" на этом сервере!' });
      return null;
    }

    const guild = await botClient.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      res.status(404).json({ error: 'Бот не добавлен на данный сервер. Пригласите бота!' });
      return null;
    }

    const botMember = await guild.members.fetchMe().catch(() => null);
    if (!botMember || (!botMember.permissions.has('ManageGuildExpressions') && !botMember.permissions.has('Administrator'))) {
      res.status(403).json({ error: 'У бота нет прав "Управлять выражениями" (Manage Expressions) на этом сервере!' });
      return null;
    }

    return guild;
  }

  // Get emojis of a guild
  router.get('/guilds/:guildId/emojis', requireAuth, async (req, res) => {
    try {
      const guild = await checkGuildAccess(req, res, req.params.guildId);
      if (!guild) return;

      const emojis = await guild.emojis.fetch();
      
      const emojiList = emojis.map(e => ({
        id: e.id,
        name: e.name,
        cleanName: stripPrefix(e.name),
        animated: e.animated,
        url: e.imageURL({ size: 64 }),
        fullUrl: e.imageURL({ size: 128 }),
        managed: e.managed, // Twitch/external integration emojis
        available: e.available,
        createdAt: e.createdTimestamp
      }));

      // Sort by current Discord order (alphabetical by name)
      emojiList.sort((a, b) => a.name.localeCompare(b.name));

      res.json({
        guild: {
          id: guild.id,
          name: guild.name,
          icon: guild.iconURL({ size: 128 }),
          memberCount: guild.memberCount,
          maxEmojis: guild.premiumTier === 3 ? 250 : guild.premiumTier === 2 ? 150 : guild.premiumTier === 1 ? 100 : 50
        },
        emojis: emojiList
      });
    } catch (err) {
      console.error('Error fetching emojis:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Start sorting process
  router.post('/guilds/:guildId/sort', requireAuth, async (req, res) => {
    try {
      const guild = await checkGuildAccess(req, res, req.params.guildId);
      if (!guild) return;

      const { emojiIds, options } = req.body;
      if (!Array.isArray(emojiIds) || emojiIds.length === 0) {
        return res.status(400).json({ error: 'Список эмодзи пуст' });
      }

      await sorterService.startSorting(req.params.guildId, emojiIds, options || {});
      res.json({ success: true, message: 'Сортировка успешно запущена' });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Abort sorting process
  router.post('/guilds/:guildId/sort/abort', requireAuth, async (req, res) => {
    try {
      const success = sorterService.abortJob(req.params.guildId);
      res.json({ success });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Real-time SSE progress stream
  router.get('/guilds/:guildId/sort/progress', requireAuth, (req, res) => {
    const guildId = req.params.guildId;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Prevent NGINX / proxy buffering
    });

    const sendEvent = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Send current status immediately if job exists
    const currentJob = sorterService.getJob(guildId);
    if (currentJob) {
      sendEvent({
        status: currentJob.status,
        current: currentJob.current,
        total: currentJob.total,
        successCount: currentJob.successCount,
        skippedCount: currentJob.skippedCount,
        failedCount: currentJob.failedCount,
        currentEmoji: currentJob.currentEmoji,
        logs: currentJob.logs.slice(0, 30),
        isDone: ['completed', 'aborted', 'failed'].includes(currentJob.status)
      });
    } else {
      sendEvent({ status: 'idle' });
    }

    const onProgress = (data) => {
      sendEvent(data);
    };

    sorterService.on(`progress:${guildId}`, onProgress);

    req.on('close', () => {
      sorterService.off(`progress:${guildId}`, onProgress);
    });
  });

  return router;
};
