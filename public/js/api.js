/**
 * API client for interacting with the backend and SSE progress stream
 */
const API = {
  async getMe() {
    const res = await fetch('/api/me');
    if (!res.ok) throw new Error('Ошибка получения профиля');
    return res.json();
  },

  async getGuilds() {
    const res = await fetch('/api/guilds');
    if (!res.ok) throw new Error('Ошибка загрузки серверов');
    return res.json();
  },

  async refreshGuilds() {
    const res = await fetch('/api/guilds/refresh', { method: 'POST' });
    if (!res.ok) throw new Error('Ошибка обновления серверов');
    return res.json();
  },

  async getGuildEmojis(guildId) {
    const res = await fetch(`/api/guilds/${guildId}/emojis`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка загрузки эмодзи');
    }
    return res.json();
  },

  async startSort(guildId, emojiIds, options) {
    const res = await fetch(`/api/guilds/${guildId}/sort`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emojiIds, options })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Ошибка запуска сортировки');
    }
    return data;
  },

  async abortSort(guildId) {
    const res = await fetch(`/api/guilds/${guildId}/sort/abort`, {
      method: 'POST'
    });
    return res.json();
  },

  subscribeProgress(guildId, onUpdate) {
    const eventSource = new EventSource(`/api/guilds/${guildId}/sort/progress`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onUpdate(data);
      } catch (e) {
        console.error('Error parsing SSE event:', e);
      }
    };

    eventSource.onerror = (err) => {
      console.warn('SSE connection error:', err);
    };

    return () => {
      eventSource.close();
    };
  }
};
