import User from '../models/user.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import jwtConfig from '../config/jwtConfig.js';
import emailService from './emailService.js';
import { createStarterCategoriesForUser } from './starterCategoryService.js';
import walletService from './walletService.js';

const register = async (userData, baseUrl) => {
  const { email: rawEmail, password, fullName, phone, avatarUrl } = userData;
  const email =
    typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : rawEmail;

  // Check existing email
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return {
      success: false,
      statusCode: 400,
      message: 'Email đã được sử dụng',
    };
  }

  // Hash password into passwordHash
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const user = new User({
    email,
    passwordHash: hashedPassword,
    fullName,
    phone,
    avatarUrl,
    isActive: false,
  });

  await user.save();

  // 🎯 SETUP USER ONBOARDING - Tạo default wallet + starter categories
  try {
    // 1. Tạo default wallet
    console.log(`🎯 Setting up onboarding for new user ${user._id}...`);

    const defaultWalletResult = await walletService.createWallet(user._id, {
      walletName: 'Ví tiền mặt',
      walletType: 'cash',
      currency: 'VND',
      isDefault: true
    });

    if (!defaultWalletResult.success) {
      console.error('Failed to create default wallet:', defaultWalletResult.message);
    } else {
      console.log(`✅ Created default wallet for user ${user._id}`);
    }

    // 2. Tạo starter categories
    await createStarterCategoriesForUser(user._id);
    console.log(`✅ Created starter categories for user ${user._id}`);

  } catch (error) {
    console.error(`❌ Onboarding setup failed for user ${user._id}:`, error);
    // Không throw error để không block registration
    // User có thể setup manually sau
  }

  // Send verification email (kept as-is)
  if (baseUrl) {
    const emailResult = await emailService.sendVerificationEmail(user, baseUrl);
    if (!emailResult.success) {
      return {
        success: false,
        statusCode: 500,
        message: 'Không thể gửi email xác thực',
      };
    }
  }

  const { accessToken, refreshToken } = generateToken(user);

  return {
    success: true,
    statusCode: 201,
    message: 'Đăng ký thành công. Vui lòng kiểm tra email để xác thực.',
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      timezone: user.timezone,
      language: user.language,
      isActive: user.isActive,
    },
  };
};

let login = async (email, password) => {
  const normalizedEmail =
    typeof email === 'string' ? email.trim().toLowerCase() : email;
  const normalizedPassword =
    typeof password === 'string' ? password.trim() : password;
  let user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    return {
      success: false,
      statusCode: 400,
      message: 'Thông tin đăng nhập không hợp lệ',
    };
  }

  const storedHash = user.passwordHash || user.password; // fallback legacy field
  if (!storedHash) {
    return {
      success: false,
      statusCode: 400,
      message: 'Thông tin đăng nhập không hợp lệ',
    };
  }

  const isMatch = await bcrypt.compare(normalizedPassword, storedHash);
  if (!isMatch) {
    return {
      success: false,
      statusCode: 400,
      message: 'Thông tin đăng nhập không hợp lệ',
    };
  }

  if (!user.isActive) {
    return {
      success: false,
      statusCode: 403,
      message: 'Tài khoản chưa được xác thực qua email',
    };
  }

  // Update lastLoginAt
  user.lastLoginAt = new Date();
  await user.save();

  const { accessToken, refreshToken } = generateToken(user);

  return {
    success: true,
    statusCode: 200,
    message: 'Đăng nhập thành công',
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      timezone: user.timezone,
      language: user.language,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
    },
    needVerification: false,
  };
};

let generateToken = (user) => {
  const accessToken = jwt.sign(
    { id: user._id, role: user.role },
    jwtConfig.secret,
    {
      expiresIn: jwtConfig.expiresIn,
    },
  );

  const refreshToken = jwt.sign({ id: user._id }, jwtConfig.refreshSecret, {
    expiresIn: jwtConfig.refreshExpiresIn,
  });

  return { accessToken, refreshToken };
};

const verifyToken = async (token) => {
  try {
    const decoded = jwt.verify(token, jwtConfig.secret);
    if (!decoded.id) {
      return {
        success: false,
        statusCode: 401,
        message: 'Token không chứa ID người dùng',
      };
    }

    const user = await User.findById(decoded.id).select('-passwordHash');
    if (!user) {
      return {
        success: false,
        statusCode: 401,
        message: 'Không tìm thấy người dùng',
      };
    }

    return {
      success: true,
      statusCode: 200,
      user: {
        id: user._id.toString(),
        role: user.role,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
        language: user.language,
        isActive: user.isActive,
      },
    };
  } catch (error) {
    console.error('Verify token error:', error);
    return {
      success: false,
      statusCode: 401,
      message: 'Token không hợp lệ hoặc đã hết hạn',
    };
  }
};

// Verify user email
const verifyEmailToken = async (token, returnUrl) => {
  const result = await emailService.verifyEmail(token);
  if (result.success && returnUrl) {
    result.returnUrl = returnUrl;
  }
  return result;
};

// Resend verification email
const resendVerificationEmail = async (email, baseUrl) => {
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return {
        success: false,
        statusCode: 404,
        message: 'Không tìm thấy người dùng',
      };
    }
    const emailResult = await emailService.sendVerificationEmail(user, baseUrl);
    if (!emailResult.success) {
      return {
        success: false,
        statusCode: 500,
        message: 'Không thể gửi email xác thực',
        error: emailResult.error,
      };
    }
    return {
      success: true,
      statusCode: 200,
      message: 'Đã gửi email xác thực thành công',
    };
  } catch (error) {
    console.error('Resend verification error:', error);
    return {
      success: false,
      statusCode: 500,
      message: 'Lỗi máy chủ',
      error: error.message,
    };
  }
};

// Khởi tạo quá trình reset password
const forgotPassword = async (email, baseUrl) => {
  try {
    // 1. Tìm user (nếu tồn tại) nhưng KHÔNG phản hồi cho client biết
    const user = await User.findOne({ email });

    if (user) {
      // Gửi email reset password (không dùng cooldown trên model)
      const { default: emailService } = await import('./emailService.js');
      await emailService.sendResetPasswordEmail(user, baseUrl);
    }

    // 4. Phản hồi luôn giống nhau (ngay cả khi user không tồn tại)
    return {
      success: true,
      statusCode: 200,
      message: 'Nếu email tồn tại, chúng tôi đã gửi link đặt lại mật khẩu.',
    };
  } catch (error) {
    console.error('Forgot password error:', error);
    return {
      success: false,
      statusCode: 500,
      message: 'Lỗi hệ thống',
      error: error.message,
    };
  }
};

// Thực hiện reset password
const resetPasswordWithToken = async (token, newPassword) => {
  try {
    // Kiểm tra độ mạnh của mật khẩu (tùy chọn)
    if (newPassword.length < 6) {
      return {
        success: false,
        statusCode: 400,
        message: 'Mật khẩu phải có ít nhất 6 ký tự',
      };
    }

    const result = await emailService.resetPassword(token, newPassword);
    return result;
  } catch (error) {
    console.error('Reset password error:', error);
    return {
      success: false,
      statusCode: 500,
      message: 'Lỗi hệ thống',
      error: error.message,
    };
  }
};

const changePassword = async (userId, oldPassword, newPassword) => {
  try {
    if (!oldPassword || !newPassword) {
      return {
        success: false,
        statusCode: 400,
        message: 'Vui lòng nhập đầy đủ mật khẩu cũ và mật khẩu mới',
      };
    }

    if (newPassword.length < 6) {
      return {
        success: false,
        statusCode: 400,
        message: 'Mật khẩu mới phải có ít nhất 6 ký tự',
      };
    }

    const user = await User.findById(userId);
    if (!user) {
      return {
        success: false,
        statusCode: 404,
        message: 'Không tìm thấy người dùng',
      };
    }

    const isValidPassword = await bcrypt.compare(
      oldPassword,
      user.passwordHash,
    );
    if (!isValidPassword) {
      return {
        success: false,
        statusCode: 400,
        message: 'Mật khẩu cũ không chính xác',
      };
    }

    if (oldPassword === newPassword) {
      return {
        success: false,
        statusCode: 400,
        message: 'Mật khẩu mới không được trùng với mật khẩu cũ',
      };
    }

    // Hash and save new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    user.passwordHash = hashedPassword;
    await user.save();

    return {
      success: true,
      statusCode: 200,
      message: 'Mật khẩu đã được thay đổi thành công',
    };
  } catch (error) {
    console.error('Change password error:', error);
    return {
      success: false,
      statusCode: 500,
      message: 'Lỗi khi thay đổi mật khẩu',
      error: error.message,
    };
  }
};

const refreshToken = async (refreshToken) => {
  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, jwtConfig.refreshSecret);

    // Find user
    const user = await User.findById(decoded.id).select('-passwordHash');
    if (!user) {
      return {
        success: false,
        statusCode: 404,
        message: 'Không tìm thấy người dùng',
      };
    }

    // Generate new tokens
    const tokens = generateToken(user);

    return {
      success: true,
      statusCode: 200,
      message: 'Làm mới token thành công',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  } catch (error) {
    console.error('Refresh token error:', error);
    return {
      success: false,
      statusCode: 401,
      message: 'Refresh token không hợp lệ hoặc đã hết hạn',
    };
  }
};

// Đăng nhập Google với dữ liệu user từ frontend
const googleLogin = async (userData) => {
  try {
    const { email, name, picture } = userData;

    if (!email) {
      return {
        success: false,
        statusCode: 400,
        message: 'Không lấy được email từ Google',
      };
    }

    // Tìm user theo email
    let user = await User.findOne({ email });
    if (!user) {
      // Nếu chưa có user, tạo mới
      // Tạo một password hash ngẫu nhiên cho Google user
      const salt = await bcrypt.genSalt(10);
      const randomPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(randomPassword, salt);

      user = new User({
        fullName: name || 'Google User',
        email,
        passwordHash: hashedPassword,
        avatarUrl: picture || '',
      });
      await user.save();
    }

    // Cập nhật mốc đăng nhập cuối
    const now = new Date();
    user.lastLoginAt = now;
    await user.save();

    // Đăng nhập thành công, tạo token
    let { accessToken, refreshToken } = generateToken(user);
    return {
      success: true,
      statusCode: 200,
      message: 'Đăng nhập Google thành công',
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
        language: user.language,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
      },
      needVerification: false,
    };
  } catch (error) {
    console.error('Google login error:', error);
    return {
      success: false,
      statusCode: 500,
      message: 'Lỗi server khi đăng nhập Google',
      error: error.message,
    };
  }
};

export default {
  register,
  login,
  generateToken,
  verifyToken,
  verifyEmailToken,
  resendVerificationEmail,
  forgotPassword,
  resetPasswordWithToken,
  changePassword,
  refreshToken,
  googleLogin,
};
