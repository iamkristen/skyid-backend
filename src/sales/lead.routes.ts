import express from "express";
import { validateToken } from "../middleware/validateToken";
import LeadController from "./lead.controller";

const router = express.Router();

router.get("/leads", validateToken, LeadController.listLeads);
router.post("/leads", validateToken, LeadController.createLead);
router.patch("/leads/:id", validateToken, LeadController.updateLead);
router.get("/pipeline-summary", validateToken, LeadController.getPipelineSummary);
router.get("/reports-summary", validateToken, LeadController.getReportsSummary);

export default router;
