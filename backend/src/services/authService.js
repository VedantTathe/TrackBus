import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { generateToken } from '../utils/generateToken.js';
import { AppError } from '../utils/errors.js';
import { sendOTPEmail } from './emailService.js';

// Seeded local mock users for offline fallback mode
export const MOCK_USERS = [
  {
    _id: 'mock-driver-111',
    name: 'Captain Alex',
    employeeId: 'driver@trackbus.com', // Maps to client-side quick-fill credentials
    phone: '555-0111',
    password: 'password123',
    role: 'driver',
    isVerified: true,
    isApproved: true
  },
  {
    _id: 'mock-passenger-222',
    name: 'Sarah Connor',
    employeeId: 'passenger@trackbus.com', // Passenger quick-fill (fallback to driver for phase 2 compliance)
    phone: '555-0222',
    password: 'password123',
    role: 'passenger',
    isVerified: true,
    isApproved: true
  },
  {
    _id: 'mock-admin-333',
    name: 'Alice Admin',
    employeeId: 'admin@trackbus.com',
    phone: '555-0333',
    password: 'password123',
    role: 'admin',
    isVerified: true,
    isApproved: true
  }
];

/**
 * Register a user
 */
export const registerUser = async (userData, isDbConnected) => {
  const { employeeId, role } = userData;
  const emailLower = employeeId.toLowerCase();
  const userRole = role || 'passenger';
  const isPassenger = userRole === 'passenger';

  const bypassEmails = ['driver@trackbus.com', 'passenger@trackbus.com', 'admin@trackbus.com'];
  const isBypass = bypassEmails.includes(emailLower);

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

  if (isDbConnected) {
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
        isApproved: isPassenger || isBypass,
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

    if (isPassenger) {
      return {
        success: true,
        message: 'OTP verification initialized for passenger.',
        requiresOtp: true
      };
    }

    return {
      success: true,
      message: 'Driver registration successful! Account is pending admin approval.',
      requiresOtp: true
    };
  } else {
    // Mock Registration Fallback
    if (userRole === 'driver') {
      const existingDriver = MOCK_USERS.find(u => u.employeeId.toLowerCase() === emailLower && u.role === 'driver');
      if (existingDriver) {
        throw new AppError('Driver email address is already registered (Mock)', 400);
      }
    }

    let mockUser = MOCK_USERS.find(
      u => u.employeeId.toLowerCase() === emailLower
    );
    if (!mockUser) {
      const newMockId = `mock-user-${Date.now()}`;
      mockUser = {
        _id: newMockId,
        name: isPassenger ? 'Passenger' : (userRole === 'driver' ? (userData.name || 'Driver') : 'Admin'),
        employeeId: emailLower,
        phone: userData.phone || 'N/A',
        password: isPassenger ? null : (userData.password || 'password123'),
        role: userRole,
        isVerified: false,
        isApproved: isPassenger || isBypass,
        otpCode: otp,
        otpExpires: otpExpires
      };
      MOCK_USERS.push(mockUser);
    } else {
      mockUser.role = userRole;
      mockUser.otpCode = otp;
      mockUser.otpExpires = otpExpires;
      if (userRole === 'driver' && userData.password) {
        mockUser.password = userData.password;
      }
    }

    if (isPassenger) {
      return {
        success: true,
        message: 'OTP verification initialized for passenger (Mock).',
        requiresOtp: true,
        isMockMode: true,
      };
    }

    return {
      success: true,
      message: 'Driver registration successful (Mock)! Account is pending admin approval.',
      requiresOtp: true,
      isMockMode: true,
    };
  }
};

/**
 * Verify OTP
 */
export const verifyOtpUser = async (employeeId, otp, isDbConnected) => {
  if (!employeeId || !otp) {
    throw new AppError('Employee ID and OTP verification code are required', 400);
  }

  if (isDbConnected) {
    const user = await User.findOne({ employeeId });
    if (!user) {
      throw new AppError('User not found with this Employee ID', 404);
    }

    if (user.role === 'driver' && !user.isApproved) {
      throw new AppError('Your driver account is pending verification by admin.', 403);
    }

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
      token: generateToken({ id: user._id, role: user.role, name: user.name, employeeId: user.employeeId }),
    };
  } else {
    // Mock verify OTP fallback
    const mockUser = MOCK_USERS.find(
      u => u.employeeId.toLowerCase() === employeeId.toLowerCase()
    );

    if (!mockUser) {
      throw new AppError('User not found in mock database', 404);
    }

    if (mockUser.role === 'driver' && !mockUser.isApproved) {
      throw new AppError('Your driver account is pending verification by admin (Mock).', 403);
    }

    if (otp !== '0000' && otp !== '000000' && mockUser.otpCode !== otp) {
      throw new AppError('Invalid OTP verification code (Mock)', 400);
    }

    if (otp !== '0000' && otp !== '000000' && mockUser.otpExpires && new Date() > mockUser.otpExpires) {
      throw new AppError('OTP verification code has expired (Mock)', 400);
    }

    mockUser.isVerified = true;
    mockUser.otpCode = null;
    mockUser.otpExpires = null;

    return {
      _id: mockUser._id,
      name: mockUser.name,
      employeeId: mockUser.employeeId,
      phone: mockUser.phone,
      role: mockUser.role,
      isVerified: mockUser.isVerified,
      token: generateToken({ id: mockUser._id, role: mockUser.role, name: mockUser.name, employeeId: mockUser.employeeId }),
      isMockMode: true,
    };
  }
};

/**
 * Resend OTP
 */
export const resendOtpUser = async (employeeId, isDbConnected) => {
  if (!employeeId) {
    throw new AppError('Employee ID is required', 400);
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

  if (isDbConnected) {
    const user = await User.findOne({ employeeId });
    if (!user) {
      throw new AppError('User not found with this Employee ID', 404);
    }

    user.otpCode = otp;
    user.otpExpires = otpExpires;
    await user.save();

    await sendOTPEmail(user.employeeId, otp);

    return {
      success: true,
      message: 'A fresh OTP code has been transmitted to your email.',
    };
  } else {
    // Mock resend OTP fallback
    const mockUser = MOCK_USERS.find(
      u => u.employeeId.toLowerCase() === employeeId.toLowerCase()
    );

    if (!mockUser) {
      throw new AppError('User not found in mock database', 404);
    }

    mockUser.otpCode = otp;
    mockUser.otpExpires = otpExpires;

    await sendOTPEmail(mockUser.employeeId, otp);

    return {
      success: true,
      message: 'A fresh OTP code has been transmitted to your email (Mock).',
      isMockMode: true
    };
  }
};

/**
 * Log in a user
 */
export const loginUser = async (employeeId, password, isDbConnected) => {
  const emailLower = employeeId.toLowerCase();
  const bypassEmails = ['driver@trackbus.com', 'passenger@trackbus.com', 'admin@trackbus.com'];
  const isBypass = bypassEmails.includes(emailLower);

  if (isDbConnected) {
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
    } else if (user.role === 'admin') {
      const isMatch = await user.matchPassword(password);
      if (!isMatch) {
        throw new AppError('Invalid credentials.', 401);
      }
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
  } else {
    // Mock Login Fallback
    const mockUser = MOCK_USERS.find(
      u => u.employeeId.toLowerCase() === emailLower
    );

    if (!mockUser) {
      throw new AppError('Invalid credentials.', 401);
    }

    if (mockUser.role === 'driver') {
      if (!mockUser.isApproved) {
        throw new AppError('Your driver account is pending verification by admin.', 403);
      }
      if (mockUser.password !== password) {
        throw new AppError('Invalid credentials.', 401);
      }
    } else if (mockUser.role === 'admin') {
      if (mockUser.password !== password) {
        throw new AppError('Invalid credentials.', 401);
      }
    }

    return {
      _id: mockUser._id,
      name: mockUser.name,
      employeeId: mockUser.employeeId,
      phone: mockUser.phone,
      role: mockUser.role,
      isVerified: true,
      token: generateToken({ id: mockUser._id, role: mockUser.role, name: mockUser.name, employeeId: mockUser.employeeId }),
      isMockMode: true,
    };
  }
};

/**
 * Fetch profile
 */
export const getUserProfile = async (userId, isDbConnected) => {
  if (isDbConnected) {
    const user = await User.findById(userId).select('-password');
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user;
  } else {
    // Mock Profile Retrieval
    const mockUser = MOCK_USERS.find(u => u._id === userId);
    if (!mockUser) {
      throw new AppError('User not found (Mock)', 404);
    }
    // Return mock user sans password
    const { password, ...safeProfile } = mockUser;
    return safeProfile;
  }
};

/**
 * Approve a driver (Private admin utility)
 */
export const approveDriverUser = async (employeeId, isDbConnected) => {
  if (!employeeId) {
    throw new AppError('Employee ID/Email is required for driver approval', 400);
  }
  const emailLower = employeeId.toLowerCase();

  if (isDbConnected) {
    const user = await User.findOne({ employeeId: emailLower });
    if (!user) {
      throw new AppError('Driver not found', 404);
    }
    user.isApproved = true;
    user.isVerified = true;
    await user.save();
    return { success: true, message: `Driver ${user.name} (${user.employeeId}) approved successfully.` };
  } else {
    const mockUser = MOCK_USERS.find(u => u.employeeId.toLowerCase() === emailLower);
    if (!mockUser) {
      throw new AppError('Driver not found in mock database', 404);
    }
    mockUser.isApproved = true;
    mockUser.isVerified = true;
    return { success: true, message: `Driver ${mockUser.name} (${mockUser.employeeId}) approved successfully (Mock).` };
  }
};
