import crypto from 'crypto';
import {
  sendEmail,
  verificationEmailTemplate,
  resetPasswordEmailTemplate,
} from '../config/emailConfig.js';
import Token from '../models/token.js';
import User from '../models/user.js';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

// Tạo token xác thực
const generateVerificationToken = async (userId) => {
  // Tạo token ngẫu nhiên
  const token = crypto.randomBytes(32).toString('hex');

  // Lưu token vào database
  await Token.create({
    userId,
    token,
    type: 'verification',
  });

  return token;
};

// Gửi email xác thực tài khoản
const sendVerificationEmail = async (user, baseUrl) => {
  try {
    // Tạo token xác thực
    const token = await generateVerificationToken(user._id);

    const frontendUrl = process.env.FRONTEND_URL || baseUrl;

    // Tạo link xác thực
    const verificationLink = `${frontendUrl}/verify-email/${token}`;

    // Thiết lập thông tin email
    const emailContent = verificationEmailTemplate(
      user.fullName,
      verificationLink,
    );

    // Thông tin người nhận
    const mailOptions = {
      from: `${process.env.APP_NAME || 'FinWise'} <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: emailContent.subject,
      html: emailContent.html,
    };

    // Gửi email
    await sendEmail(mailOptions);

    return {
      success: true,
      message: 'Email xác thực đã được gửi',
    };
  } catch (error) {
    console.error('Send verification email error:', error);
    return {
      success: false,
      message: 'Không thể gửi email xác thực',
      error: error.message,
    };
  }
};

// Xác thực email bằng token
const verifyEmail = async (token) => {
  try {
    // Tìm token trong database
    const verificationToken = await Token.findOne({
      token,
      type: 'verification',
    });

    if (!verificationToken) {
      return {
        success: false,
        statusCode: 400,
        message: 'Token không hợp lệ hoặc đã hết hạn',
      };
    }

    // Cập nhật trạng thái xác thực của người dùng
    const user = await User.findByIdAndUpdate(
      verificationToken.userId,
      { isActive: true },
      { new: true },
    );

    if (!user) {
      return {
        success: false,
        statusCode: 404,
        message: 'Không tìm thấy người dùng',
      };
    }

    // Xóa token sau khi đã sử dụng
    await Token.findByIdAndDelete(verificationToken._id);

    return {
      success: true,
      statusCode: 200,
      message: 'Xác thực email thành công',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
      },
    };
  } catch (error) {
    console.error('Verify email error:', error);
    return {
      success: false,
      statusCode: 500,
      message: 'Lỗi hệ thống',
      error: error.message,
    };
  }
};

// Tạo token reset password
const generateResetPasswordToken = async (userId) => {
  // Tạo token ngẫu nhiên
  const token = crypto.randomBytes(32).toString('hex');

  // Lưu token vào database với thời hạn 1 giờ
  await Token.create({
    userId,
    token,
    type: 'reset-password',
  });

  return token;
};

// Gửi email reset password
const sendResetPasswordEmail = async (user, baseUrl) => {
  try {
    // Tạo token reset password
    const token = await generateResetPasswordToken(user._id);

    const frontendUrl = process.env.FRONTEND_URL || baseUrl;

    // Tạo link reset password
    const resetLink = `${frontendUrl}/reset-password/${token}`;

    // Thiết lập thông tin email
    const emailContent = resetPasswordEmailTemplate(user.fullName, resetLink);

    // Thông tin người nhận
    const mailOptions = {
      from: `${process.env.APP_NAME || 'FinWise'} <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: emailContent.subject,
      html: emailContent.html,
    };

    // Gửi email
    await sendEmail(mailOptions);

    return {
      success: true,
      message: 'Email đặt lại mật khẩu đã được gửi',
    };
  } catch (error) {
    console.error('Send reset password email error:', error);
    return {
      success: false,
      message: 'Không thể gửi email đặt lại mật khẩu',
      error: error.message,
    };
  }
};

// Xác thực token reset password và cập nhật mật khẩu
const resetPassword = async (token, newPassword) => {
  try {
    // Tìm token trong database
    const resetToken = await Token.findOne({
      token,
      type: 'reset-password',
    });

    if (!resetToken) {
      return {
        success: false,
        statusCode: 400,
        message: 'Token không hợp lệ hoặc đã hết hạn',
      };
    }

    // Mã hóa mật khẩu mới
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Cập nhật mật khẩu người dùng
    const user = await User.findByIdAndUpdate(
      resetToken.userId,
      { passwordHash: hashedPassword },
      { new: true },
    );

    if (!user) {
      return {
        success: false,
        statusCode: 404,
        message: 'Không tìm thấy người dùng',
      };
    }

    // Xóa token sau khi đã sử dụng
    await Token.findByIdAndDelete(resetToken._id);

    return {
      success: true,
      statusCode: 200,
      message: 'Đặt lại mật khẩu thành công',
    };
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

// Gửi email xác nhận booking
const sendBookingConfirmation = async (appointment) => {
  try {
    const customer = appointment.customer;
    const vehicle = appointment.vehicle;
    const serviceCenter = appointment.serviceCenter;
    const serviceType = appointment.serviceType;

    const appointmentDate = new Date(
      appointment.appointmentTime.date,
    ).toLocaleDateString('vi-VN');
    const appointmentTime = appointment.appointmentTime.startTime;

    // Derive display fields
    const isInspectionOnly = Boolean(
      appointment?.serviceDetails?.isInspectionOnly,
    );
    const isFromPackage = Boolean(appointment?.serviceDetails?.isFromPackage);
    const paymentMethod = appointment?.payment?.method;
    const paymentStatus = appointment?.payment?.status;
    const estimatedCost =
      typeof appointment?.serviceDetails?.estimatedCost === 'number'
        ? appointment.serviceDetails.estimatedCost
        : 0;

    const paymentMethodLabel = (() => {
      if (estimatedCost === 0) return 'Không yêu cầu thanh toán';
      switch (paymentMethod) {
        case 'ewallet':
          return 'Thanh toán online';
        case 'cash':
          return 'Thanh toán tại trung tâm';
        case 'card':
          return 'Thanh toán bằng thẻ';
        case 'banking':
          return 'Chuyển khoản ngân hàng';
        default:
          return 'Chưa chọn phương thức';
      }
    })();

    const serviceLabel = isInspectionOnly
      ? 'Kiểm tra tổng quát trước (chưa chọn dịch vụ cụ thể)'
      : serviceType?.name || 'N/A';

    // Safe vehicle model info (avoid crash when not populated)
    const vm = vehicle?.vehicleInfo?.vehicleModel;
    const vehicleModelBrand =
      vm && typeof vm === 'object' && 'brand' in vm ? vm.brand || '' : '';
    const vehicleModelName =
      vm && typeof vm === 'object' && 'modelName' in vm
        ? vm.modelName || ''
        : '';
    const vehicleYear = vehicle?.vehicleInfo?.year || '';
    const vehicleLicensePlate = vehicle?.vehicleInfo?.licensePlate || '';

    const packageLabel = isFromPackage ? 'Có - Sử dụng gói dịch vụ' : 'Không';

    // Tạo nội dung email
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 28px;">EVCare</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px;">Xác nhận đặt lịch bảo dưỡng</p>
        </div>
        
        <div style="padding: 30px; background: #f8f9fa;">
          <h2 style="color: #333; margin-bottom: 20px;">Xin chào ${customer.fullName || customer.username}!</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Cảm ơn bạn đã đặt lịch bảo dưỡng tại EVCare. Chúng tôi đã nhận được yêu cầu của bạn và đang xử lý.
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h3 style="color: #333; margin-bottom: 15px;">Thông tin đặt lịch</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666; width: 120px;">Xe:</td>
                <td style="padding: 8px 0; color: #333; font-weight: 500;">${vehicleModelBrand} ${vehicleModelName} ${vehicleYear}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Biển số:</td>
                <td style="padding: 8px 0; color: #333; font-weight: 500;">${vehicleLicensePlate}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Dịch vụ:</td>
                <td style="padding: 8px 0; color: #333; font-weight: 500;">${serviceLabel}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Trung tâm:</td>
                <td style="padding: 8px 0; color: #333; font-weight: 500;">${serviceCenter.name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Ngày:</td>
                <td style="padding: 8px 0; color: #333; font-weight: 500;">${appointmentDate}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Giờ:</td>
                <td style="padding: 8px 0; color: #333; font-weight: 500;">${appointmentTime}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Gói dịch vụ:</td>
                <td style="padding: 8px 0; color: #333; font-weight: 500;">${packageLabel}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Phương thức thanh toán:</td>
                <td style="padding: 8px 0; color: #333; font-weight: 500;">${paymentMethodLabel}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Trạng thái:</td>
                <td style="padding: 8px 0; color: #ff9800; font-weight: 500;">Chờ xác nhận</td>
              </tr>
            </table>
          </div>
          
          <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #1976d2; font-weight: 500;">
              📞 Liên hệ: ${serviceCenter.contact.phone} | ${serviceCenter.contact.email}
            </p>
            <p style="margin: 5px 0 0 0; color: #1976d2;">
              📍 Địa chỉ: ${serviceCenter.address.street}, ${serviceCenter.address.ward}, ${serviceCenter.address.district}, ${serviceCenter.address.city}
            </p>
          </div>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Trung tâm sẽ liên hệ với bạn trong vòng 24 giờ để xác nhận lịch hẹn. 
            Vui lòng giữ điện thoại để nhận cuộc gọi xác nhận.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'https://evcare.com'}/my-bookings" 
               style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">
              Xem lịch hẹn của tôi
            </a>
          </div>
        </div>
        
        <div style="background: #f1f3f4; padding: 20px; text-align: center; color: #666; font-size: 14px;">
          <p style="margin: 0;">© 2024 EVCare. Tất cả quyền được bảo lưu.</p>
          <p style="margin: 5px 0 0 0;">Hệ thống quản lý bảo dưỡng xe điện thông minh</p>
        </div>
      </div>
    `;

    // Thông tin người nhận
    const mailOptions = {
      from: `"EVCare" <${process.env.EMAIL_USER}>`,
      to: customer.email,
      subject: `Xác nhận đặt lịch bảo dưỡng - ${appointmentDate} ${appointmentTime}`,
      html: emailContent,
    };

    // Gửi email
    await sendEmail(mailOptions);

    return {
      success: true,
      message: 'Email xác nhận booking đã được gửi',
    };
  } catch (error) {
    console.error('Send booking confirmation email error:', error);
    return {
      success: false,
      message: 'Không thể gửi email xác nhận booking',
      error: error.message,
    };
  }
};

// Gửi email xác nhận dời lịch booking
const sendRescheduleConfirmation = async (appointment) => {
  try {
    const customer = appointment.customer;
    const vehicle = appointment.vehicle;
    const serviceCenter = appointment.serviceCenter;
    const serviceType = appointment.serviceType;

    const appointmentDate = new Date(
      appointment.appointmentTime.date,
    ).toLocaleDateString('vi-VN');
    const appointmentTime = appointment.appointmentTime.startTime;

    const isInspectionOnly = Boolean(
      appointment?.serviceDetails?.isInspectionOnly,
    );
    const isFromPackage = Boolean(appointment?.serviceDetails?.isFromPackage);
    const paymentMethod = appointment?.payment?.method;
    const estimatedCost =
      typeof appointment?.serviceDetails?.estimatedCost === 'number'
        ? appointment.serviceDetails.estimatedCost
        : 0;
    const paymentMethodLabel = (() => {
      if (estimatedCost === 0) return 'Không yêu cầu thanh toán';
      switch (paymentMethod) {
        case 'ewallet':
          return 'Thanh toán online';
        case 'cash':
          return 'Thanh toán tại trung tâm';
        case 'card':
          return 'Thanh toán bằng thẻ';
        case 'banking':
          return 'Chuyển khoản ngân hàng';
        default:
          return 'Chưa chọn phương thức';
      }
    })();
    const serviceLabel = isInspectionOnly
      ? 'Kiểm tra tổng quát trước (chưa chọn dịch vụ cụ thể)'
      : serviceType?.name || 'N/A';
    const packageLabel = isFromPackage ? 'Có - Sử dụng gói dịch vụ' : 'Không';

    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #36d1dc 0%, #5b86e5 100%); padding: 30px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 28px;">EVCare</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px;">Xác nhận dời lịch bảo dưỡng</p>
        </div>
        <div style="padding: 30px; background: #f8f9fa;">
          <h2 style="color: #333; margin-bottom: 20px;">Xin chào ${customer.fullName || customer.username}!</h2>
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Yêu cầu dời lịch của bạn đã được ghi nhận. Dưới đây là thông tin lịch hẹn mới.
          </p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h3 style="color: #333; margin-bottom: 15px;">Thông tin lịch hẹn mới</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666; width: 120px;">Xe:</td>
                <td style="padding: 8px 0; color: #333; font-weight: 500;">${vehicle.vehicleInfo.vehicleModel.brand} ${vehicle.vehicleInfo.vehicleModel.modelName} ${vehicle.vehicleInfo.year}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Dịch vụ:</td>
                <td style="padding: 8px 0; color: #333; font-weight: 500;">${serviceLabel}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Trung tâm:</td>
                <td style="padding: 8px 0; color: #333; font-weight: 500;">${serviceCenter.name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Ngày mới:</td>
                <td style="padding: 8px 0; color: #333; font-weight: 500;">${appointmentDate}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Giờ mới:</td>
                <td style="padding: 8px 0; color: #333; font-weight: 500;">${appointmentTime}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Gói dịch vụ:</td>
                <td style="padding: 8px 0; color: #333; font-weight: 500;">${packageLabel}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Phương thức thanh toán:</td>
                <td style="padding: 8px 0; color: #333; font-weight: 500;">${paymentMethodLabel}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Trạng thái:</td>
                <td style="padding: 8px 0; color: #ff9800; font-weight: 500;">Chờ xác nhận</td>
              </tr>
            </table>
          </div>
          <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #1976d2; font-weight: 500;">
              📞 Liên hệ: ${serviceCenter.contact.phone} | ${serviceCenter.contact.email}
            </p>
            <p style="margin: 5px 0 0 0; color: #1976d2;">
              📍 Địa chỉ: ${serviceCenter.address.street}, ${serviceCenter.address.ward}, ${serviceCenter.address.district}, ${serviceCenter.address.city}
            </p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'https://evcare.com'}/my-bookings" 
               style="background: #36d1dc; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">
              Xem lịch hẹn
            </a>
          </div>
        </div>
        <div style="background: #f1f3f4; padding: 20px; text-align: center; color: #666; font-size: 14px;">
          <p style="margin: 0;">© 2024 EVCare. Tất cả quyền được bảo lưu.</p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: `"EVCare" <${process.env.EMAIL_USER}>`,
      to: customer.email,
      subject: `Xác nhận dời lịch - ${appointmentDate} ${appointmentTime}`,
      html: emailContent,
    };

    await sendEmail(mailOptions);

    return {
      success: true,
      message: 'Email xác nhận dời lịch đã được gửi',
    };
  } catch (error) {
    console.error('Send reschedule confirmation email error:', error);
    return {
      success: false,
      message: 'Không thể gửi email xác nhận dời lịch',
      error: error.message,
    };
  }
};

// Nhắc bảo dưỡng định kỳ
const sendMaintenanceReminder = async ({
  vehicle,
  owner,
  vehicleModel,
  reason,
}) => {
  const title = 'Nhắc nhở bảo dưỡng định kỳ';
  const subtitle = `${vehicleModel.brand} ${vehicleModel.modelName} - Biển số ${vehicle.vehicleInfo.licensePlate}`;
  const reasons = [];
  if (reason?.kmDue) {
    reasons.push(
      `Sắp đến mốc km bảo dưỡng (hiện tại ${reason.currentMileage || 0} km, mốc kế tiếp ${reason.nextServiceMileage || 'N/A'} km)`,
    );
  }
  if (reason?.timeDue) {
    reasons.push('Đã đến/ gần đến mốc thời gian bảo dưỡng theo tháng');
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #0d9488; padding: 24px; color: #fff; text-align: center; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">${title}</h2>
        <p style="margin: 8px 0 0 0;">${subtitle}</p>
      </div>
      <div style="padding: 20px; background: #f8f9fa;">
        <p>Xin chào ${owner.fullName || owner.username},</p>
        <p>Hệ thống EVCare phát hiện xe của bạn ${reasons.join('; ')}. Vui lòng đặt lịch để đảm bảo tình trạng vận hành tối ưu.</p>
        <div style="margin: 16px 0;">
          <a href="${process.env.FRONTEND_URL || 'https://evcare.com'}/booking" style="background:#0d9488;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Đặt lịch ngay</a>
        </div>
      </div>
      <div style="background:#f1f3f4;padding:12px;text-align:center;color:#666;border-radius:0 0 8px 8px;">© EVCare</div>
    </div>
  `;

  await sendEmail({
    from: `"EVCare" <${process.env.EMAIL_USER}>`,
    to: owner.email,
    subject: 'EVCare - Nhắc nhở bảo dưỡng định kỳ',
    html,
  });
  return { success: true };
};

// Nhắc gia hạn gói dịch vụ
const sendPackageRenewalReminder = async ({ subscription, daysLeft }) => {
  const customer = subscription.customerId;
  const vehicle = subscription.vehicleId;
  const pkg = subscription.packageId;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #7c3aed; padding: 24px; color: #fff; text-align: center; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">Nhắc gia hạn gói dịch vụ</h2>
        <p style="margin: 8px 0 0 0;">${pkg.packageName} - Xe ${vehicle.vehicleInfo.vehicleModel.brand} ${vehicle.vehicleInfo.vehicleModel.modelName}</p>
      </div>
      <div style="padding: 20px; background: #f8f9fa;">
        <p>Xin chào ${customer.fullName || customer.username},</p>
        <p>Gói dịch vụ của bạn sẽ hết hạn trong ${daysLeft} ngày hoặc đã hết lượt sử dụng. Vui lòng gia hạn để tiếp tục được ưu đãi và nhắc nhở bảo dưỡng định kỳ.</p>
        <div style="margin: 16px 0;">
          <a href="${process.env.FRONTEND_URL || 'https://evcare.com'}/subscriptions" style="background:#7c3aed;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Gia hạn ngay</a>
        </div>
      </div>
      <div style="background:#f1f3f4;padding:12px;text-align:center;color:#666;border-radius:0 0 8px 8px;">© EVCare</div>
    </div>
  `;

  await sendEmail({
    from: `"EVCare" <${process.env.EMAIL_USER}>`,
    to: customer.email,
    subject: 'EVCare - Nhắc gia hạn gói dịch vụ',
    html,
  });
  return { success: true };
};

// Gửi hóa đơn đơn giản qua email (HTML, không PDF)
const sendSimpleInvoiceEmail = async ({ invoice, appointment }) => {
  const customer = invoice.customerId;
  const currency = process.env.CURRENCY || 'VND';
  const serviceName =
    appointment?.serviceType?.name ||
    (appointment?.serviceDetails?.isInspectionOnly
      ? 'Kiểm tra tổng quát'
      : 'Dịch vụ');
  const source = String(invoice.notes || '').includes('source=')
    ? invoice.notes.split('source=')[1]
    : '';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
      <div style="background: #111827; color:#fff; padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin:0">Hóa đơn ${invoice.invoiceNumber}</h2>
        <p style="margin:6px 0 0 0;">Ngày phát hành: ${new Date(invoice.issueDate).toLocaleDateString('vi-VN')}</p>
      </div>
      <div style="background:#f9fafb; padding: 20px;">
        <p>Xin chào ${customer.fullName || customer.username},</p>
        <p>Đây là hóa đơn cho dịch vụ gần đây của bạn tại EVCare.</p>
        ${appointment ? `<p>Dịch vụ: <strong>${serviceName}</strong></p>` : ''}
        <table style="width:100%; margin-top: 10px;">
          <tr><td>Tạm tính:</td><td style="text-align:right; font-weight:600;">${invoice.subtotal.toLocaleString('vi-VN')} ${currency}</td></tr>
          <tr><td>Thuế:</td><td style="text-align:right; font-weight:600;">${invoice.taxAmount.toLocaleString('vi-VN')} ${currency}</td></tr>
          <tr><td>Giảm trừ:</td><td style="text-align:right; font-weight:600;">-${invoice.discountAmount.toLocaleString('vi-VN')} ${currency}</td></tr>
          <tr><td style="font-weight:700;">Tổng thanh toán:</td><td style="text-align:right; font-weight:700;">${invoice.totalAmount.toLocaleString('vi-VN')} ${currency}</td></tr>
        </table>
        <p style="margin-top:10px; color:#6b7280;">Nguồn tính: ${source || '—'}</p>
        <p style="margin-top:6px; color:#6b7280;">Ghi chú: ${invoice.notes || '—'}</p>
      </div>
      <div style="background:#e5e7eb; color:#111827; padding:12px; text-align:center; border-radius:0 0 8px 8px;">Cảm ơn bạn đã sử dụng EVCare</div>
    </div>
  `;

  await sendEmail({
    from: `"EVCare" <${process.env.EMAIL_USER}>`,
    to: customer.email,
    subject: `EVCare - Hóa đơn ${invoice.invoiceNumber}`,
    html,
  });
  return { success: true };
};

export default {
  sendVerificationEmail,
  verifyEmail,
  sendResetPasswordEmail,
  resetPassword,
  sendBookingConfirmation,
  sendRescheduleConfirmation,
  sendMaintenanceReminder,
  sendPackageRenewalReminder,
  sendSimpleInvoiceEmail,
};
