const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/authMiddleware');
const Transcript = require('../models/Transcript');

const ensureDbConnected = async () => {
  if (mongoose.connection.readyState === 1) return;
  
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is missing from environment variables');
  }
  
  console.log('🔄 MongoDB connecting (Serverless context)...');
  await mongoose.connect(mongoUri);
};

/**
 * POST /api/transcript/save
 * Protected — saves a completed transcript to MongoDB.
 * Body: { text: string }
 */
router.post('/save', authMiddleware, async (req, res) => {
  const { text } = req.body;

  try {
    await ensureDbConnected();
  } catch (dbErr) {
    console.error('❌ MongoDB Connection Failure:', dbErr.message);
    return res.status(503).json({ 
      error: 'Database connection is not established. Please verify that your MONGO_URI environment variable is configured correctly in your deployment settings.' 
    });
  }

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

router.get('/history', authMiddleware, async (req, res) => {
  try {
    await ensureDbConnected();
  } catch (dbErr) {
    console.error('❌ MongoDB Connection Failure:', dbErr.message);
    return res.status(503).json({ 
      error: 'Database connection is not established. Please verify that your MONGO_URI environment variable is configured correctly in your deployment settings.' 
    });
  }

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

/**
 * DELETE /api/transcript/:id
 * Protected — deletes a specific transcript by ID.
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.sub;

  try {
    const result = await Transcript.findOneAndDelete({ _id: id, userId });
    
    if (!result) {
      return res.status(404).json({ error: 'Transcript not found or unauthorized' });
    }
    
    res.json({ message: 'Transcript deleted successfully' });
  } catch (err) {
    console.error('Error deleting transcript:', err);
    res.status(500).json({ error: 'Failed to delete transcript' });
  }
});

module.exports = router;
