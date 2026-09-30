const { Client, GatewayIntentBits, ActivityType, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildEmojisAndStickers
  ]
});

// Register slash command /dashboard on bot ready
async function registerCommands(token, clientId) {
  if (!token || !clientId) return;

  const commands = [
    new SlashCommandBuilder()
      .setName('dashboard')
      .setDescription('Получить ссылку на веб-интерфейс сортировки эмодзи')
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    console.log('[Discord] Registering global slash commands...');
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('[Discord] Slash commands registered successfully.');
  } catch (error) {
    console.error('[Discord] Failed to register slash commands:', error);
  }
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'dashboard') {
    const dashboardUrl = process.env.BASE_URL || (process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`);
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Открыть панель сортировки')
        .setStyle(ButtonStyle.Link)
        .setURL(dashboardUrl)
    );

    await interaction.reply({
      content: '✨ **Панель управления эмодзи**\nПерейдите в веб-интерфейс для сортировки, фильтрации и переименования эмодзи сервера:',
      components: [row],
      ephemeral: true
    });
  }
});

client.on('ready', () => {
  console.log(`[Discord] Logged in as ${client.user.tag}! Active in ${client.guilds.cache.size} guilds.`);
  client.user.setActivity('сортировку эмодзи ✨', { type: ActivityType.Custom });
});

module.exports = {
  client,
  registerCommands
};
