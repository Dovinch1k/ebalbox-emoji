const EventEmitter = require('events');
const { formatEmojiName } = require('./utils/emojiHelper');

class EmojiSorterService extends EventEmitter {
  constructor(client) {
    super();
    this.client = client;
    // Map of guildId -> active job state
    this.activeJobs = new Map();
  }

  /**
   * Get the current status of a guild's sorting job
   * @param {string} guildId 
   */
  getJob(guildId) {
    return this.activeJobs.get(guildId) || null;
  }

  /**
   * Abort an ongoing sorting job
   * @param {string} guildId 
   */
  abortJob(guildId) {
    const job = this.activeJobs.get(guildId);
    if (job && job.status === 'running') {
      job.aborted = true;
      job.status = 'aborted';
      this.addLog(job, 'warn', '⚠️ Сортировка прервана пользователем.');
      this.emitProgress(job);
      return true;
    }
    return false;
  }

  /**
   * Add a log message to the job
   */
  addLog(job, type, message, extra = {}) {
    const entry = {
      id: Date.now() + Math.random().toString(36).substr(2, 4),
      time: new Date().toLocaleTimeString('ru-RU', { hour12: false }),
      type, // 'info', 'success', 'warn', 'error'
      message,
      ...extra
    };
    job.logs.unshift(entry);
    // Keep last 150 logs in memory
    if (job.logs.length > 150) {
      job.logs.pop();
    }
    return entry;
  }

  emitProgress(job) {
    this.emit(`progress:${job.guildId}`, {
      status: job.status,
      current: job.current,
      total: job.total,
      successCount: job.successCount,
      skippedCount: job.skippedCount,
      failedCount: job.failedCount,
      currentEmoji: job.currentEmoji,
      logs: job.logs.slice(0, 30),
      isDone: ['completed', 'aborted', 'failed'].includes(job.status)
    });
  }

  /**
   * Start sorting emojis in a guild
   * @param {string} guildId 
   * @param {Array<string>} orderedEmojiIds - Array of emoji IDs in desired order
   * @param {object} options - Sorter options (digits, separator, startIndex, stripExisting)
   */
  async startSorting(guildId, orderedEmojiIds, options = {}) {
    const existingJob = this.activeJobs.get(guildId);
    if (existingJob && existingJob.status === 'running') {
      throw new Error('Сортировка для этого сервера уже выполняется!');
    }

    const guild = await this.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      throw new Error('Сервер не найден или бот не имеет к нему доступа.');
    }

    const me = await guild.members.fetchMe().catch(() => null);
    if (!me || (!me.permissions.has('ManageGuildExpressions') && !me.permissions.has('Administrator'))) {
      throw new Error('У бота нет прав "Управлять выражениями" (Manage Expressions) на этом сервере!');
    }

    // Initialize job state
    const job = {
      guildId,
      status: 'running',
      aborted: false,
      current: 0,
      total: orderedEmojiIds.length,
      successCount: 0,
      skippedCount: 0,
      failedCount: 0,
      currentEmoji: null,
      logs: [],
      startedAt: Date.now()
    };

    this.activeJobs.set(guildId, job);
    this.addLog(job, 'info', `🚀 Запуск сортировки ${job.total} эмодзи...`);
    this.emitProgress(job);

    // Run sorting in the background
    this._runSortingLoop(guild, orderedEmojiIds, options, job).catch(err => {
      console.error(`Error in sorting loop for guild ${guildId}:`, err);
      job.status = 'failed';
      this.addLog(job, 'error', `❌ Критическая ошибка: ${err.message}`);
      this.emitProgress(job);
    });

    return job;
  }

  /**
   * Internal loop that processes emoji renames one by one with rate limit handling
   */
  async _runSortingLoop(guild, orderedEmojiIds, options, job) {
    const delayBetweenRequests = 850; // Safe 850ms interval between calls

    for (let i = 0; i < orderedEmojiIds.length; i++) {
      if (job.aborted) {
        break;
      }

      const emojiId = orderedEmojiIds[i];
      job.current = i + 1;

      let emoji;
      try {
        emoji = await guild.emojis.fetch(emojiId);
      } catch (e) {
        job.failedCount++;
        this.addLog(job, 'error', `Эмодзи с ID ${emojiId} не найден на сервере.`);
        this.emitProgress(job);
        continue;
      }

      const oldName = emoji.name;
      const { newName, isTruncated } = formatEmojiName(oldName, i + 1, options);

      job.currentEmoji = {
        id: emoji.id,
        oldName,
        newName,
        url: emoji.imageURL({ extension: emoji.animated ? 'gif' : 'webp', size: 96 }),
        animated: emoji.animated
      };

      // If name is already identical, skip API call!
      if (oldName === newName) {
        job.skippedCount++;
        this.addLog(job, 'info', `⏩ [${i + 1}/${job.total}] :${oldName}: уже имеет нужное имя (${newName}). Пропуск.`);
        this.emitProgress(job);
        continue;
      }

      // Rename emoji with rate-limit and retry handling
      let success = false;
      let attempts = 0;
      const maxAttempts = 4;

      while (!success && attempts < maxAttempts && !job.aborted) {
        attempts++;
        try {
          await emoji.edit({ name: newName });
          success = true;
          job.successCount++;

          let logMsg = `✅ [${i + 1}/${job.total}] Переименован: :${oldName}: ➔ :${newName}:`;
          if (isTruncated) {
            logMsg += ' (имя сокращено до 32 символов)';
          }
          this.addLog(job, 'success', logMsg, {
            oldName,
            newName,
            emojiId: emoji.id
          });
          this.emitProgress(job);
        } catch (error) {
          // Discord Rate Limit Error (429)
          if (error.status === 429 || error.code === 429 || error.retryAfter) {
            const retryMs = (error.retryAfter || (error.rawError && error.rawError.retry_after * 1000) || 3000) + 600;
            this.addLog(job, 'warn', `⏳ Лимит запросов Discord. Ожидание ${(retryMs / 1000).toFixed(1)} сек...`);
            this.emitProgress(job);
            await new Promise(res => setTimeout(res, retryMs));
          } else {
            console.error(`Failed to rename emoji ${emojiId} (attempt ${attempts}):`, error);
            if (attempts >= maxAttempts) {
              job.failedCount++;
              this.addLog(job, 'error', `❌ [${i + 1}/${job.total}] Ошибка при переименовании :${oldName}:: ${error.message}`);
              this.emitProgress(job);
            } else {
              // Wait slightly before retry
              await new Promise(res => setTimeout(res, 1200));
            }
          }
        }
      }

      // Polite pause between requests to prevent hitting Discord rate limits
      if (i < orderedEmojiIds.length - 1 && !job.aborted) {
        await new Promise(res => setTimeout(res, delayBetweenRequests));
      }
    }

    if (!job.aborted) {
      job.status = 'completed';
      const durationSec = Math.round((Date.now() - job.startedAt) / 1000);
      this.addLog(job, 'success', `🎉 Сортировка завершена за ${durationSec} сек! Успешно: ${job.successCount}, Пропущено: ${job.skippedCount}, Ошибок: ${job.failedCount}.`);
    }

    job.currentEmoji = null;
    this.emitProgress(job);
  }
}

module.exports = EmojiSorterService;
