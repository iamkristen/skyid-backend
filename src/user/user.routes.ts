import express from "express";
import { validateToken } from "../middleware/validateToken";
import UserController from "./user.controller";

const UserRoutes = express.Router();

UserRoutes.post("/send-email-channel", UserController.sendEmailToAccountManager);
UserRoutes.post("/signup", UserController.signup);
UserRoutes.post("/validate-public-signup-email", UserController.validatePublicSignupEmail);
UserRoutes.post("/check-email-phone", UserController.checkEmailAndPhoneExists);
UserRoutes.post("/check-availability", UserController.checkAvailability);
UserRoutes.get("/user-profile", validateToken, UserController.userProfile);
UserRoutes.put("/user-profile", validateToken, UserController.updateUserProfile);
UserRoutes.get("/get-users", validateToken, UserController.getUsers);
UserRoutes.patch("/block/:userId", validateToken, UserController.blockUser);
UserRoutes.patch("/unblock/:userId", validateToken, UserController.unblockUser);

UserRoutes.post("/kyc", validateToken, UserController.kyc);
UserRoutes.post("/kyc-individual", validateToken, UserController.kycIndividual);
UserRoutes.get("/stats", validateToken, UserController.getUserStats);

export default UserRoutes;
