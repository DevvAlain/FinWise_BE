import express from "express";
// import userController from "../controllers/userController";
import authController from "../controllers/authController";
import { protect, authorize } from "../middleware/authMiddleware.js";
import upload from "../middleware/uploadMiddleware.js";
import userProfileController from "../controllers/userProfileController.js";
import walletController from "../controllers/walletController.js";
import categoryController from "../controllers/categoryController.js";
import categoryAdminController from "../controllers/categoryAdminController.js";
import { enforceWalletQuota, enforceTransactionQuota } from "../middleware/quotaMiddleware.js";
import transactionController from "../controllers/transactionController.js";


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

    // Wallets (no bank integrations)
    router.post("/api/wallets", protect, enforceWalletQuota, walletController.create);
    router.get("/api/wallets", protect, walletController.list);
    router.get("/api/wallets/:walletId", protect, walletController.detail);
    router.patch("/api/wallets/:walletId", protect, walletController.update);
    router.delete("/api/wallets/:walletId", protect, walletController.remove);

    // Categories
    router.get("/api/categories/system", categoryController.listSystem);
    router.get("/api/categories", protect, categoryController.listMine);
    router.post("/api/categories", protect, categoryController.createMine);
    router.patch("/api/categories/:categoryId", protect, categoryController.updateMine);
    router.delete("/api/categories/:categoryId", protect, categoryController.deleteMine);

    // Admin: System categories
    router.post("/api/admin/categories/system", protect, authorize("admin"), categoryAdminController.create);
    router.patch("/api/admin/categories/system/:categoryId", protect, authorize("admin"), categoryAdminController.update);
    router.delete("/api/admin/categories/system/:categoryId", protect, authorize("admin"), categoryAdminController.remove);

    // Transactions
    router.post("/api/transactions", protect, enforceTransactionQuota, transactionController.create);
    router.get("/api/transactions", protect, transactionController.list);
    router.get("/api/transactions/:id", protect, transactionController.detail);
    router.patch("/api/transactions/:id", protect, transactionController.update);
    router.delete("/api/transactions/:id", protect, transactionController.remove);
    return app.use("/", router);
};

export default initWebRoutes;
