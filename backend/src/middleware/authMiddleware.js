import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { ADMIN_LOGIN_EMAIL } from '../services/authService.js';
import { AppError } from '../utils/errors.js';

/**
 * Protect routes - Verifies JWT token and mounts req.user
 */
export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'trackbus_super_secret_key_2026_jwt_token_auth');

      // Retrieve user from the database
      req.user = await User.findById(decoded.id).select('-password');
      
      // Dynamically synchronize roles for bypass accounts to avoid stale DB state overrides
      if (req.user) {
        const emailLower = (req.user.employeeId || '').toLowerCase();
        if (emailLower === 'driver@trackbus.com') {
          req.user.role = 'driver';
        } else if (emailLower === ADMIN_LOGIN_EMAIL) {
          req.user.role = 'admin';
        }
      }

      if (!req.user) {
        return next(new AppError('Not authorized, user not found', 401));
      }

      console.log('🔑 JWT Auth Verification:', { 
        employeeId: req.user.employeeId, 
        role: req.user.role
      });

      next();
    } catch (error) {
      console.error('Auth verification error:', error.message);
      return next(new AppError('Not authorized, token failed', 401));
    }
  }

  if (!token) {
    return next(new AppError('Not authorized, no token provided', 401));
  }
};

/**
 * Authorize specific roles
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(
        new AppError(
          `Role (${req.user ? req.user.role : 'guest'}) is not authorized to access this resource`,
          403
        )
      );
    }
    next();
  };
};
