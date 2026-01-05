import express from "express";
import { validateToken } from "../middleware/validateToken";
import VsoController from "./vso.controller";

const VsoRoutes = express.Router();

VsoRoutes.post("/create-customer", validateToken, VsoController.createCustomer);
VsoRoutes.get("/get-customers", validateToken, VsoController.getCustomers);
VsoRoutes.post("/create-vso", validateToken, VsoController.createVSO);
VsoRoutes.get("/get-vsos", validateToken, VsoController.getVSOs);
VsoRoutes.get("/get-vso-activity/:vsoId", validateToken, VsoController.getVSOActivity);
VsoRoutes.post("/credit-vso", validateToken, VsoController.creditVSO);
VsoRoutes.put("/update-allocation", validateToken, VsoController.updateVSOAllocation);

// VSO Top-Up Request Routes
VsoRoutes.post("/request-topup", validateToken, VsoController.requestTopUp);
VsoRoutes.get("/topup-requests", validateToken, VsoController.getTopUpRequests);
VsoRoutes.post("/approve-topup/:requestId", validateToken, VsoController.approveTopUpRequest);
VsoRoutes.post("/reject-topup/:requestId", validateToken, VsoController.rejectTopUpRequest);

export default VsoRoutes;
