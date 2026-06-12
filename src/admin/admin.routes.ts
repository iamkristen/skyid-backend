import express from "express";
import { validateToken } from "../middleware/validateToken";
import UserManagementController from "./admin.controller";
import SalesRoutes from "../sales/lead.routes";

const UserManagementRoute = express.Router();

UserManagementRoute.use("/sales", SalesRoutes);

UserManagementRoute.post("/signup-admin", UserManagementController.signup);
UserManagementRoute.post("/signin-admin", UserManagementController.signin);
UserManagementRoute.post("/send-login-otp", validateToken, UserManagementController.sendLoginOtp);
UserManagementRoute.post("/verify-login-otp", validateToken, UserManagementController.verifyLoginOtp);
UserManagementRoute.post("/2fa/setup", validateToken, UserManagementController.twoFactorSetup);
UserManagementRoute.post("/2fa/confirm-setup", validateToken, UserManagementController.twoFactorConfirmSetup);
UserManagementRoute.post("/2fa/verify", validateToken, UserManagementController.twoFactorVerify);
UserManagementRoute.post("/2fa/disable", validateToken, UserManagementController.twoFactorDisable);
UserManagementRoute.get("/user-admin", validateToken, UserManagementController.userProfile);
UserManagementRoute.get("/users", validateToken, UserManagementController.getAllUsers);
UserManagementRoute.get("/admins", validateToken, UserManagementController.getAllAdmins);
UserManagementRoute.get("/dashboard-stats", validateToken, UserManagementController.getDashboardStats);
UserManagementRoute.get("/zainpay-transactions/summary", validateToken, UserManagementController.getZainpayTransactionsSummary);
UserManagementRoute.get("/zainpay-transactions", validateToken, UserManagementController.getZainpayTransactions);
UserManagementRoute.patch("/users/:userId", validateToken, UserManagementController.updateAdmin);
UserManagementRoute.delete("/users/:userId", validateToken, UserManagementController.deleteUser);

export default UserManagementRoute;
