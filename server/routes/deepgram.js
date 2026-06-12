const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

/**
 * GET /api/deepgram/token
 * Protected — generates an ephemeral, short-lived (60s) token for client-side Deepgram connection.
 * Keeps the master DEEPGRAM_API_KEY secure on the server.
 */
router.get('/token', authMiddleware, async (req, res) => {
  const masterKey = process.env.DEEPGRAM_API_KEY;

  if (!masterKey) {
    console.error('❌ DEEPGRAM_API_KEY is not set in environment variables');
    return res.status(500).json({ error: 'Server misconfiguration: Deepgram key missing' });
  }

  try {
    const response = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${masterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ttl_seconds: 60,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Deepgram API error generating token:', errorText);
      return res.status(response.status).json({ error: 'Failed to generate token from Deepgram API' });
    }

    const data = await response.json();
    const token = data.access_token || data.token;

    if (!token) {
      console.error('❌ Token missing in Deepgram API response:', data);
      return res.status(502).json({ error: 'Invalid response from Deepgram token API' });
    }

    res.json({ token });
  } catch (err) {
    console.error('❌ Error requesting Deepgram token:', err.message);
    res.status(500).json({ error: 'Internal server error generating token' });
  }
});

module.exports = router;
