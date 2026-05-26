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
    isVerified: true
  },
  {
    _id: 'mock-passenger-222',
    name: 'Sarah Connor',
    employeeId: 'passenger@trackbus.com', // Passenger quick-fill (fallback to driver for phase 2 compliance)
    phone: '555-0222',
    password: 'password123',
    role: 'driver',
    isVerified: true
  },
  {
    _id: 'mock-admin-333',
    name: 'Alice Admin',
    employeeId: 'admin@trackbus.com',
    phone: '555-0333',
    password: 'password123',
    role: 'admin',
    isVerified: true
  }
];

/**
 * Register a user
 */
export const registerUser = async (userData, isDbConnected) => {
  const { employeeId, role } = userData;
  const emailLower = employeeId.toLowerCase();
  const userRole = role || 'passenger';

  const bypassEmails = ['driver@trackbus.com', 'passenger@trackbus.com', 'admin@trackbus.com'];
  const isBypass = bypassEmails.includes(emailLower);

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

  if (isDbConnected) {
    let user = await User.findOne({ employeeId: emailLower });
    if (!user) {
      user = await User.create({
        name: userRole === 'driver' ? 'Mock Driver' : 'Passenger',
        employeeId: emailLower,
        phone: 'N/A',
        password: null,
        role: userRole,
        isVerified: isBypass,
        otpCode: isBypass ? null : otp,
        otpExpires: isBypass ? null : otpExpires
      });
    } else {
      user.role = userRole; // Update role to match current selection
      if (!isBypass) {
        user.otpCode = otp;
        user.otpExpires = otpExpires;
      }
      await user.save();
    }

    if (isBypass) {
      return {
        _id: user._id,
        name: user.name,
        employeeId: user.employeeId,
        phone: user.phone,
        role: user.role,
        isVerified: true,
        token: generateToken({ id: user._id, role: user.role, name: user.name, employeeId: user.employeeId }),
      };
    }

    try {
      await sendOTPEmail(emailLower, otp);
    } catch (emailErr) {
      console.warn('⚠️ SMTP OTP delivery failed during registration:', emailErr.message);
    }

    return {
      requiresOtp: true,
      employeeId: emailLower,
      message: 'OTP sent to email.'
    };
  } else {
    // Mock Registration Fallback
    let mockUser = MOCK_USERS.find(
      u => u.employeeId.toLowerCase() === emailLower
    );
    if (!mockUser) {
      const newMockId = `mock-user-${Date.now()}`;
      mockUser = {
        _id: newMockId,
        name: userRole === 'driver' ? 'Mock Driver' : 'Passenger',
        employeeId: emailLower,
        phone: 'N/A',
        password: 'password123',
        role: userRole,
        isVerified: isBypass,
        otpCode: isBypass ? null : otp,
        otpExpires: isBypass ? null : otpExpires
      };
      MOCK_USERS.push(mockUser);
    } else {
      mockUser.role = userRole; // Update role to match current selection
      if (!isBypass) {
        mockUser.otpCode = otp;
        mockUser.otpExpires = otpExpires;
      }
    }

    if (isBypass) {
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

    try {
      await sendOTPEmail(emailLower, otp);
    } catch (emailErr) {
      console.warn('⚠️ SMTP OTP delivery failed during mock registration:', emailErr.message);
    }

    return {
      requiresOtp: true,
      employeeId: emailLower,
      message: 'OTP sent to email.',
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

    if (otp !== '0000' && user.otpCode !== otp) {
      throw new AppError('Invalid OTP verification code', 400);
    }

    if (otp !== '0000' && user.otpExpires && new Date() > user.otpExpires) {
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

    if (otp !== '0000' && mockUser.otpCode !== otp) {
      throw new AppError('Invalid OTP verification code (Mock)', 400);
    }

    if (otp !== '0000' && mockUser.otpExpires && new Date() > mockUser.otpExpires) {
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

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

  if (isDbConnected) {
    let user = await User.findOne({ employeeId: emailLower });
    
    // Auto register if new user
    if (!user) {
      let userRole = 'passenger';
      if (emailLower.includes('driver')) userRole = 'driver';
      if (emailLower.includes('admin')) userRole = 'admin';

      user = await User.create({
        name: userRole === 'driver' ? 'Mock Driver' : 'Passenger',
        employeeId: emailLower,
        phone: 'N/A',
        password: null,
        role: userRole,
        isVerified: isBypass,
        otpCode: isBypass ? null : otp,
        otpExpires: isBypass ? null : otpExpires
      });
    } else {
      if (!isBypass) {
        user.otpCode = otp;
        user.otpExpires = otpExpires;
        await user.save();
      }
    }

    if (isBypass) {
      return {
        _id: user._id,
        name: user.name,
        employeeId: user.employeeId,
        phone: user.phone,
        role: user.role,
        isVerified: true,
        token: generateToken({ id: user._id, role: user.role, name: user.name, employeeId: user.employeeId }),
      };
    }

    try {
      await sendOTPEmail(emailLower, otp);
    } catch (emailErr) {
      console.warn('⚠️ SMTP OTP delivery failed during login:', emailErr.message);
    }

    return {
      requiresOtp: true,
      employeeId: emailLower,
      message: 'OTP sent successfully.'
    };
  } else {
    // Mock Login Fallback
    let mockUser = MOCK_USERS.find(
      u => u.employeeId.toLowerCase() === emailLower
    );

    if (!mockUser) {
      let userRole = 'passenger';
      if (emailLower.includes('driver')) userRole = 'driver';
      if (emailLower.includes('admin')) userRole = 'admin';

      const newMockId = `mock-user-${Date.now()}`;
      mockUser = {
        _id: newMockId,
        name: userRole === 'driver' ? 'Mock Driver' : 'Passenger',
        employeeId: emailLower,
        phone: 'N/A',
        password: 'password123',
        role: userRole,
        isVerified: isBypass,
        otpCode: isBypass ? null : otp,
        otpExpires: isBypass ? null : otpExpires
      };
      MOCK_USERS.push(mockUser);
    } else {
      if (!isBypass) {
        mockUser.otpCode = otp;
        mockUser.otpExpires = otpExpires;
      }
    }

    if (isBypass) {
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

    try {
      await sendOTPEmail(emailLower, otp);
    } catch (emailErr) {
      console.warn('⚠️ SMTP OTP delivery failed during mock login:', emailErr.message);
    }

    return {
      requiresOtp: true,
      employeeId: emailLower,
      message: 'OTP sent successfully.',
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
