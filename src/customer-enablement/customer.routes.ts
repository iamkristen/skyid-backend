import express from "express";
import { validateToken } from "../middleware/validateToken";
import CustomerEnablementController from "./customer.controller";

const CustomerEnablementRoute = express.Router();

CustomerEnablementRoute.get("/requests", CustomerEnablementController.getRequests);
CustomerEnablementRoute.patch("/requests/approve/:id", validateToken, CustomerEnablementController.approveRequest);
CustomerEnablementRoute.patch("/requests/reject/:id", validateToken, CustomerEnablementController.rejectRequest);

export default CustomerEnablementRoute;
