import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

export const validateToken = async (req: Request, res: Response, next: NextFunction) => {
  // Correctly access the authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).send({ message: "Access Denied. No token provided" });

  try {
    // Verify the token and attach the user to the request object
    req.user = jwt.verify(authHeader.split(" ")[1], process.env.JWT_PRIVATE_KEY as string) as { _id: string };

    next();
  } catch (error) {
    res.status(401).send({ message: "Invalid token." });
  }
};
