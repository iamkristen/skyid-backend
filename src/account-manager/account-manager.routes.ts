import express from "express";
import { validateToken } from "../middleware/validateToken";
import AccountManagerController from "./account-manager.controller";

const AccountManagerRoutes = express.Router();

AccountManagerRoutes.get("/channel-partners", validateToken, AccountManagerController.getChannelPartners);
AccountManagerRoutes.post("/channel-partners", validateToken, AccountManagerController.createChannelPartner);
AccountManagerRoutes.post("/check-nin", validateToken, AccountManagerController.checkNinExists);
AccountManagerRoutes.patch("/channel-partners/:id", validateToken, AccountManagerController.updateChannelPartner);
AccountManagerRoutes.get("/channel-partners/:id/activities", validateToken, AccountManagerController.getChannelPartnerActivities);
AccountManagerRoutes.get("/requests", AccountManagerController.getRequests);
AccountManagerRoutes.patch("/requests/approve/:id", validateToken, AccountManagerController.approveRequest);
AccountManagerRoutes.patch("/requests/reject/:id", validateToken, AccountManagerController.rejectRequest);

export default AccountManagerRoutes;
