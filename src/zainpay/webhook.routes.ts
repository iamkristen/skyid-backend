import express from "express";
import WebhookController from "./webhook.controller";

const WebhookRoutes = express.Router();

WebhookRoutes.post("/zainpay", WebhookController.zainpayWebhook);

export default WebhookRoutes;
