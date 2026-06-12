const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

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

module.exports = router;
