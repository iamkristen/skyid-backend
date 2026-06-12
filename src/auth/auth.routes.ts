import express from "express";
import { validateToken } from "../middleware/validateToken";
import AuthController from "./auth.controller";

const AuthRoutes = express.Router();

AuthRoutes.post("/signin", AuthController.signin);
AuthRoutes.post("/google-signin", AuthController.googleSignIn);
AuthRoutes.post("/complete-google-signin", AuthController.completeGoogleSignIn);
AuthRoutes.post("/send-otp", AuthController.verifyUserEmail);
AuthRoutes.post("/verify-otp", AuthController.confirmUserEmail);
AuthRoutes.post("/check-email", AuthController.checkEmail);
AuthRoutes.post("/verify-email", AuthController.verifyNewUser);
AuthRoutes.post("/forgot-password", AuthController.forgotPassword);
AuthRoutes.post("/reset-password", AuthController.resetPassword);
AuthRoutes.post("/set-new-password", validateToken, AuthController.setNewPassword);
AuthRoutes.post("/change-password", validateToken, AuthController.changePassword);
AuthRoutes.post("/2fa/setup", validateToken, AuthController.twoFactorSetup);
AuthRoutes.post("/2fa/confirm-setup", validateToken, AuthController.twoFactorConfirmSetup);
AuthRoutes.post("/2fa/verify", validateToken, AuthController.twoFactorVerify);
AuthRoutes.post("/2fa/disable", validateToken, AuthController.twoFactorDisable);

export default AuthRoutes;
