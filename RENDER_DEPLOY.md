# 🚀 Hosting ReachInbox on Render

This guide walks you through deploying the complete **ReachInbox Email Scheduler** (Backend + Frontend + PostgreSQL + Redis) on [Render](https://render.com).

---

## ⚡ Method 1: 1-Click Render Blueprint (Recommended)

The repository includes a ready-to-use [`render.yaml`](./render.yaml) file. Render's Blueprint feature will automatically provision:
- 🐘 **PostgreSQL Database** (`email-scheduler-db`)
- 🔴 **Managed Redis** (`email-scheduler-redis` for BullMQ & rate limits)
- ⚙️ **Express Backend Web Service** (`email-scheduler-backend`)
- 💻 **Next.js Frontend Web Service** (`email-scheduler-frontend`)

### Step-by-Step Instructions:

1. **Push your code to GitHub**:
   ```bash
   git add .
   git commit -m "feat: Add Render blueprint and hosting configuration"
   git push origin main
   ```

2. **Log into Render**:
   - Go to [dashboard.render.com](https://dashboard.render.com/) and sign in with your GitHub account.

3. **Deploy using Blueprint**:
   - Click the **New +** button in the top right.
   - Select **Blueprint**.
   - Connect your repository: `BiniD11/Reachinbox`.
   - Render will parse `render.yaml` and list all 4 components.
   - Click **Apply**.

4. **Automatic Wiring**:
   - Render will generate `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, and `SESSION_SECRET` automatically.
   - The backend runs database migrations (`npx prisma db push`) and starts the BullMQ workers.
   - The frontend automatically receives the backend URL via `NEXT_PUBLIC_API_URL`.

---

## 🛠️ Method 2: Manual Service Creation (Alternative)

If you prefer to configure each service manually in the Render dashboard:

### 1. Create PostgreSQL Database
- Click **New +** ➔ **PostgreSQL**.
- Name: `email-scheduler-db`
- Database: `email_scheduler`
- User: `reachinbox_user` (Render reserves 'postgres', so use a custom name)
- Plan: **Free**
- Copy the **Internal Database URL** once created.

### 2. Create Redis Key-Value Store
- Click **New +** ➔ **Redis**.
- Name: `email-scheduler-redis`
- Plan: **Free**
- Copy the **Internal Redis URL** once created.

### 3. Create Backend Web Service
- Click **New +** ➔ **Web Service**.
- Connect your `Reachinbox` repo.
- Root Directory: `backend`
- Environment: `Node`
- Build Command: `npm install && npx prisma generate && npx prisma db push && npm run build`
- Start Command: `npm start`
- Add Environment Variables:
  | Key | Value |
  |---|---|
  | `NODE_ENV` | `production` |
  | `PORT` | `10000` |
  | `DATABASE_URL` | *(Paste Internal Database URL from Step 1)* |
  | `REDIS_URL` | *(Paste Internal Redis URL from Step 2)* |
  | `FRONTEND_URL` | *(Your Frontend Render URL, e.g. `https://email-scheduler-frontend.onrender.com`)* |
  | `JWT_SECRET` | *(Random 32-character string)* |
  | `SESSION_SECRET` | *(Random 32-character string)* |
  | `MAX_EMAILS_PER_HOUR` | `200` |
  | `MAX_EMAILS_PER_HOUR_PER_SENDER` | `100` |
  | `WORKER_CONCURRENCY` | `5` |
  | `MIN_DELAY_BETWEEN_SENDS_MS` | `2000` |

### 4. Create Frontend Web Service
- Click **New +** ➔ **Web Service**.
- Connect your `Reachinbox` repo.
- Root Directory: `frontend`
- Environment: `Node`
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Add Environment Variables:
  | Key | Value |
  |---|---|
  | `NODE_ENV` | `production` |
  | `NEXT_PUBLIC_API_URL` | *(Your Backend Render URL, e.g. `https://email-scheduler-backend.onrender.com`)* |

---

## 🔑 Optional OAuth Credentials (Google & Slack)

If you want live Google OAuth and Slack Notifications active in production, add these variables in your backend Render dashboard:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_CALLBACK_URL=https://<your-backend-url>.onrender.com/auth/google/callback

# Slack OAuth
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret
SLACK_REDIRECT_URI=https://<your-backend-url>.onrender.com/auth/slack/callback
```

*(Note: The app includes a built-in **"Quick Demo Sign-In"** button, allowing you and evaluators to test the dashboard immediately even without configuring Google OAuth keys).*

---

## 🔎 Accessing the Services Once Deployed

| Service | URL |
|---|---|
| **Frontend Dashboard** | `https://email-scheduler-frontend.onrender.com` |
| **Backend REST APIs** | `https://email-scheduler-backend.onrender.com` |
| **Bull Board Queue UI** | `https://email-scheduler-backend.onrender.com/admin/queues` |
