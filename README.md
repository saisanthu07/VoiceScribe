# VoiceScribe — Production MERN Stack Speech-to-Text App

A fully functional production-ready MERN Stack Web Application that integrates **Nhost Auth (with RS256 JWT validation)** and **Deepgram Streaming API (real-time live speech-to-text)** with database persistence in **MongoDB**.

---

## 🌟 Key Features

1.  **Nhost Authentication**:
    *   Secure Email & Password authentication.
    *   Protected dashboard routing (`ProtectedRoute` checking session loading and auth state).
    *   Decoupled session persistence and server-side JWT verification using Nhost's public keys.
2.  **Live Speech-To-Text (Deepgram)**:
    *   Micro-animated, interactive recording panel.
    *   Low-level microphone audio downsampling to **16kHz signed 16-bit linear PCM** (Linear16) directly in the browser for high-accuracy speech recognition.
    *   **Secure WebSocket Proxy**: Audio chunks are securely piped through the Node.js backend to Deepgram. This keeps the `DEEPGRAM_API_KEY` completely safe and hidden from the browser.
3.  **MongoDB Persistence**:
    *   Transcripts are automatically saved to MongoDB when recording stops.
    *   Indexed by `userId` (derived from the Nhost JWT) for high-performance user history lookups.
    *   A clean sidebar displaying the user's last 5 saved transcripts with manual refresh support.
4.  **Premium Dark Glassmorphism UI**:
    *   Modern dark mode with fluid background gradient animations.
    *   Micro-interactions, pulse indicators during recording, and auto-scrolling terminal logs.
5.  **Single-Command Operation**:
    *   Concurrently runs developer builds or compiles production builds using workspace commands.

---

## 🛠️ Technology Stack

*   **Frontend**: React (Vite), React Router v6, Axios, `@nhost/react` SDK
*   **Backend**: Node.js, Express, `ws` (WebSockets), `jsonwebtoken`
*   **Database**: MongoDB via Mongoose ORM
*   **Auth Provider**: Nhost Auth
*   **STT Provider**: Deepgram Streaming API

---

## 📁 File Structure

```
root/
├── client/                          # React Frontend
│   ├── src/
│   │   ├── components/              # ProtectedRoute
│   │   ├── pages/                   # Login, Signup, Dashboard (Recording + History)
│   │   ├── nhostClient.js           # SDK initialization
│   │   ├── App.jsx                  # Main router config
│   │   └── index.css                # Premium styling system
│   ├── .env.example                 # Environment variables guide
│   └── package.json
│
├── server/                          # Express Backend
│   ├── middleware/                  # authMiddleware (RS256 JWT verifier)
│   ├── models/                      # Transcript schema
│   ├── routes/                      # User & Transcript routes
│   ├── wsProxy.js                   # secure WebSocket proxy to Deepgram
│   ├── index.js                     # Server entrypoint
│   ├── .env.example                 # Server env variables guide
│   └── package.json
│
├── package.json                     # Monorepo controller scripts
└── README.md
```

---

## 🚀 Getting Started

### 1. Setup Environment Variables

Create `.env` files inside both `client/` and `server/` using the templates provided in each directory.

**Client Environment (`client/.env`)**:
```env
VITE_NHOST_SUBDOMAIN=your_nhost_subdomain
VITE_NHOST_REGION=your_nhost_region
VITE_BACKEND_URL=http://localhost:5000
```

**Server Environment (`server/.env`)**:
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/subspace
NHOST_JWT_SECRET="-----BEGIN PUBLIC KEY-----\n..."
DEEPGRAM_API_KEY=your_deepgram_api_key
```

> [!TIP]
> The `NHOST_JWT_SECRET` must be the PEM-formatted public key matching Nhost's token signature configuration. Newline characters can be escaped with `\n` (the server automatically converts them to real newlines during initialization).

---

### 2. Install Dependencies (Single Command)

In the root directory, run:
```bash
npm run setup
```
This automatically runs `npm install` for the root, frontend, and backend packages.

---

### 3. Running the App

#### Development Mode:
To spin up both servers concurrently with hot-reloading (Vite + Nodemon):
```bash
npm run dev
```

#### Production Mode (Deployment Ready):
To test/deploy the production bundle:
1. Build the production React application:
   ```bash
   npm run build
   ```
2. Start the production Express server:
   ```bash
   npm start
   ```
   The backend Express server will automatically serve the static React bundle from `client/dist`.

---

## 🔒 Security Practices Implemented

*   **API Key Isolation**: The Deepgram API key resides completely on the server-side and is never exposed to the browser.
*   **Decoupled JWT Token Verification**: Implemented standard RS256 token verification at the controller level using `jsonwebtoken` to verify cryptographically signed tokens.
*   **CORS Protection**: The Express app utilizes a strict CORS policy allowing only specified dev environments, your configured production client domain, and Vercel preview domains (`.vercel.app`).
*   **Modulus-to-PEM Sanitization**: Safely handles key formats and resolves double-escaped newlines in environment strings automatically.

---

## 🚀 Deployment Guide (Vercel & Persistent Hosts)

### Vercel Deployment Config (`vercel.json`)
A root-level `vercel.json` has been included in the repository, enabling one-click monorepo deployment of the client and server route rewrites.

> [!WARNING]
> **Vercel Serverless WebSocket Limitation**:
> Vercel hosts backend routes as serverless functions. **Serverless environments do not support persistent TCP/WebSocket connections (`ws://` / `wss://`)**. 
> While standard Express API routes (like `/api/user/profile` and `/api/transcript/save`) will work perfectly on Vercel, the **Deepgram real-time audio streaming proxy will fail to hold connections** due to serverless timeouts.

### Recommended Production Topology
For a fully functional live streaming setup:
1.  **Frontend (React Client)**: Deploy to **Vercel** pointing to the `client` directory (Build command: `npm run build`, Output directory: `dist`).
2.  **Backend (Express API & WS Proxy)**: Deploy to a persistent cloud hosting provider like **Render, Railway, Heroku, or AWS App Runner**. Ensure you add the server environment variables in their respective dashboards.

