const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const Transcript = require('../models/Transcript');

/**
 * POST /api/transcript/save
 * Protected — saves a completed transcript to MongoDB.
 * Body: { text: string }
 */
router.post('/save', authMiddleware, async (req, res) => {
  const { text } = req.body;

  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'Transcript text is required and cannot be empty' });
  }

  try {
    const userId = req.user?.sub;
    const email =
      req.user?.email ||
      req.user?.['https://hasura.io/jwt/claims']?.['x-hasura-user-email'] ||
      'unknown';

    const transcript = new Transcript({
      userId,
      email,
      text: text.trim(),
    });

    await transcript.save();

    res.status(201).json({
      message: 'Transcript saved successfully',
      transcript: {
        id: transcript._id,
        text: transcript.text,
        createdAt: transcript.createdAt,
      },
    });
  } catch (err) {
    console.error('Error saving transcript:', err);
    res.status(500).json({ error: 'Failed to save transcript' });
  }
});

/**
 * GET /api/transcript/history
 * Protected — returns the last 5 transcripts for the logged-in user.
 */
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.sub;

    const transcripts = await Transcript.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('text createdAt email');

    res.json({ transcripts });
  } catch (err) {
    console.error('Error fetching transcript history:', err);
    res.status(500).json({ error: 'Failed to fetch transcript history' });
  }
});

module.exports = router;
