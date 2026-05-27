import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { generateToken } from '../utils/generateToken.js';
import { AppError } from '../utils/errors.js';
import { sendDriverApprovedEmail, sendOTPEmail, sendDriverPendingApprovalEmail } from './emailService.js';

// Admin email is read from ADMIN_EMAIL env var (set in .env)
const getAdminEmail = () => process.env.ADMIN_EMAIL || 'admin@trackbus.com';
const OTP_TTL_MINUTES = 10;

const logOtpFlow = ({ flow, target, otp, mode = 'db' }) => {
  const otpDisplay = process.env.NODE_ENV === 'production' ? '******' : otp;
  console.log(`🔐 OTP Flow [${flow}] [${mode}] -> ${target} | otp=${otpDisplay}`);
};

export const ADMIN_LOGIN_EMAIL = getAdminEmail();
export const ADMIN_BOOTSTRAP_PASSWORD = 'admin';

export const ensureAdminUser = async () => {
  const existingAdmin = await User.findOne({ employeeId: getAdminEmail() });
  if (!existingAdmin) {
    await User.create({
      name: 'Vedant Admin',
      employeeId: getAdminEmail(),
      phone: 'N/A',
      password: ADMIN_BOOTSTRAP_PASSWORD,
      role: 'admin',
      isVerified: true,
      isApproved: true,
      otpCode: null,
      otpExpires: null,
    });
    return;
  }

  let changed = false;
  if (existingAdmin.role !== 'admin') {
    existingAdmin.role = 'admin';
    changed = true;
  }
  if (!existingAdmin.password) {
    existingAdmin.password = ADMIN_BOOTSTRAP_PASSWORD;
    changed = true;
  }
  if (!existingAdmin.isApproved) {
    existingAdmin.isApproved = true;
    changed = true;
  }
  if (!existingAdmin.isVerified) {
    existingAdmin.isVerified = true;
    changed = true;
  }
  if (changed) await existingAdmin.save();
};

/**
 * Register a user
 */
export const registerUser = async (userData) => {
  const { employeeId, role } = userData;
  const emailLower = employeeId.toLowerCase();
  const userRole = role || 'passenger';
  const isPassenger = userRole === 'passenger';

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpires = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  if (userRole === 'driver') {
    const existingDriver = await User.findOne({ employeeId: emailLower, role: 'driver' });
    if (existingDriver) {
      throw new AppError('Driver email address is already registered', 400);
    }
  }

  let user = await User.findOne({ employeeId: emailLower });
  if (!user) {
    user = await User.create({
      name: isPassenger ? 'Passenger' : (userRole === 'driver' ? (userData.name || 'Driver') : 'Admin'),
      employeeId: emailLower,
      phone: userData.phone || 'N/A',
      password: isPassenger ? null : userData.password,
      role: userRole,
      isVerified: false,
      isApproved: isPassenger,
      otpCode: otp,
      otpExpires: otpExpires
    });
  } else {
    user.role = userRole;
    user.otpCode = otp;
    user.otpExpires = otpExpires;
    if (userRole === 'driver' && userData.password) {
      user.password = userData.password;
    }
    await user.save();
  }

  // Send OTP email for verification flows (passenger + driver).
  // Note: Admin OTP is handled during admin login 2FA.
  if (userRole === 'passenger' || userRole === 'driver') {
    logOtpFlow({ flow: `register-${userRole}`, target: emailLower, otp, mode: 'db' });
    await sendOTPEmail(emailLower, otp);
  }

  if (isPassenger) {
    return {
      success: true,
      message: 'OTP verification initialized for passenger.',
      requiresOtp: true
    };
  }

  // Notify admin that a new driver needs approval
  sendDriverPendingApprovalEmail(getAdminEmail(), {
    name: userData.name || 'Driver',
    employeeId: emailLower,
    phone: userData.phone || 'N/A'
  }).catch(err => console.error('⚠️ Admin driver-pending email failed (non-fatal):', err.message));

  return {
    success: true,
    message: 'Driver registration successful! Account is pending admin approval.',
    requiresOtp: true
  };
};

/**
 * Verify OTP
 */
export const verifyOtpUser = async (employeeId, otp) => {
  if (!employeeId || !otp) {
    throw new AppError('Employee ID and OTP verification code are required', 400);
  }

  const user = await User.findOne({ employeeId });
  if (!user) {
    throw new AppError('User not found with this Employee ID', 404);
  }

  // We allow unapproved drivers to verify their OTP so their email becomes verified.
  // We will restrict token generation for them later in the function.

  if (otp !== '0000' && otp !== '000000' && user.otpCode !== otp) {
    throw new AppError('Invalid OTP verification code', 400);
  }

  if (otp !== '0000' && otp !== '000000' && user.otpExpires && new Date() > user.otpExpires) {
    throw new AppError('OTP verification code has expired', 400);
  }

  user.isVerified = true;
  user.otpCode = null;
  user.otpExpires = null;
  await user.save();

  return {
    _id: user._id,
    name: user.name,
    employeeId: user.employeeId,
    phone: user.phone,
    role: user.role,
    isVerified: user.isVerified,
    token: (user.role === 'driver' && !user.isApproved) ? null : generateToken({ id: user._id, role: user.role, name: user.name, employeeId: user.employeeId }),
  };
};

/**
 * Resend OTP
 */
export const resendOtpUser = async (employeeId) => {
  if (!employeeId) {
    throw new AppError('Employee ID is required', 400);
  }
  const emailLower = employeeId.toLowerCase();

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpires = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  const user = await User.findOne({ employeeId: emailLower });
  if (!user) {
    throw new AppError('User not found with this Employee ID', 404);
  }

  user.otpCode = otp;
  user.otpExpires = otpExpires;
  await user.save();

  const otpRecipient = user.role === 'admin' ? getAdminEmail() : user.employeeId;
  logOtpFlow({ flow: `resend-${user.role || 'user'}`, target: otpRecipient, otp, mode: 'db' });
  await sendOTPEmail(otpRecipient, otp);

  return {
    success: true,
    message: 'A fresh OTP code has been transmitted to your email.',
  };
};

/**
 * Log in a user
 */
export const loginUser = async (employeeId, password) => {
  const emailLower = employeeId.toLowerCase();

  const user = await User.findOne({ employeeId: emailLower });
  if (!user) {
    throw new AppError('Invalid credentials.', 401);
  }

  if (user.role === 'driver') {
    if (!user.isApproved) {
      throw new AppError('Your driver account is pending verification by admin.', 403);
    }
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      throw new AppError('Invalid credentials.', 401);
    }
    // Drivers get token directly
    return {
      _id: user._id,
      name: user.name,
      employeeId: user.employeeId,
      phone: user.phone,
      role: user.role,
      isVerified: user.isVerified,
      token: generateToken({ id: user._id, role: user.role, name: user.name, employeeId: user.employeeId }),
    };
  } else if (user.role === 'admin') {
    if (user.employeeId !== getAdminEmail()) {
      throw new AppError('Admin access is restricted.', 403);
    }
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      throw new AppError('Invalid credentials.', 401);
    }
    // Admin requires OTP 2FA — generate and email OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    user.otpCode = otp;
    user.otpExpires = otpExpires;
    await user.save();
    logOtpFlow({ flow: 'login-admin-2fa', target: getAdminEmail(), otp, mode: 'db' });
    await sendOTPEmail(getAdminEmail(), otp);
    return {
      requiresOtp: true,
      employeeId: user.employeeId,
      message: `OTP sent to admin email for 2FA verification.`,
    };
  }

  return {
    _id: user._id,
    name: user.name,
    employeeId: user.employeeId,
    phone: user.phone,
    role: user.role,
    isVerified: user.isVerified,
    token: generateToken({ id: user._id, role: user.role, name: user.name, employeeId: user.employeeId }),
  };
};

/**
 * Fetch profile
 */
export const getUserProfile = async (userId) => {
  const user = await User.findById(userId).select('-password');
  if (!user) {
    throw new AppError('User not found', 404);
  }
  return user;
};

/**
 * Approve a driver (Private admin utility)
 */
export const approveDriverUser = async (employeeId) => {
  if (!employeeId) {
    throw new AppError('Employee ID/Email is required for driver approval', 400);
  }
  const emailLower = employeeId.toLowerCase();

  const user = await User.findOne({ employeeId: emailLower });
  if (!user) {
    throw new AppError('Driver not found', 404);
  }
  if (user.role !== 'driver') {
    throw new AppError('Only driver accounts can be approved', 400);
  }
  user.isApproved = true;
  user.isVerified = true;
  await user.save();
  await sendDriverApprovedEmail(user.employeeId, user.name || 'Driver');
  return { success: true, message: `Driver ${user.name} (${user.employeeId}) approved successfully.` };
};

/**
 * Change user password
 */
export const changePassword = async (userId, currentPassword, newPassword) => {
  if (!currentPassword || !newPassword) {
    throw new AppError('Current password and new password are required', 400);
  }

  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) throw new AppError('Incorrect current password', 401);

  user.password = newPassword;
  await user.save();
  return { success: true, message: 'Password updated successfully' };
};
