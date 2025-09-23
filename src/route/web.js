import express from "express";
// import userController from "../controllers/userController";
import authController from "../controllers/authController";
import { protect } from "../middleware/authMiddleware.js";
import upload from "../middleware/uploadMiddleware.js";
import userProfileController from "../controllers/userProfileController.js";


let router = express.Router();


let initWebRoutes = (app) => {
    router.post("/api/auth/register", authController.register);
    router.post("/api/auth/login", authController.login);
    router.post("/api/auth/google-login", authController.googleLogin);
    router.post("/api/auth/refresh-token", authController.refreshToken);
    router.get("/api/auth/verify-email/:token", authController.verifyEmail);
    router.post(
        "/api/auth/resend-verification",
        authController.resendVerificationEmail
    );
    router.post("/api/auth/forgot-password", authController.forgotPassword);
    router.post("/api/auth/reset-password/:token", authController.resetPassword);
    router.post(
        "/api/auth/change-password",
        protect,
        authController.changePassword
    );

    // User profile
    router.get("/api/users/me", protect, userProfileController.getMe);
    router.patch(
        "/api/users/me",
        protect,
        upload.fields([{ name: "avatar", maxCount: 1 }, { name: "image", maxCount: 1 }]),
        userProfileController.updateMe
    );


    return app.use("/", router);
};

export default initWebRoutes;
