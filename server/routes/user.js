const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/authMiddleware');
const Transcript = require('../models/Transcript');

/**
 * GET /api/user/profile
 * Protected route — requires valid Nhost JWT in Authorization header.
 * Returns authenticated user's email and a success message.
 */
router.get('/profile', authMiddleware, (req, res) => {
  // req.user is set by authMiddleware after successful JWT verification
  const email =
    req.user?.email ||
    req.user?.['https://hasura.io/jwt/claims']?.['x-hasura-user-email'] ||
    'unknown';

  res.json({
    message: 'Authenticated',
    email,
    userId: req.user?.sub,
  });
});

/**
 * POST /api/user/delete
 * Protected route — deletes user transcripts from MongoDB and calls Nhost GraphQL
 * admin endpoint to delete credentials if HASURA_GRAPHQL_ADMIN_SECRET is provided.
 */
router.post('/delete', authMiddleware, async (req, res) => {
  const userId = req.user?.sub;

  // Check if database is connected
  if (mongoose.connection.readyState !== 1) {
    console.error('❌ MongoDB Connection Error: Database is not connected (readyState !== 1)');
    return res.status(503).json({ 
      error: 'Database connection is not established. Please verify that your MONGO_URI is configured correctly in your deployment environment variables.' 
    });
  }

  if (!userId) {
    return res.status(400).json({ error: 'User ID not found in token' });
  }

  try {
    // 1. Delete user transcripts from MongoDB
    await Transcript.deleteMany({ userId });
    console.log(`🧹 MongoDB: Deleted transcripts for user: ${userId}`);

    // 2. Delete user from Nhost Auth (if HASURA_GRAPHQL_ADMIN_SECRET is provided)
    const adminSecret = process.env.HASURA_GRAPHQL_ADMIN_SECRET;
    const subdomain = process.env.VITE_NHOST_SUBDOMAIN || process.env.NHOST_SUBDOMAIN;
    const region = process.env.VITE_NHOST_REGION || process.env.NHOST_REGION;

    if (adminSecret && subdomain && region) {
      const graphqlUrl = `https://${subdomain}.graphql.${region}.nhost.run/v1/graphql`;

      const response = await fetch(graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-admin-secret': adminSecret,
        },
        body: JSON.stringify({
          query: `
            mutation DeleteUser($id: uuid!) {
              deleteUser(id: $id) {
                id
              }
            }
          `,
          variables: { id: userId },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        console.error('❌ Nhost GraphQL user deletion errors:', result.errors);
        return res.status(400).json({ error: 'Failed to delete account from Nhost auth system' });
      }

      console.log(`✅ Nhost Auth: Deleted user account: ${userId}`);
    } else {
      console.log('⚠️ Nhost admin credentials missing in server env. MongoDB transcripts cleared, but Nhost account was not deleted.');
    }

    res.json({ message: 'Account and associated transcripts deleted successfully.' });
  } catch (err) {
    console.error('❌ Error during account deletion:', err);
    res.status(500).json({ error: 'Internal server error during account deletion' });
  }
});

module.exports = router;
