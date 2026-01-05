import express from "express";
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

export default AuthRoutes;
