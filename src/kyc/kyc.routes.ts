import express from "express";
import KYCController from "./kyc.controller";
import { validateToken } from "../middleware/validateToken";

const KycRoute = express.Router();
KycRoute.post("/nin/verify", KYCController.getNIN);
KycRoute.post("/cac/verify", KYCController.getCAC);
KycRoute.post("/cac/cac-enquiry", KYCController.cacEnquiry);
KycRoute.get("/bank/list", KYCController.getBankList);
KycRoute.post("/bank/name-enquiry", KYCController.nameEnquiry);
KycRoute.post("/bank/bvn-enquiry", KYCController.bvnEnquiry);
KycRoute.post("/validate-user", KYCController.validateUser);

// User KYC workflow endpoints (authenticated)
KycRoute.post("/submit", validateToken, KYCController.submitKYC);
KycRoute.get("/status", validateToken, KYCController.getMyKYCStatus);
KycRoute.get("/user/:userId", validateToken, KYCController.getKYCByUserId);

// Admin KYC workflow endpoints (authenticated - add admin check middleware in production)
KycRoute.get("/pending", validateToken, KYCController.getPendingKYC);
KycRoute.post("/approve/:userId", validateToken, KYCController.approveKYC);
KycRoute.post("/reject/:userId", validateToken, KYCController.rejectKYC);

export default KycRoute;
