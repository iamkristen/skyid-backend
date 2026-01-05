import express from "express";
import { validateToken } from "../middleware/validateToken";
import SwitchTeamController from "./switch.controller";

const SwitchTeamRoute = express.Router();

SwitchTeamRoute.get("/requests", SwitchTeamController.getRequests);
SwitchTeamRoute.get("/requests/skyid/:skyId", validateToken, SwitchTeamController.getRequestsBySkyId);
SwitchTeamRoute.patch("/requests/approve/:id", validateToken, SwitchTeamController.approveRequest);
SwitchTeamRoute.patch("/requests/reject/:id", validateToken, SwitchTeamController.rejectRequest);

export default SwitchTeamRoute;
