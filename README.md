# 🤖 KPI Schedule Bot — ІМ-41

Telegram-бот для перегляду розкладу групи **ІМ-41** КПІ ім. Ігоря Сікорського.

---

## 📋 Команди

| Команда | Опис |
|---|---|
| `/today` | Розклад на сьогодні |
| `/tomorrow` | Розклад на завтра |
| `/week` | Розклад на весь тиждень |
| `/next` | Найближчий день з парами |
| `/setlink <назва> <url>` | Зберегти посилання для предмету |
| `/deletelink <назва>` | Видалити посилання |

---

## 🚀 Запуск

### 1. Встановлення залежностей

```bash
npm install
```

### 2. Налаштування середовища

```bash
cp .env.example .env
```

Відредагуйте `.env`:

```env
BOT_TOKEN=your_telegram_bot_token_here
WEBHOOK_URL=                   # залиште порожнім для polling-режиму
PORT=3000
GROUP_ID=4318
CACHE_TTL=300
LOG_LEVEL=info
DB_PATH=./data/links.db
```

### 3. Запуск у режимі розробки

```bash
npm run dev
```

### 4. Збірка та запуск у production

```bash
npm run build
npm start
```

---

## 🧪 Тести

Проєкт використовує **[Vitest](https://vitest.dev/)** + **Supertest** для юніт- та інтеграційного тестування.

### Запуск тестів

```bash
# Одноразовий запуск (CI-режим)
npm test -- --run

# Watch-режим (розробка)
npm test
```

### Покриття коду

```bash
npm run test:coverage
```

HTML-звіт зберігається у `coverage/index.html`. Відкрийте у браузері для детального перегляду.

### Що покривається

| Модуль | Опис |
|---|---|
| `src/utils/htmlEscape` | Всі 4 HTML-символи + крайні випадки |
| `src/utils/date.utils` | Кожен день тижня, зміна місяця, час |
| `src/utils/messageSplitter` | Коротке/довге повідомлення, розбиття по днях |
| `src/utils/format.utils` | Форматування, HTML-escape, посилання |
| `src/utils/admin.guard` | ID / username, регістр, відсутній `from` |
| `src/services/rateLimiter.service` | Ліміт 5 запитів / 10 с, блокування 30 с |
| `src/services/concurrency.service` | Lock/release, дублікати, помилки |
| `src/services/weekSelection.service` | Зберігання/скидання вибору тижня |
| `src/services/schedule.service` | Axios-mock: кеш, таймаут, тиждень 1/2 |
| `src/database/db` | In-memory SQLite: CRUD + upsert |
| `src/routes/webhook` | Express: secret-verif., health, 403/200 |

---


### Збірка образу

```bash
docker build -t kpi-schedule-bot .
```

### Запуск контейнера (polling-режим)

```bash
docker run -d \
  --name kpi-bot \
  -e BOT_TOKEN=your_token \
  -v $(pwd)/data:/app/data \
  kpi-schedule-bot
```

### Запуск з webhook

```bash
docker run -d \
  --name kpi-bot \
  -e BOT_TOKEN=your_token \
  -e WEBHOOK_URL=https://yourdomain.com \
  -e PORT=3000 \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  kpi-schedule-bot
```

---

## 🔗 Webhook Setup

Якщо `WEBHOOK_URL` задано, бот автоматично реєструє webhook при старті.

Для ручного налаштування:

```bash
curl https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://yourdomain.com/webhook
```

Перевірка стану:

```bash
curl https://yourdomain.com/health
```

---

## 🏗 Архітектура

```
src/
├── index.ts              # Entry point (webhook/polling mode)
├── bot.ts                # Bot commands
├── config.ts             # Environment config
├── types/
│   └── kpi.types.ts      # KPI API type definitions
├── services/
│   └── schedule.service.ts  # KPI API + caching
├── database/
│   └── db.ts             # SQLite (better-sqlite3)
├── utils/
│   ├── date.utils.ts     # Ukrainian day names, time parsing
│   ├── format.utils.ts   # HTML message formatting
│   └── logger.ts         # Winston logger
└── routes/
    └── webhook.ts        # Express webhook + health check
```

---

## 🛠 Технології

- **Node.js 20+** + **TypeScript** (strict mode)
- **telegraf** — Telegram Bot framework
- **axios** — HTTP client for KPI API
- **better-sqlite3** — SQLite for lesson links
- **node-cache** — In-memory caching (TTL 300s)
- **winston** — Structured logging
- **express** — Webhook server + health check
- **dotenv** — Environment configuration
