const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const keyCache = {}; // Cache public PEM keys by kid to prevent redundant network requests

/**
 * Dynamically retrieves the public signing key from the JWKS endpoint of the token issuer.
 * Converts the JWK key properties into a PEM formatted public key.
 */
const getPublicKey = async (token) => {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || !decoded.header || !decoded.header.kid) {
    throw new Error('Invalid token or missing kid in header');
  }

  const kid = decoded.header.kid;
  if (keyCache[kid]) {
    return keyCache[kid];
  }

  const iss = decoded.payload?.iss;
  if (!iss) {
    throw new Error('Token payload missing issuer (iss)');
  }

  // Construct JWKS URL (OIDC standard endpoint)
  const jwksUrl = `${iss.replace(/\/$/, '')}/.well-known/jwks.json`;
  
  const response = await fetch(jwksUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS from ${jwksUrl}: ${response.status}`);
  }

  const jwks = await response.json();
  const jwk = jwks.keys?.find(k => k.kid === kid);
  if (!jwk) {
    throw new Error(`Key with kid ${kid} not found in JWKS`);
  }

  // Convert JWK to PEM format using Node's native crypto module
  const publicKey = crypto.createPublicKey({
    key: jwk,
    format: 'jwk',
  });

  const pem = publicKey.export({
    type: 'pkcs1',
    format: 'pem',
  });

  keyCache[kid] = pem;
  return pem;
};

/**
 * Verifies a JWT token. First attempts verification using the environment JWT secret,
 * then falls back to OIDC dynamic public key retrieval from the issuer.
 */
const verifyToken = async (token) => {
  let secret = process.env.NHOST_JWT_SECRET;
  let decoded = null;

  if (secret) {
    try {
      // Support PEM keys with escaped newlines and strip surrounding quotes
      secret = secret.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
      decoded = jwt.verify(token, secret);
    } catch (err) {
      console.warn('⚠️ JWT verification with env NHOST_JWT_SECRET failed, falling back to JWKS:', err.message);
    }
  }

  if (!decoded) {
    const publicKey = await getPublicKey(token);
    decoded = jwt.verify(token, publicKey);
  }

  return decoded;
};

module.exports = { verifyToken };
