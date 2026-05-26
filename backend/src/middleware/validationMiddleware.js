import { AppError } from '../utils/errors.js';

/**
 * Validates register payload.
 * Supports backward compatibility by mapping email -> employeeId and defaulting phone if omitted.
 */
export const validateRegister = (req, res, next) => {
  // Adapt frontend client if it sends email instead of employeeId
  if (req.body.email && !req.body.employeeId) {
    req.body.employeeId = req.body.email;
  }

  // Set default phone if absent (for frontend sign-ups)
  if (!req.body.phone) {
    req.body.phone = 'N/A';
  }

  // Set default name if absent
  if (!req.body.name) {
    req.body.name = 'Passenger';
  }

  const { employeeId } = req.body;

  if (!employeeId) {
    return next(new AppError('Please provide an email or employee ID', 400));
  }

  next();
};

/**
 * Validates login payload.
 * Supports backward-compatibility by mapping email -> employeeId.
 * Password is now optional for frictionless password-less login.
 */
export const validateLogin = (req, res, next) => {
  if (req.body.email && !req.body.employeeId) {
    req.body.employeeId = req.body.email;
  }

  const { employeeId } = req.body;

  if (!employeeId) {
    return next(new AppError('Please provide an email or employee ID', 400));
  }

  next();
};

/**
 * Validates bus creation payload.
 */
export const validateCreateBus = (req, res, next) => {
  const { busNumber, routeName, capacity } = req.body;

  if (!busNumber || !routeName || !capacity) {
    return next(new AppError('Please provide busNumber, routeName, and capacity', 400));
  }

  if (isNaN(capacity) || Number(capacity) <= 0) {
    return next(new AppError('Capacity must be a positive number', 400));
  }

  next();
};

/**
 * Validates driver assignment payload.
 */
export const validateAssignDriver = (req, res, next) => {
  const { busNumber, employeeId } = req.body;

  if (!busNumber || !employeeId) {
    return next(new AppError('Please provide busNumber and employeeId', 400));
  }

  next();
};
