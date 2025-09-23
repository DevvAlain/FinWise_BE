import User from "../models/user.js";
import cloudinaryService from "../services/cloudinaryService.js";

const getMe = async (userId) => {
    const user = await User.findById(userId).select("-passwordHash");
    if (!user) {
        return { success: false, statusCode: 404, message: "Không tìm thấy người dùng" };
    }
    return { success: true, statusCode: 200, user };
};

const updateMe = async (userId, payload, file) => {
    const allowed = ["fullName", "phone", "avatarUrl", "timezone", "language"];
    const updates = {};
    for (const key of allowed) {
        if (typeof payload[key] !== "undefined") updates[key] = payload[key];
    }

    // If a file is provided, upload to Cloudinary and override avatarUrl
    if (file) {
        const result = await cloudinaryService.uploadImage(file);
        if (result?.success && result.imageUrl) {
            updates.avatarUrl = result.imageUrl;
        } else {
            return { success: false, statusCode: 500, message: result?.message || "Upload ảnh thất bại" };
        }
    }

    const user = await User.findByIdAndUpdate(
        userId,
        { $set: updates },
        { new: true, runValidators: true, select: "-passwordHash" }
    );

    if (!user) {
        return { success: false, statusCode: 404, message: "Không tìm thấy người dùng" };
    }

    return { success: true, statusCode: 200, message: "Cập nhật thành công", user };
};

export default { getMe, updateMe };


