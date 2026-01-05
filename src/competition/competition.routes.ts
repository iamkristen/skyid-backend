import express from "express";
import CompetitionController from "./competition.controller";
import { validateToken } from "../middleware/validateToken";

const CompetitionRoutes = express.Router();

CompetitionRoutes.post("/register", CompetitionController.register);
CompetitionRoutes.get("/participants", validateToken, CompetitionController.getAllParticipants);
CompetitionRoutes.patch("/participants/:participantId/winner", validateToken, CompetitionController.markAsWinner);
CompetitionRoutes.patch("/participants/:participantId/remove-winner", validateToken, CompetitionController.removeWinner);

export default CompetitionRoutes;

