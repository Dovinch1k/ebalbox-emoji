# 🚀 Discord Emoji Sorter (Бот для сортировки эмодзи с веб-интерфейсом)

Discord-бот и веб-панель управления для удобной сортировки и переименования эмодзи сервера в формате `0001_имя`, `0002_имя` и т.д.

---

## 💡 Как это работает?

В клиенте Discord эмодзи сервера всегда отображаются **строго по алфавиту** их названий.  
Чтобы расположить эмодзи в желаемом порядке (по категориям, цвету или популярности), бот переименовывает их с числовым префиксом фиксированной длины:
- `0001_pepe_happy`
- `0002_pepe_cry`
- `0003_party_blob`

Благодаря префиксу `0001_`, Discord выстраивает эмодзи в точности так, как вы их расставили в веб-интерфейсе!

---

## ✨ Возможности

- 🖱️ **Drag & Drop интерфейс**: перетаскивайте эмодзи мышкой в нужном порядке прямо в браузере.
- ⚡ **Быстрая сортировка**:
  - По алфавиту (А ➔ Я / Я ➔ А)
  - Сначала анимированные (GIF)
  - Сначала статичные
  - Случайный порядок (Shuffle)
  - Сброс к исходному порядку
- 🧹 **Умная очистка префиксов**: при повторной сортировке автоматически убирает старые индексы вроде `0001_`, предотвращая нагромождение (`0001_0001_pepe`).
- 🔤 **Транслитерация**: автоматически переводит русские буквы в латиницу (Discord разрешает в именах эмодзи только латинские буквы, цифры и символ подчеркивания).
- 🛡️ **Защита от Rate Limit (429)**: безопасные паузы между запросами к API Discord и автоматическое ожидание при достижении лимитов с таймером в реальном времени.
- 📊 **Live Progress Bar**: отслеживание прогресса в реальном времени через Server-Sent Events (SSE).
- 🌐 **Готов к деплою на Render.com**: конфигурация `render.yaml` и `Dockerfile` включены.

---

## 🛠️ Настройка в Discord Developer Portal

Перед запуском нужно создать приложение в Discord:

1. Перейдите на [Discord Developer Portal](https://discord.com/developers/applications) и нажмите **New Application**.
2. В разделе **General Information**:
   - Скопируйте **Application ID** — это ваш `DISCORD_CLIENT_ID`.
3. В разделе **OAuth2**:
   - Нажмите **Reset Secret** и скопируйте **Client Secret** — это ваш `DISCORD_CLIENT_SECRET`.
   - В блоке **Redirects** нажмите **Add Redirect** и добавьте:
     - Для локального теста: `http://localhost:3000/auth/callback`
     - Для Render: `https://<ваше-приложение>.onrender.com/auth/callback`
4. В разделе **Bot**:
   - Нажмите **Reset Token** и скопируйте токен — это ваш `DISCORD_TOKEN`.
   - *Примечание:* Привилегированные интенты (Privileged Gateway Intents) **не требуются**.
5. Права бота:
   - Боту необходимо право: **Manage Guild Expressions** (`Управлять выражениями`) или **Administrator**.
   - Ссылка для приглашения бота генерируется автоматически прямо в панели сайта, либо вы можете использовать шаблон:
     ```
     https://discord.com/oauth2/authorize?client_id=ВАШ_CLIENT_ID&permissions=1073741824&scope=bot%20applications.commands
     ```

---

## 🚀 Деплой на Render.com

### Вариант 1: Через Blueprint (Рекомендуется)

1. Загрузите код репозитория на свой GitHub.
2. Войдите на [Render.com](https://dashboard.render.com/) и нажмите **New +** ➔ **Blueprint**.
3. Подключите ваш GitHub-репозиторий. Render автоматически обнаружит файл `render.yaml`.
4. Заполните переменные окружения:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_CLIENT_SECRET`
   - `DISCORD_REDIRECT_URI` (укажите адрес вида `https://<ваше-имя>.onrender.com/auth/callback`)
5. Нажмите **Apply** — сервис соберется и запустится!

---

### Вариант 2: Ручное создание Web Service на Render

1. На [Render Dashboard](https://dashboard.render.com/) нажмите **New +** ➔ **Web Service**.
2. Подключите репозиторий с кодом.
3. Настройки сервиса:
   - **Name**: `discord-emoji-sorter` (или любое другое)
   - **Region**: Frankfurt (или любой подходящий)
   - **Branch**: `main` (или ваша рабочая ветка)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
4. В разделе **Environment Variables** добавьте:
   - `NODE_ENV` = `production`
   - `DISCORD_TOKEN` = `ваш_бот_токен`
   - `DISCORD_CLIENT_ID` = `ваш_client_id`
   - `DISCORD_CLIENT_SECRET` = `ваш_client_secret`
   - `DISCORD_REDIRECT_URI` = `https://<ваше-имя-на-render>.onrender.com/auth/callback`
   - `SESSION_SECRET` = `любая_случайная_длинная_строка`
5. Нажмите **Create Web Service**.
6. После деплоя скопируйте URL вашего приложения (например: `https://my-emoji-sorter.onrender.com`) и убедитесь, что в Discord Developer Portal в разделе **OAuth2 ➔ Redirects** добавлен адрес `https://my-emoji-sorter.onrender.com/auth/callback`.

---

## 💻 Локальный запуск

1. Склонируйте репозиторий:
   ```bash
   git clone <url-вашего-репозитория>
   cd cool-hypatia
   ```

2. Установите зависимости:
   ```bash
   npm install
   ```

3. Создайте файл `.env` на основе примера:
   ```bash
   cp .env.example .env
   ```
   и укажите ваши `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`.

4. Запустите сервер:
   ```bash
   npm start
   ```

5. Откройте в браузере: [http://localhost:3000](http://localhost:3000)

---

## 📁 Структура проекта

```
├── public/                 # Веб-интерфейс
│   ├── index.html          # Главная страница (Tailwind CSS + Lucide Icons)
│   ├── css/style.css       # Стили анимаций и перетаскивания
│   └── js/
│       ├── api.js          # REST и SSE клиент
│       └── app.js          # Логика UI, SortableJS и модальные окна
├── src/
│   ├── bot.js              # Инициализация клиента discord.js и команд
│   ├── index.js            # Express веб-сервер и маршруты
│   ├── sorter.js           # Сервис очереди переименования с контролем лимитов
│   ├── routes/
│   │   ├── auth.js         # Discord OAuth2 авторизация
│   │   └── api.js          # API серверов, эмодзи и прогресса
│   └── utils/
│       └── emojiHelper.js  # Валидация, очистка и форматирование (0001_имя)
├── .env.example            # Пример переменных окружения
├── Dockerfile              # Docker образ
├── render.yaml             # Render Blueprint
└── package.json
```

---

## ⚖️ Ограничения Discord API

- Максимальная длина названия эмодзи: **32 символа**. Если имя слишком длинное, бот автоматически безопасно сократит его базовую часть, чтобы сохранить префикс `0001_`.
- Разрешенные символы: латинские буквы (`a-z`, `A-Z`), цифры (`0-9`) и знак подчеркивания (`_`).
- Лимит на изменение эмодзи: Discord ограничивает количество запросов на редактирование эмодзи (~50 изменений за окно). Бот соблюдает интервалы (~850 мс) и при получении заголовка `Retry-After` автоматически ставит процесс на паузу без потери прогресса.
