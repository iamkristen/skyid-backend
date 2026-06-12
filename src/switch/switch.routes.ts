import express from "express";
import { validateToken } from "../middleware/validateToken";
import SwitchTeamController from "./switch.controller";

const SwitchTeamRoute = express.Router();

SwitchTeamRoute.get("/requests", SwitchTeamController.getRequests);
SwitchTeamRoute.get("/requests/skyid/:skyId", validateToken, SwitchTeamController.getRequestsBySkyId);
SwitchTeamRoute.patch("/requests/approve/:id", validateToken, SwitchTeamController.approveRequest);
SwitchTeamRoute.patch("/requests/reject/:id", validateToken, SwitchTeamController.rejectRequest);
SwitchTeamRoute.post("/create-individual-mapping", validateToken, SwitchTeamController.createIndividualMapping);

// Multi-level Create Individual workflow
SwitchTeamRoute.post("/create-individual-requests", validateToken, SwitchTeamController.submitIndividualMappingRequest);
SwitchTeamRoute.get("/create-individual-requests", validateToken, SwitchTeamController.listIndividualMappingRequests);
SwitchTeamRoute.get("/create-individual-requests/:id", validateToken, SwitchTeamController.getIndividualMappingRequestById);
SwitchTeamRoute.put("/create-individual-requests/:id", validateToken, SwitchTeamController.updateIndividualMappingRequest);
SwitchTeamRoute.patch("/create-individual-requests/:id/approve-level-2", validateToken, SwitchTeamController.approveIndividualMappingLevel2);
SwitchTeamRoute.patch("/create-individual-requests/:id/approve-level-3", validateToken, SwitchTeamController.approveIndividualMappingLevel3);
SwitchTeamRoute.patch("/create-individual-requests/:id/approve-level-4", validateToken, SwitchTeamController.approveIndividualMappingLevel4);
SwitchTeamRoute.patch("/create-individual-requests/:id/reject", validateToken, SwitchTeamController.rejectIndividualMappingRequest);
SwitchTeamRoute.patch("/create-individual-requests/:id/resubmit", validateToken, SwitchTeamController.resubmitIndividualMappingRequest);
SwitchTeamRoute.delete("/create-individual-requests/:id", validateToken, SwitchTeamController.deleteIndividualMappingRequest);

export default SwitchTeamRoute;
