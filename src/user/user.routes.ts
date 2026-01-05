import express from "express";
import { validateToken } from "../middleware/validateToken";
import UserController from "./user.controller";

const UserRoutes = express.Router();

UserRoutes.post("/send-email-channel", UserController.sendEmailToAccountManager);
UserRoutes.post("/signup", UserController.signup);
UserRoutes.post("/validate-public-signup-email", UserController.validatePublicSignupEmail);
UserRoutes.get("/user-profile", validateToken, UserController.userProfile);
UserRoutes.get("/get-users", validateToken, UserController.getUsers);
UserRoutes.patch("/block/:userId", validateToken, UserController.blockUser);
UserRoutes.patch("/unblock/:userId", validateToken, UserController.unblockUser);

UserRoutes.post("/kyc", validateToken, UserController.kyc);
UserRoutes.get("/stats", validateToken, UserController.getUserStats);

export default UserRoutes;
