import express from "express";
import WalletController from "./wallet.controller";
import { validateToken } from "../middleware/validateToken";

const WalletRoutes = express.Router();

WalletRoutes.post("/create", WalletController.wallet);
WalletRoutes.get("/:userId", WalletController.getWallet);
WalletRoutes.get("/history/:userId", WalletController.getWalletHistory);
WalletRoutes.post("/deposit", validateToken, WalletController.deposit);
WalletRoutes.post("/withdraw", validateToken, WalletController.withdraw);

export default WalletRoutes;
