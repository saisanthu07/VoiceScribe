const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

const DEEPGRAM_URL =
  'wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&channels=1&punctuate=true&interim_results=true';

/**
 * Attaches a WebSocket server to the given HTTP server.
 * Acts as a secure proxy between the browser and Deepgram,
 * keeping the Deepgram API key on the server side only.
 *
 * Flow:
 *   Browser ──(audio binary)──► WS Proxy ──(audio binary)──► Deepgram
 *   Browser ◄──(transcript)──── WS Proxy ◄──(transcript)──── Deepgram
 *
 * Auth: The browser passes its Nhost JWT as a query param: ?token=<jwt>
 */
function setupWebSocketProxy(server) {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (clientWs, req) => {
    // ── 1. Extract and verify the JWT from query string ─────────────────────
    let token = null;
    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      token = parsedUrl.searchParams.get('token');
    } catch (urlErr) {
      console.warn('WS url parse error:', urlErr.message);
    }

    if (!token) {
      console.warn('WS connection rejected: no token provided');
      clientWs.close(4001, 'Unauthorized: missing token');
      return;
    }

    let decoded;
    try {
      let secret = process.env.NHOST_JWT_SECRET;
      if (secret) {
        secret = secret.replace(/\\n/g, '\n');
      }
      decoded = jwt.verify(token, secret);
    } catch (err) {
      console.warn('WS connection rejected: invalid token —', err.message);
      clientWs.close(4001, 'Unauthorized: invalid token');
      return;
    }

    console.log(`🎙️  WS connected — user: ${decoded?.email || decoded?.sub}`);

    // ── 2. Open upstream WebSocket to Deepgram ──────────────────────────────
    const deepgramWs = new WebSocket(DEEPGRAM_URL, {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    });

    // Track connection readiness
    let deepgramReady = false;
    const audioQueue = [];

    deepgramWs.on('open', () => {
      deepgramReady = true;
      console.log('✅ Deepgram WS connected');

      // Flush any queued audio that arrived before Deepgram was ready
      while (audioQueue.length > 0) {
        const chunk = audioQueue.shift();
        if (deepgramWs.readyState === WebSocket.OPEN) {
          deepgramWs.send(chunk);
        }
      }
    });

    // ── 3. Pipe Deepgram transcripts → client ───────────────────────────────
    deepgramWs.on('message', (data) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data.toString());
      }
    });

    deepgramWs.on('error', (err) => {
      console.error('Deepgram WS error:', err.message);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ error: 'Deepgram connection error' }));
      }
    });

    deepgramWs.on('close', (code, reason) => {
      console.log(`Deepgram WS closed: ${code} — ${reason}`);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(1000, 'Deepgram session ended');
      }
    });

    // ── 4. Pipe client audio → Deepgram ─────────────────────────────────────
    clientWs.on('message', (data) => {
      if (deepgramReady && deepgramWs.readyState === WebSocket.OPEN) {
        deepgramWs.send(data);
      } else {
        // Queue audio until Deepgram is ready
        audioQueue.push(data);
      }
    });

    // ── 5. Cleanup on client disconnect ─────────────────────────────────────
    clientWs.on('close', (code, reason) => {
      console.log(`Client WS closed: ${code}`);
      if (deepgramWs.readyState === WebSocket.OPEN) {
        // Send CloseStream message to Deepgram for clean shutdown
        deepgramWs.send(JSON.stringify({ type: 'CloseStream' }));
        setTimeout(() => deepgramWs.close(), 500);
      }
    });

    clientWs.on('error', (err) => {
      console.error('Client WS error:', err.message);
      if (deepgramWs.readyState === WebSocket.OPEN) {
        deepgramWs.close();
      }
    });
  });

  console.log('🔌 WebSocket proxy initialized');
}

module.exports = { setupWebSocketProxy };
