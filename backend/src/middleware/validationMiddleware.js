import { AppError } from '../utils/errors.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const BLOCKED_TYPO_TLDS = new Set(['cpm', 'con', 'cm', 'ogn']);

const isValidEmployeeEmail = (value) => {
  if (!value || typeof value !== 'string') return false;
  const email = value.trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) return false;
  const tld = email.split('.').pop();
  if (BLOCKED_TYPO_TLDS.has(tld)) return false;
  return true;
};

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

  if (!isValidEmployeeEmail(employeeId)) {
    return next(new AppError('Please enter a valid email address', 400));
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

  if (!isValidEmployeeEmail(employeeId)) {
    return next(new AppError('Please enter a valid email address', 400));
  }

  next();
};

/**
 * Validates OTP request payloads (verify/resend).
 */
export const validateOtpRequest = (req, res, next) => {
  const { employeeId } = req.body;
  if (!employeeId) {
    return next(new AppError('Employee ID is required', 400));
  }
  if (!isValidEmployeeEmail(employeeId)) {
    return next(new AppError('Please enter a valid email address', 400));
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
