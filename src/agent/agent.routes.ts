import express from "express";
import AgentController from "./agent.controller";
import { validateToken } from "../middleware/validateToken";

const AgentRoute = express.Router();
AgentRoute.post("/create", AgentController.createAgent);
AgentRoute.get("/code", validateToken, AgentController.getAgentCode);
AgentRoute.get("/stats", validateToken, AgentController.getStats);
// AgentRoute.post("/kyc/cac/verify", KYCController.getCAC);
export default AgentRoute;
