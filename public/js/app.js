/**
 * Main Frontend Application Logic
 */

// Helper to format name matching backend logic for instant live preview
function clientFormatEmojiName(originalName, index, options = {}) {
  const digits = parseInt(options.digits, 10) || 4;
  const separator = '_';
  const startIndex = parseInt(options.startIndex, 10) || 1;
  const stripExisting = options.stripExisting !== false;

  const currentNumber = startIndex + (index - 1);
  const prefix = String(currentNumber).padStart(digits, '0') + separator;

  let baseName = originalName;
  if (stripExisting) {
    const match = originalName.match(/^(\d{1,6})[_\-\s\.]+(.*)$/);
    if (match && match[2]) {
      baseName = match[2];
    }
  }

  // Transliteration helper for Russian characters
  const ruMap = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };

  let transliterated = baseName.split('').map(c => {
    const lower = c.toLowerCase();
    if (ruMap[lower] !== undefined) {
      return c === c.toUpperCase() ? ruMap[lower].toUpperCase() : ruMap[lower];
    }
    return c;
  }).join('');

  let sanitized = transliterated.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  if (!sanitized) sanitized = 'emoji';

  const maxBaseLength = Math.max(1, 32 - prefix.length);
  if (sanitized.length > maxBaseLength) {
    sanitized = sanitized.substring(0, maxBaseLength).replace(/_+$/, '');
  }

  return `${prefix}${sanitized}`;
}

const app = {
  user: null,
  guilds: [],
  currentGuild: null,
  emojis: [],           // Working ordered list of emojis
  originalEmojis: [],   // Pristine copy from Discord
  activeTab: 'all',     // 'all' | 'static' | 'animated'
  viewMode: 'cards',    // 'dense' (7TV mosaic) | 'cards' (7TV cards) | 'list'
  searchQuery: '',
  sortableInstance: null,
  progressUnsub: null,

  config: {
    digits: 4,
    separator: '_',
    startIndex: 1,
    stripExisting: true
  },

  async init() {
    this.readUrlParams();
    await this.checkAuth();
  },

  readUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error')) {
      const desc = params.get('desc') || params.get('error');
      this.showToast(`Ошибка входа: ${desc}`, 'error');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  },

  async checkAuth() {
    try {
      const data = await API.getMe();
      if (data.authenticated && data.user) {
        this.user = data.user;
        this.renderNavUser();
        await this.loadGuilds();
      } else {
        this.renderNavLogin();
        this.showView('view-hero');
      }
    } catch (e) {
      console.error(e);
      this.renderNavLogin();
      this.showView('view-hero');
    }
  },

  renderNavUser() {
    const container = document.getElementById('nav-user-container');
    container.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2 bg-discord-secondary py-1.5 px-3 rounded-xl border border-discord-card">
          <img src="${this.user.avatar}" alt="Avatar" class="w-7 h-7 rounded-full bg-discord-dark">
          <span class="text-sm font-semibold text-white max-w-[120px] truncate">${this.user.globalName || this.user.username}</span>
        </div>
        <a href="/auth/logout" class="p-2 rounded-xl bg-discord-secondary hover:bg-discord-card text-discord-muted hover:text-discord-red transition" title="Выйти">
          <i data-lucide="log-out" class="w-4 h-4"></i>
        </a>
      </div>
    `;
    lucide.createIcons();
  },

  renderNavLogin() {
    const container = document.getElementById('nav-user-container');
    container.innerHTML = `
      <a href="/auth/login" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-discord-blurple hover:bg-discord-blurple-hover shadow-md transition">
        <i data-lucide="log-in" class="w-4 h-4"></i>
        Войти
      </a>
    `;
    lucide.createIcons();
  },

  showView(viewId) {
    ['view-hero', 'view-guilds', 'view-dashboard'].forEach(id => {
      const el = document.getElementById(id);
      if (id === viewId) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });
  },

  async loadGuilds() {
    this.showView('view-guilds');
    document.getElementById('guilds-loading').classList.remove('hidden');
    document.getElementById('guilds-list').classList.add('hidden');
    document.getElementById('guilds-empty').classList.add('hidden');

    try {
      const data = await API.getGuilds();
      this.guilds = data.guilds || [];
      this.renderGuilds();
    } catch (e) {
      this.showToast(e.message, 'error');
    } finally {
      document.getElementById('guilds-loading').classList.add('hidden');
    }
  },

  async refreshGuilds() {
    const icon = document.getElementById('refresh-icon');
    if (icon) icon.classList.add('animate-spin');
    try {
      await API.refreshGuilds();
      await this.loadGuilds();
      this.showToast('Список серверов успешно обновлен', 'success');
    } catch (e) {
      this.showToast(e.message, 'error');
    } finally {
      if (icon) icon.classList.remove('animate-spin');
    }
  },

  renderGuilds() {
    const listEl = document.getElementById('guilds-list');
    const emptyEl = document.getElementById('guilds-empty');

    if (this.guilds.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }

    listEl.innerHTML = this.guilds.map(guild => {
      const initial = guild.name.split(' ').map(w => w[0]).join('').substring(0, 3);
      const iconHtml = guild.icon
        ? `<img src="${guild.icon}" alt="${guild.name}" class="w-12 h-12 rounded-2xl object-cover bg-discord-dark">`
        : `<div class="w-12 h-12 rounded-2xl bg-discord-card text-white font-bold flex items-center justify-center text-sm">${initial}</div>`;

      let actionHtml = '';
      if (!guild.botInGuild) {
        actionHtml = `
          <a href="${guild.inviteUrl}" target="_blank" class="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-discord-blurple/20 text-discord-blurple hover:bg-discord-blurple hover:text-white transition">
            <i data-lucide="user-plus" class="w-4 h-4"></i>
            Пригласить бота
          </a>
        `;
      } else if (!guild.botCanManage) {
        actionHtml = `
          <div class="mt-4 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl text-center">
            ⚠️ Нужны права «Управлять выражениями»
          </div>
        `;
      } else {
        actionHtml = `
          <button onclick="app.selectGuild('${guild.id}')" class="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-discord-blurple hover:bg-discord-blurple-hover text-white shadow-md shadow-discord-blurple/20 transition">
            <i data-lucide="sparkles" class="w-4 h-4"></i>
            Управлять эмодзи
          </button>
        `;
      }

      return `
        <div class="bg-discord-secondary/70 border border-discord-card hover:border-discord-blurple/40 p-5 rounded-2xl transition flex flex-col justify-between shadow-md">
          <div class="flex items-center gap-3.5">
            ${iconHtml}
            <div class="flex-1 min-w-0">
              <h4 class="text-white font-bold text-base truncate">${guild.name}</h4>
              <div class="flex items-center gap-1.5 mt-0.5">
                <span class="w-2 h-2 rounded-full ${guild.botInGuild ? 'bg-emerald-500' : 'bg-discord-muted'}"></span>
                <span class="text-xs text-discord-muted">${guild.botInGuild ? 'Бот добавлен' : 'Бот не добавлен'}</span>
              </div>
            </div>
          </div>
          ${actionHtml}
        </div>
      `;
    }).join('');

    listEl.classList.remove('hidden');
    lucide.createIcons();
  },

  showGuildSelect() {
    if (this.user) {
      this.showView('view-guilds');
    } else {
      this.showView('view-hero');
    }
  },

  async selectGuild(guildId) {
    this.currentGuild = this.guilds.find(g => g.id === guildId);
    if (!this.currentGuild) return;

    // Reset filters
    this.activeTab = 'all';
    this.searchQuery = '';
    const searchInput = document.getElementById('filter-search');
    if (searchInput) searchInput.value = '';

    this.showView('view-dashboard');

    // Set server header info
    document.getElementById('dash-guild-name').innerText = this.currentGuild.name;
    const iconEl = document.getElementById('dash-guild-icon');
    if (this.currentGuild.icon) {
      iconEl.src = this.currentGuild.icon;
      iconEl.classList.remove('hidden');
    } else {
      iconEl.classList.add('hidden');
    }

    try {
      const data = await API.getGuildEmojis(guildId);
      this.originalEmojis = [...data.emojis];
      this.emojis = [...data.emojis];
      this.updateStats();
      this.renderEmojiGrid();
      this.initSortable();
    } catch (e) {
      this.showToast(e.message, 'error');
      this.showGuildSelect();
    }
  },

  updateStats() {
    const total = this.emojis.length;
    const staticCount = this.emojis.filter(e => !e.animated).length;
    const animCount = this.emojis.filter(e => e.animated).length;

    document.getElementById('stat-total').innerText = `Всего: ${total}`;
    document.getElementById('stat-static').innerText = `🖼 Статичные: ${staticCount}`;
    document.getElementById('stat-animated').innerText = `🎬 Анимированные: ${animCount}`;
  },

  onFilterChange() {
    this.searchQuery = document.getElementById('filter-search').value.toLowerCase().trim();
    this.renderEmojiGrid();
  },

  setTab(tab) {
    this.activeTab = tab;
    ['all', 'static', 'animated'].forEach(t => {
      const btn = document.getElementById(`tab-${t}`);
      if (t === tab) {
        btn.className = 'px-3.5 py-1.5 rounded-lg bg-discord-blurple text-white transition';
      } else {
        btn.className = 'px-3.5 py-1.5 rounded-lg text-discord-muted hover:text-white transition';
      }
    });
    this.renderEmojiGrid();
  },

  onConfigChange() {
    this.config.digits = parseInt(document.getElementById('cfg-digits').value, 10) || 4;
    this.config.stripExisting = document.getElementById('cfg-strip').checked;
    this.updateCardBadges();
  },

  getFilteredEmojis() {
    return this.emojis.filter(emoji => {
      // Tab filter
      if (this.activeTab === 'static' && emoji.animated) return false;
      if (this.activeTab === 'animated' && !emoji.animated) return false;

      // Search filter
      if (this.searchQuery) {
        return emoji.name.toLowerCase().includes(this.searchQuery) ||
               emoji.cleanName.toLowerCase().includes(this.searchQuery);
      }
      return true;
    });
  },

  setViewMode(mode) {
    this.viewMode = mode;
    const container = document.getElementById('emoji-container');
    const btnDense = document.getElementById('view-mode-dense');
    const btnCards = document.getElementById('view-mode-cards');
    const btnList = document.getElementById('view-mode-list');

    const activeClass = 'px-2.5 py-1 rounded-lg bg-discord-blurple text-white font-medium flex items-center gap-1.5 transition shadow-sm';
    const inactiveClass = 'px-2.5 py-1 rounded-lg text-discord-muted hover:text-white font-medium flex items-center gap-1.5 transition';

    if (btnDense) btnDense.className = mode === 'dense' ? activeClass : inactiveClass;
    if (btnCards) btnCards.className = mode === 'cards' ? activeClass : inactiveClass;
    if (btnList) btnList.className = mode === 'list' ? activeClass : inactiveClass;

    if (mode === 'dense') {
      // 7TV Mode 1 (Screenshot 1): Ultra-compact icon-only mosaic
      container.className = 'grid grid-cols-[repeat(auto-fill,minmax(54px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(60px,1fr))] gap-1.5 min-h-[200px]';
    } else if (mode === 'cards') {
      // 7TV Mode 2 (Screenshot 2): Emote cards with centered icon and names
      container.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-2.5 min-h-[200px]';
    } else {
      // Compact List
      container.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 min-h-[200px]';
    }

    this.renderEmojiGrid();
    this.initSortable();
  },

  renderEmojiGrid() {
    const container = document.getElementById('emoji-container');
    const emptyEl = document.getElementById('emoji-empty');
    const filtered = this.getFilteredEmojis();

    if (filtered.length === 0) {
      container.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');

    if (this.viewMode === 'dense') {
      // 7TV Mode 1 (Screenshot 1): Ultra-compact Dense Mosaic
      container.innerHTML = filtered.map((emoji) => {
        const overallIndex = this.emojis.findIndex(e => e.id === emoji.id) + 1;
        const previewName = clientFormatEmojiName(emoji.name, overallIndex, this.config);

        return `
          <div data-id="${emoji.id}" title="#${overallIndex} :${previewName}: (было: :${emoji.name}:)" class="emoji-card emoji-tile-dense aspect-square bg-[#131416] hover:bg-[#1a1b1f] border border-[#202226] rounded-xl p-1.5 flex flex-col items-center justify-center relative group">
            <span class="index-badge absolute top-1 left-1.5 text-[9px] font-mono text-discord-muted/60 group-hover:text-discord-muted pointer-events-none">#${overallIndex}</span>
            ${emoji.animated ? '<span class="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-sky-400 shadow-sm shadow-sky-400 pointer-events-none"></span>' : ''}
            <img src="${emoji.url}" alt="${emoji.name}" class="w-10 h-10 object-contain drop-shadow pointer-events-none">
          </div>
        `;
      }).join('');
    } else if (this.viewMode === 'cards') {
      // 7TV Mode 2 (Screenshot 2): Emote Cards with centered icon, name underneath and zap badge
      container.innerHTML = filtered.map((emoji) => {
        const overallIndex = this.emojis.findIndex(e => e.id === emoji.id) + 1;
        const previewName = clientFormatEmojiName(emoji.name, overallIndex, this.config);

        return `
          <div data-id="${emoji.id}" title="#${overallIndex} :${previewName}: (было: :${emoji.name}:)" class="emoji-card emoji-card-7tv aspect-[4/4.3] bg-[#141517] hover:bg-[#191a1e] border border-[#212328] rounded-2xl p-2.5 flex flex-col items-center justify-between text-center relative group">
            <!-- Top Row: Index & Zap/GIF Icon -->
            <div class="w-full flex items-center justify-between">
              <span class="index-badge text-[10px] font-mono font-bold text-discord-muted/60 bg-discord-dark/50 px-1.5 py-0.5 rounded border border-discord-card/40">#${overallIndex}</span>
              ${emoji.animated ? '<i data-lucide="zap" class="w-3.5 h-3.5 text-sky-400 fill-sky-400/20" title="GIF (Анимированный)"></i>' : '<span class="w-3.5 h-3.5"></span>'}
            </div>

            <!-- Center: Emoji Image -->
            <div class="my-auto py-1 flex items-center justify-center">
              <img src="${emoji.url}" alt="${emoji.name}" class="w-14 h-14 object-contain drop-shadow pointer-events-none">
            </div>

            <!-- Bottom Row: Emote Name (7TV Style) -->
            <div class="w-full space-y-0.5">
              <p class="new-name text-xs font-semibold text-white tracking-tight truncate block group-hover:text-discord-blurple transition" title="Новое: :${previewName}:">:${previewName}:</p>
              <p class="text-[10px] font-mono text-discord-muted/60 truncate" title="Исходное: :${emoji.name}:">:${emoji.name}:</p>
            </div>
          </div>
        `;
      }).join('');
    } else {
      // Detailed List Layout
      container.innerHTML = filtered.map((emoji) => {
        const overallIndex = this.emojis.findIndex(e => e.id === emoji.id) + 1;
        const previewName = clientFormatEmojiName(emoji.name, overallIndex, this.config);

        return `
          <div data-id="${emoji.id}" class="emoji-card select-none bg-discord-secondary/70 hover:bg-discord-card border border-discord-card/80 hover:border-discord-blurple/50 rounded-xl px-3 py-2 flex items-center justify-between gap-2.5 transition group">
            <div class="flex items-center gap-2.5 min-w-0">
              <i data-lucide="grip-vertical" class="drag-handle w-4 h-4 text-discord-muted/40 group-hover:text-discord-muted flex-shrink-0"></i>
              <span class="index-badge text-[11px] font-mono font-bold text-discord-muted bg-discord-dark px-1.5 py-0.5 rounded border border-discord-card flex-shrink-0">#${overallIndex}</span>
              <img src="${emoji.url}" alt="${emoji.name}" class="w-7 h-7 object-contain flex-shrink-0 drop-shadow pointer-events-none">
              <div class="flex items-center gap-1.5 min-w-0 text-xs font-mono">
                <span class="text-discord-muted/80 truncate max-w-[85px] sm:max-w-[120px]" title="Текущее: :${emoji.name}:">:${emoji.name}:</span>
                <span class="text-discord-blurple/70 flex-shrink-0 text-[10px]">➔</span>
                <span class="new-name font-bold text-emerald-400 truncate" title="Новое: :${previewName}:">:${previewName}:</span>
              </div>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
              ${emoji.animated ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400">GIF</span>' : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    lucide.createIcons();
  },

  updateCardBadges() {
    // Update live formatted preview without re-rendering images (prevents image flickering during drag!)
    const cards = document.querySelectorAll('#emoji-container [data-id]');
    cards.forEach(card => {
      const id = card.getAttribute('data-id');
      const overallIndex = this.emojis.findIndex(e => e.id === id) + 1;
      const emoji = this.emojis[overallIndex - 1];
      if (!emoji) return;

      const previewName = clientFormatEmojiName(emoji.name, overallIndex, this.config);
      
      const indexBadge = card.querySelector('.index-badge');
      if (indexBadge) indexBadge.innerText = `#${overallIndex}`;

      const newNameEl = card.querySelector('.new-name');
      if (newNameEl) {
        newNameEl.innerText = `:${previewName}:`;
        newNameEl.title = `Новое: :${previewName}:`;
      }

      card.title = `#${overallIndex} :${previewName}: (было: :${emoji.name}:)`;
    });
  },

  initSortable() {
    const container = document.getElementById('emoji-container');
    if (!container) return;

    if (this.sortableInstance) {
      this.sortableInstance.destroy();
      this.sortableInstance = null;
    }

    // Auto-scroll acceleration variables
    let isDragging = false;
    let mouseClientY = null;
    let autoScrollRaf = null;

    const doAutoScroll = () => {
      if (!isDragging) return;
      if (mouseClientY !== null) {
        const threshold = 160; // 160px from top or bottom of viewport
        const h = window.innerHeight;

        if (mouseClientY < threshold) {
          // Dragging towards top -> scroll up
          const factor = Math.max(0.1, (threshold - mouseClientY) / threshold);
          const speed = -Math.max(8, Math.round(factor * 36));
          window.scrollBy(0, speed);
        } else if (mouseClientY > h - threshold) {
          // Dragging towards bottom -> scroll down
          const factor = Math.max(0.1, (mouseClientY - (h - threshold)) / threshold);
          const speed = Math.max(8, Math.round(factor * 36));
          window.scrollBy(0, speed);
        }
      }
      autoScrollRaf = requestAnimationFrame(doAutoScroll);
    };

    const onPointerMove = (e) => {
      mouseClientY = e.clientY;
    };

    this.sortableInstance = new Sortable(container, {
      animation: 160,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      scroll: true,
      scrollSensitivity: 160,
      scrollSpeed: 30,
      bubbleScroll: true,
      forceAutoScrollFallback: true,

      onStart: (evt) => {
        isDragging = true;
        mouseClientY = evt.originalEvent ? evt.originalEvent.clientY : null;
        window.addEventListener('mousemove', onPointerMove, { passive: true });
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        window.addEventListener('touchmove', (e) => {
          if (e.touches && e.touches[0]) mouseClientY = e.touches[0].clientY;
        }, { passive: true });
        autoScrollRaf = requestAnimationFrame(doAutoScroll);
      },

      onEnd: (evt) => {
        isDragging = false;
        mouseClientY = null;
        window.removeEventListener('mousemove', onPointerMove);
        window.removeEventListener('pointermove', onPointerMove);
        if (autoScrollRaf) cancelAnimationFrame(autoScrollRaf);

        // Rearrange this.emojis based on DOM order
        const itemEls = container.querySelectorAll('[data-id]');
        const newOrderIds = Array.from(itemEls).map(el => el.getAttribute('data-id'));

        // If filtered view, preserve un-rendered elements in relative order
        const idMap = new Map(this.emojis.map(e => [e.id, e]));
        const updated = [];
        newOrderIds.forEach(id => {
          if (idMap.has(id)) {
            updated.push(idMap.get(id));
            idMap.delete(id);
          }
        });
        // Append any remaining elements that were hidden by search or tab
        idMap.forEach(emoji => updated.push(emoji));

        this.emojis = updated;
        this.updateCardBadges();
      }
    });
  },

  // Preset sort functions
  sortAZ() {
    this.emojis.sort((a, b) => a.cleanName.localeCompare(b.cleanName, 'ru-RU', { numeric: true }));
    this.renderEmojiGrid();
    this.showToast('Отсортировано по алфавиту (А-Я)', 'info');
  },

  sortZA() {
    this.emojis.sort((a, b) => b.cleanName.localeCompare(a.cleanName, 'ru-RU', { numeric: true }));
    this.renderEmojiGrid();
    this.showToast('Отсортировано в обратном порядке (Я-А)', 'info');
  },

  sortAnimatedFirst() {
    this.emojis.sort((a, b) => {
      if (a.animated === b.animated) return a.cleanName.localeCompare(b.cleanName);
      return a.animated ? -1 : 1;
    });
    this.renderEmojiGrid();
    this.showToast('Анимированные эмодзи перемещены вперед', 'info');
  },

  sortStaticFirst() {
    this.emojis.sort((a, b) => {
      if (a.animated === b.animated) return a.cleanName.localeCompare(b.cleanName);
      return a.animated ? 1 : -1;
    });
    this.renderEmojiGrid();
    this.showToast('Статичные эмодзи перемещены вперед', 'info');
  },

  sortShuffle() {
    for (let i = this.emojis.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.emojis[i], this.emojis[j]] = [this.emojis[j], this.emojis[i]];
    }
    this.renderEmojiGrid();
    this.showToast('Порядок перемешан случайно', 'info');
  },

  resetOrder() {
    this.emojis = [...this.originalEmojis];
    this.renderEmojiGrid();
    this.showToast('Порядок сброшен к исходному на сервере', 'info');
  },

  // Modal: Confirmation
  openConfirmationModal() {
    const total = this.emojis.length;
    if (total === 0) {
      this.showToast('На сервере нет эмодзи для сортировки', 'warn');
      return;
    }

    let changeCount = 0;
    let unchangedCount = 0;
    const diffs = [];

    this.emojis.forEach((emoji, idx) => {
      const newName = clientFormatEmojiName(emoji.name, idx + 1, this.config);
      const isChanged = emoji.name !== newName;
      if (isChanged) {
        changeCount++;
      } else {
        unchangedCount++;
      }
      diffs.push({
        id: emoji.id,
        url: emoji.url,
        oldName: emoji.name,
        newName,
        isChanged
      });
    });

    document.getElementById('confirm-count-total').innerText = `${total} эмодзи`;
    document.getElementById('confirm-count-change').innerText = `${changeCount}`;
    document.getElementById('confirm-count-unchanged').innerText = `${unchangedCount}`;

    // Estimate time: ~0.85s per changed emoji
    const estimateSec = Math.max(5, Math.ceil(changeCount * 0.9));
    document.getElementById('confirm-estimate').innerText = `~${estimateSec} сек`;

    // Render diff list
    const diffContainer = document.getElementById('confirm-diff-list');
    diffContainer.innerHTML = diffs.slice(0, 15).map(d => `
      <div class="p-2.5 flex items-center justify-between gap-3 ${d.isChanged ? 'bg-discord-card/30' : 'opacity-60'}">
        <div class="flex items-center gap-2.5 min-w-0">
          <img src="${d.url}" class="w-6 h-6 object-contain flex-shrink-0">
          <span class="text-discord-muted truncate">:${d.oldName}:</span>
          <span class="text-discord-blurple flex-shrink-0">➔</span>
          <span class="${d.isChanged ? 'text-emerald-400 font-bold' : 'text-discord-muted'} truncate">:${d.newName}:</span>
        </div>
        <span class="text-[10px] px-2 py-0.5 rounded ${d.isChanged ? 'bg-emerald-500/20 text-emerald-400' : 'bg-discord-secondary text-discord-muted'} flex-shrink-0">
          ${d.isChanged ? 'Будет переименован' : 'Без изменений'}
        </span>
      </div>
    `).join('') + (diffs.length > 15 ? `<div class="p-2 text-center text-xs text-discord-muted font-sans bg-discord-card/20">...и еще ${diffs.length - 15} эмодзи</div>` : '');

    document.getElementById('modal-confirm').classList.remove('hidden');
  },

  closeConfirmationModal() {
    document.getElementById('modal-confirm').classList.add('hidden');
  },

  // Execute Sort & Open Progress Modal
  async executeSort() {
    this.closeConfirmationModal();

    const guildId = this.currentGuild.id;
    const emojiIds = this.emojis.map(e => e.id);

    // Prepare Progress UI
    const modalProg = document.getElementById('modal-progress');
    modalProg.classList.remove('hidden');

    document.getElementById('progress-title').innerText = 'Переименование эмодзи...';
    document.getElementById('progress-subtitle').innerText = 'Синхронизация с сервером Discord';
    document.getElementById('progress-spinner').classList.remove('hidden');
    document.getElementById('btn-abort').classList.remove('hidden');
    document.getElementById('btn-progress-done').classList.add('hidden');
    document.getElementById('progress-bar-fill').style.width = '0%';
    document.getElementById('progress-percent').innerText = '0%';
    document.getElementById('progress-log-box').innerHTML = '<div class="text-discord-muted">Инициализация соединения...</div>';

    // Subscribe to SSE
    if (this.progressUnsub) this.progressUnsub();
    this.progressUnsub = API.subscribeProgress(guildId, (data) => {
      this.handleProgressUpdate(data);
    });

    try {
      await API.startSort(guildId, emojiIds, this.config);
    } catch (e) {
      this.showToast(e.message, 'error');
      this.closeProgressModal();
    }
  },

  handleProgressUpdate(data) {
    if (!data || data.status === 'idle') return;

    const total = data.total || this.emojis.length;
    const current = data.current || 0;
    const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

    // Update Progress Bar
    document.getElementById('progress-bar-fill').style.width = `${percent}%`;
    document.getElementById('progress-percent').innerText = `${percent}%`;

    // Counts
    document.getElementById('progress-counts').innerText = 
      `Успешно: ${data.successCount || 0} | Пропущено: ${data.skippedCount || 0} | Ошибок: ${data.failedCount || 0}`;

    // Current item card
    if (data.currentEmoji) {
      document.getElementById('progress-current-card').classList.remove('hidden');
      document.getElementById('progress-current-img').src = data.currentEmoji.url || '';
      document.getElementById('progress-current-old').innerText = `:${data.currentEmoji.oldName}:`;
      document.getElementById('progress-current-new').innerText = `:${data.currentEmoji.newName}:`;
    }

    // Logs
    if (Array.isArray(data.logs)) {
      const logBox = document.getElementById('progress-log-box');
      logBox.innerHTML = data.logs.map(log => {
        let colorClass = 'text-discord-muted';
        if (log.type === 'success') colorClass = 'text-emerald-400';
        if (log.type === 'warn') colorClass = 'text-amber-400';
        if (log.type === 'error') colorClass = 'text-discord-red font-bold';

        return `<div class="truncate"><span class="text-discord-muted/60">[${log.time}]</span> <span class="${colorClass}">${log.message}</span></div>`;
      }).join('');
    }

    // Done / Aborted / Failed
    if (data.isDone) {
      document.getElementById('progress-spinner').classList.add('hidden');
      document.getElementById('btn-abort').classList.add('hidden');
      document.getElementById('btn-progress-done').classList.remove('hidden');

      if (data.status === 'completed') {
        document.getElementById('progress-title').innerText = '🎉 Сортировка успешно завершена!';
        document.getElementById('progress-subtitle').innerText = 'Все эмодзи выстроены в заданном порядке';
        document.getElementById('progress-bar-fill').style.width = '100%';
        document.getElementById('progress-percent').innerText = '100%';
      } else if (data.status === 'aborted') {
        document.getElementById('progress-title').innerText = '⚠️ Сортировка прервана';
        document.getElementById('progress-subtitle').innerText = 'Процесс остановлен пользователем';
      } else {
        document.getElementById('progress-title').innerText = '❌ Ошибка при выполнении';
        document.getElementById('progress-subtitle').innerText = 'Проверьте логи и права бота на сервере';
      }
    }
  },

  async abortSort() {
    if (!this.currentGuild) return;
    try {
      await API.abortSort(this.currentGuild.id);
      this.showToast('Запрос на остановку отправлен', 'info');
    } catch (e) {
      this.showToast(e.message, 'error');
    }
  },

  closeProgressModal() {
    document.getElementById('modal-progress').classList.add('hidden');
    if (this.progressUnsub) {
      this.progressUnsub();
      this.progressUnsub = null;
    }
    // Refresh emoji list from server to show freshly renamed emojis
    if (this.currentGuild) {
      this.selectGuild(this.currentGuild.id);
    }
  },

  // Toast Notification helper
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    let bg = 'bg-discord-card border-discord-secondary text-white';
    let icon = 'info';
    if (type === 'success') {
      bg = 'bg-emerald-950/90 border-emerald-500/30 text-emerald-200';
      icon = 'check-circle';
    } else if (type === 'error') {
      bg = 'bg-red-950/90 border-red-500/30 text-red-200';
      icon = 'alert-triangle';
    } else if (type === 'warn') {
      bg = 'bg-amber-950/90 border-amber-500/30 text-amber-200';
      icon = 'alert-circle';
    }

    toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl text-sm transition-all duration-300 transform translate-y-2 opacity-0 ${bg}`;
    toast.innerHTML = `
      <i data-lucide="${icon}" class="w-4 h-4 flex-shrink-0"></i>
      <span>${message}</span>
    `;

    container.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
