import { catchAsync } from '../utils/errors.js';
import * as authService from '../services/authService.js';

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
export const register = catchAsync(async (req, res, next) => {
  const isDbConnected = req.app.get('isDbConnected');
  const result = await authService.registerUser(req.body, isDbConnected);
  
  res.status(201).json(result);
});

/**
 * @desc    Authenticate user & get token
 * @route   POST /api/auth/login
 * @access  Public
 */
export const login = catchAsync(async (req, res, next) => {
  const { employeeId, password } = req.body;
  const isDbConnected = req.app.get('isDbConnected');
  const result = await authService.loginUser(employeeId, password, isDbConnected);
  
  res.status(200).json(result);
});

/**
 * @desc    Verify OTP code
 * @route   POST /api/auth/verify-otp
 * @access  Public
 */
export const verifyOtp = catchAsync(async (req, res, next) => {
  const { employeeId } = req.body;
  const otp = req.body.otp || req.body.otpCode;
  const isDbConnected = req.app.get('isDbConnected');
  const result = await authService.verifyOtpUser(employeeId, otp, isDbConnected);
  
  res.status(200).json(result);
});

/**
 * @desc    Resend OTP code
 * @route   POST /api/auth/resend-otp
 * @access  Public
 */
export const resendOtp = catchAsync(async (req, res, next) => {
  const { employeeId } = req.body;
  const isDbConnected = req.app.get('isDbConnected');
  const result = await authService.resendOtpUser(employeeId, isDbConnected);
  
  res.status(200).json(result);
});

/**
 * @desc    Get current user profile
 * @route   GET /api/auth/me
 * @access  Private
 */
export const getProfile = catchAsync(async (req, res, next) => {
  const isDbConnected = req.app.get('isDbConnected');
  const profile = await authService.getUserProfile(req.user._id || req.user.id, isDbConnected);
  
  res.status(200).json(profile);
});

/**
 * @desc    Approve a driver
 * @route   PUT /api/auth/approve-driver
 * @access  Private (Private API utility)
 */
export const approveDriver = catchAsync(async (req, res, next) => {
  const { employeeId } = req.body;
  const isDbConnected = req.app.get('isDbConnected');
  const result = await authService.approveDriverUser(employeeId, isDbConnected);
  
  res.status(200).json(result);
});

/**
 * @desc    Change password
 * @route   PUT /api/auth/change-password
 * @access  Private
 */
export const changePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  const isDbConnected = req.app.get('isDbConnected');
  const result = await authService.changePassword(req.user._id || req.user.id, currentPassword, newPassword, isDbConnected);
  res.status(200).json(result);
});
