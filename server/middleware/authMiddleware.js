const jwt = require('jsonwebtoken');

/**
 * Middleware to verify Nhost JWT from Authorization header.
 * Attaches decoded payload to req.user on success.
 * Returns 401 if token is missing or invalid.
 */
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    let secret = process.env.NHOST_JWT_SECRET;
    if (!secret) {
      console.error('NHOST_JWT_SECRET is not set in environment variables');
      return res.status(500).json({ error: 'Server misconfiguration: JWT secret missing' });
    }
    
    // Support PEM public keys with escaped newlines (e.g. '\n') in env files
    secret = secret.replace(/\\n/g, '\n');

    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('❌ JWT Verification Error:', err.message);
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

module.exports = authMiddleware;
