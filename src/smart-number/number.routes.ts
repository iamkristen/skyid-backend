import express, { Request, Response, NextFunction } from "express";
import NumberController from "./number.controller";
import { validateToken } from "../middleware/validateToken";
import multer from "multer";

const NumberRoutes = express.Router();

const upload = multer({ storage: multer.diskStorage({}) });

// Conditional authentication middleware for buy-number route
// If isSignup is true in the request body, skip authentication; otherwise require it
const conditionalAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Log request details for debugging
    console.log("conditionalAuth - Request body:", JSON.stringify(req.body || {}));
    console.log("conditionalAuth - Authorization header:", req.headers.authorization ? "Present" : "Missing");
    console.log("conditionalAuth - isSignup value:", req.body?.isSignup);
    console.log("conditionalAuth - isSignup type:", typeof req.body?.isSignup);
    
    // Check if this is a signup flow by looking at the request body
    // Note: express.json() middleware must be applied before this route
    // Check for both true (boolean) and "true" (string) to be safe
    const isSignup = req.body?.isSignup === true || req.body?.isSignup === "true";
    
    if (isSignup) {
      console.log("✅ Signup flow detected, skipping authentication");
      // Skip authentication for signup flow
      return next();
    }
    
    // For regular purchases, require authentication
    console.log("🔒 Regular purchase flow, requiring authentication");
    return validateToken(req, res, next);
  } catch (error) {
    console.error("Error in conditionalAuth middleware:", error);
    // If there's an error, default to requiring authentication
    return validateToken(req, res, next);
  }
};

NumberRoutes.post("/check-number", NumberController.checkNumber);
NumberRoutes.get("/suggest-number", NumberController.suggestNumber);
NumberRoutes.post("/buy-number", conditionalAuth, NumberController.buyNumber);
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
