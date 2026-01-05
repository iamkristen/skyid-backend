import express from "express";
import KYCController from "./kyc.controller";
import { validateToken } from "../middleware/validateToken";

const KycRoute = express.Router();
KycRoute.post("/nin/verify", KYCController.getNIN);
KycRoute.post("/cac/verify", KYCController.getCAC);
KycRoute.get("/bank/list", KYCController.getBankList);
KycRoute.post("/bank/name-enquiry", KYCController.nameEnquiry);
KycRoute.post("/validate-user", KYCController.validateUser);
KycRoute.get("/user/:userId", validateToken, KYCController.getKYCByUserId);
export default KycRoute;
