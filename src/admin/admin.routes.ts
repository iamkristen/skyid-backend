import express from "express";
import { validateToken } from "../middleware/validateToken";
import UserManagementController from "./admin.controller";

const UserManagementRoute = express.Router();

UserManagementRoute.post("/signup-admin", UserManagementController.signup);
UserManagementRoute.post("/signin-admin", UserManagementController.signin);
UserManagementRoute.get("/user-admin", validateToken, UserManagementController.userProfile);
UserManagementRoute.get("/users", validateToken, UserManagementController.getAllUsers);
UserManagementRoute.get("/admins", validateToken, UserManagementController.getAllAdmins);
UserManagementRoute.get("/dashboard-stats", validateToken, UserManagementController.getDashboardStats);
UserManagementRoute.delete("/users/:userId", validateToken, UserManagementController.deleteUser);

export default UserManagementRoute;
