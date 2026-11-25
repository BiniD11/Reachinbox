# 📧 ReachInbox Email Scheduler

A production-grade email scheduling service built for the ReachInbox technical assignment.

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────────────────────────┐
│   Next.js       │────▶│         Express.js Backend           │
│   Frontend      │     │  ┌─────────────┐  ┌──────────────┐  │
│   Port: 3000    │     │  │  REST APIs  │  │ Bull Board   │  │
└─────────────────┘     │  └─────────────┘  └──────────────┘  │
                        └───────────────────────────────────────┘
                                        │
              ┌─────────────────────────┼──────────────────────┐
              │                         │                      │
      ┌───────▼──────┐       ┌──────────▼──────┐    ┌────────▼──────┐
      │  PostgreSQL  │       │  Redis + BullMQ │    │ Elasticsearch │
      │  (via Prisma)│       │  Job Scheduler  │    │  Email Index  │
      └──────────────┘       └─────────────────┘    └───────────────┘
                                      │
                        ┌─────────────┴────────────┐
                        │       BullMQ Workers      │
                        │  ┌──────────┐ ┌────────┐ │
                        │  │Job Worker│ │Send    │ │
                        │  │(expands) │ │Worker  │ │
                        │  └──────────┘ └────────┘ │
                        └──────────────────────────┘
                                      │
                              ┌───────▼──────┐
                              │ Ethereal SMTP│
                              │ (fake email) │
                              └──────────────┘
```

## ✅ Features

- **BullMQ Delayed Jobs**: All scheduling via BullMQ — no cron jobs whatsoever
- **Idempotent Jobs**: BullMQ job IDs match DB record IDs — no duplicate sends on restart
- **Redis Rate Limiting**: Per-sender hourly limits backed by Redis counters (atomic INCR)
- **Multi-Sender Support**: Each job can use a different SMTP sender
- **Elasticsearch Search**: Full-text search across all email logs
- **Google OAuth**: Real Google login with JWT tokens
- **Slack Notifications**: OAuth flow → webhook alert when rate limit is hit
- **Bull Board**: Live queue dashboard at `/admin/queues`
- **Persistence**: After restart, BullMQ reads from Redis — future jobs still fire at correct times

## ⚙️ Rate Limiting Design

### How It Works

1. **Redis-Backed Counters**: For each sender, we track sends per hour using a Redis key: `rate:{senderId}:{year}-{month}-{day}-{hour}`
2. **Atomic Increments**: Using Redis `INCR` + `EXPIRE` in a pipeline — safe across multiple workers
3. **BullMQ Limiter**: The `emailSendQueue` has a `limiter: { max: 1, duration: 2000 }` — max 1 job per 2 seconds
4. **Rescheduling on Limit Hit**: When a sender's hourly limit is exceeded, the job is re-added to the queue with a delay until the next hour window — jobs are never dropped

### Configuration

```env
MAX_EMAILS_PER_HOUR=200              # Global cap
MAX_EMAILS_PER_HOUR_PER_SENDER=100   # Per-sender cap
WORKER_CONCURRENCY=5                  # Parallel workers
MIN_DELAY_BETWEEN_SENDS_MS=2000       # Min 2s between sends
```

### Behavior Under 1000+ Emails

- 1000 emails scheduled at the same time → all added to `email-sends` queue
- BullMQ limiter enforces 1 send per 2 seconds (max ~1800/hour)
- Redis counter per sender enforces `MAX_EMAILS_PER_HOUR_PER_SENDER`
- When limit hit: job re-queued with `delay = ms until next hour window`
- Order preserved as much as possible (FIFO within hour windows)

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+
- Google OAuth credentials
- Slack OAuth app (optional)

### 1. Clone & Configure

```bash
git clone <repo-url>
cd email-scheduler

# Configure backend
cp backend/.env.example backend/.env
# Edit backend/.env with your Google/Slack OAuth credentials

# Configure frontend
cp frontend/.env.local.example frontend/.env.local
```

### 2. Start Infrastructure

```bash
docker-compose up -d postgres redis elasticsearch
```

### 3. Run Database Migrations

```bash
cd backend
npm install
npm run prisma:push
```

### 4. Start Backend

```bash
cd backend
npm run dev
```

### 5. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

### 6. Access the App

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:3001 |
| Bull Board | http://localhost:3001/admin/queues |
| Kibana | http://localhost:5601 |
| Elasticsearch | http://localhost:9200 |

## 📡 API Reference

### Auth
| Method | Path | Description |
|---|---|---|
| GET | `/auth/google` | Initiate Google OAuth |
| GET | `/auth/google/callback` | OAuth callback |
| GET | `/auth/me` | Get current user |
| POST | `/auth/logout` | Logout |
| GET | `/auth/slack` | Get Slack OAuth URL |
| GET | `/auth/slack/callback` | Slack OAuth callback |
| DELETE | `/auth/slack` | Disconnect Slack |

### Emails
| Method | Path | Description |
|---|---|---|
| POST | `/emails/schedule` | Schedule a new email job |
| GET | `/emails/scheduled` | List scheduled jobs |
| GET | `/emails/sent` | List sent email logs |
| GET | `/emails/jobs/:id` | Get job details |
| DELETE | `/emails/jobs/:id` | Cancel a job |
| GET | `/emails/search?q=&status=` | Elasticsearch search |

### Senders
| Method | Path | Description |
|---|---|---|
| GET | `/senders` | List senders |
| POST | `/senders/ethereal` | Auto-create Ethereal sender |
| POST | `/senders` | Create custom SMTP sender |
| DELETE | `/senders/:id` | Delete sender |

## 🔄 Persistence & Restart Safety

- **BullMQ + Redis**: All pending/delayed jobs live in Redis. On server restart, the workers reconnect to Redis and pick up exactly where they left off.
- **Idempotency**: Each BullMQ job ID = the database record UUID. If a job already exists in BullMQ (e.g., due to a crash-loop restart), the `add()` call with the same `jobId` is a no-op.
- **No re-sends**: Email logs are created before sending. If a worker crashes mid-send, the failed log is marked accordingly; there's no mechanism to auto-retry the same log twice.

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | Express.js, TypeScript |
| Queue | BullMQ 5.x |
| Cache/Queue Store | Redis 7 |
| Database | PostgreSQL 16 (Prisma ORM) |
| Search | Elasticsearch 8.x |
| Email | Nodemailer + Ethereal Email |
| Auth | Google OAuth 2.0 (Passport.js) |
| Notifications | Slack OAuth + Webhooks |
| Queue UI | Bull Board |
| Containerization | Docker + Docker Compose |

## 🎨 Frontend Pages

- `/login` — Google OAuth sign-in
- `/dashboard` — Main dashboard (Scheduled + Sent tabs)
- `/auth/callback` — OAuth token handler
