const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

/**
 * GET /api/deepgram/token
 * Protected — generates an ephemeral, short-lived (60s) token for client-side Deepgram connection.
 * If the key has restricted permissions and cannot issue new tokens, falls back to returning the key itself.
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
      const errorJson = await response.json().catch(() => ({}));
      console.warn('⚠️ Deepgram token grant failed (likely due to restricted key permissions):', errorJson.err_msg || response.statusText);
      console.warn('⚠️ Falling back to returning DEEPGRAM_API_KEY directly for client session.');
      return res.json({ token: masterKey, isFallback: true });
    }

    const data = await response.json();
    const token = data.access_token || data.token;

    if (!token) {
      console.warn('⚠️ Token missing in Deepgram response. Falling back to master key.');
      return res.json({ token: masterKey, isFallback: true });
    }

    res.json({ token });
  } catch (err) {
    console.error('❌ Error requesting Deepgram token:', err.message);
    // Even on network error, try to return the master key as last resort
    res.json({ token: masterKey, isFallback: true });
  }
});

module.exports = router;
