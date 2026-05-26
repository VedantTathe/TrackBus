import jwt from 'jsonwebtoken';

/**
 * Generate a JWT token containing user details.
 * Defaults to 30 days expiration.
 */
export const generateToken = (payload) => {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'trackbus_super_secret_key_2026_jwt_token_auth',
    { expiresIn: '30d' }
  );
};
