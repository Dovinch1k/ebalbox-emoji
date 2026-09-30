const express = require('express');
const router = express.Router();

function getOAuthRedirectUri(req) {
  if (process.env.DISCORD_REDIRECT_URI) {
    return process.env.DISCORD_REDIRECT_URI;
  }
  // Fallback to Render external URL or request host
  const host = process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;
  return `${host}/auth/callback`;
}

router.get('/login', (req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return res.status(500).send('DISCORD_CLIENT_ID не настроен в переменных окружения.');
  }

  const redirectUri = getOAuthRedirectUri(req);
  const discordAuthUrl = new URL('https://discord.com/oauth2/authorize');
  discordAuthUrl.searchParams.set('client_id', clientId);
  discordAuthUrl.searchParams.set('redirect_uri', redirectUri);
  discordAuthUrl.searchParams.set('response_type', 'code');
  discordAuthUrl.searchParams.set('scope', 'identify guilds');
  discordAuthUrl.searchParams.set('prompt', 'consent');

  res.redirect(discordAuthUrl.toString());
});

router.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.redirect('/?error=no_code');
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = getOAuthRedirectUri(req);

  try {
    const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: code.toString(),
        redirect_uri: redirectUri
      })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      console.error('Discord OAuth2 token error:', tokenData);
      return res.redirect(`/?error=oauth_failed&desc=${encodeURIComponent(tokenData.error_description || tokenData.error || 'Failed to exchange token')}`);
    }

    const accessToken = tokenData.access_token;

    // Fetch user details
    const userRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const userData = await userRes.json();

    // Fetch user guilds
    const guildsRes = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const userGuilds = await guildsRes.json();

    req.session.user = {
      id: userData.id,
      username: userData.username,
      globalName: userData.global_name || userData.username,
      avatar: userData.avatar 
        ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png` 
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(userData.discriminator || '0', 10) % 5}.png`,
      accessToken,
      guilds: Array.isArray(userGuilds) ? userGuilds : []
    };

    req.session.save((err) => {
      if (err) console.error('Session save error:', err);
      res.redirect('/');
    });
  } catch (error) {
    console.error('Error during Discord OAuth callback:', error);
    res.redirect(`/?error=server_error&desc=${encodeURIComponent(error.message)}`);
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
