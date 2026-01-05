import express from "express";
import { validateToken } from "../middleware/validateToken";
import FinanceTeamController from "./finance.controller";

const FinanceTeamRoute = express.Router();

FinanceTeamRoute.get("/requests", FinanceTeamController.getRequests);
FinanceTeamRoute.patch("/requests/approve/:id/:amount", validateToken, FinanceTeamController.approveRequest);
FinanceTeamRoute.patch("/requests/reject/:id", validateToken, FinanceTeamController.rejectRequest);
FinanceTeamRoute.get("/agent-code", validateToken, FinanceTeamController.getAgentCodes);
FinanceTeamRoute.patch("/agent-code/:code", validateToken, FinanceTeamController.editAgentCode);
FinanceTeamRoute.get("/agent-code-users/:code", validateToken, FinanceTeamController.agentCodeUsers);
FinanceTeamRoute.get("/notifications", validateToken, FinanceTeamController.getUserNotifications);
FinanceTeamRoute.post("/notifications/mark-read", validateToken, FinanceTeamController.markNotificationAsRead);

export default FinanceTeamRoute;
