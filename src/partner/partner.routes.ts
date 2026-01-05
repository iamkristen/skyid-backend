import express from "express";
// import { validateToken } from "../middleware/validateToken";
import ChannelPartnerController from "./partner.controller";

const ChannelPartnerRoutes = express.Router();

ChannelPartnerRoutes.post("/signup-channel-partner", ChannelPartnerController.signupChannelPartner);

export default ChannelPartnerRoutes;
