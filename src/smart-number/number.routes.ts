import express from "express";
import NumberController from "./number.controller";
import { validateToken } from "../middleware/validateToken";
import multer from "multer";

const NumberRoutes = express.Router();

const upload = multer({ storage: multer.diskStorage({}) });

NumberRoutes.post("/check-number", NumberController.checkNumber);
NumberRoutes.get("/suggest-number", NumberController.suggestNumber);
NumberRoutes.post("/buy-number", validateToken, NumberController.buyNumber);
NumberRoutes.patch("/mapped-numbers", validateToken, NumberController.updateMappedNumbers);
NumberRoutes.get("/get-user-numbers", validateToken, NumberController.getUserNumbers);
NumberRoutes.get("/get-number-history/:skyId", validateToken, NumberController.getNumberHistory);
NumberRoutes.put("/replace-number", validateToken, NumberController.replaceMappedNumber);
NumberRoutes.post("/remove-mapped-number", validateToken, NumberController.removeMappedNumber);
NumberRoutes.post("/buy-addons", validateToken, NumberController.buyAddons);
NumberRoutes.post("/upload-addon", validateToken, upload.single("audioFile"), NumberController.uploadAddon);
NumberRoutes.patch("/delete-addon", validateToken, NumberController.deleteAddon);
NumberRoutes.get("/get-addon-status", validateToken, NumberController.getAddonStatus);

export default NumberRoutes;
