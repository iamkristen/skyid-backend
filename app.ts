import express, { Application } from "express";
import dotenv from "dotenv";
import path from "path";
import { database } from "./src/config/db";
import routers from "./src/routes";
import cors from "cors";
import morgan from "morgan";
// Initialize Firebase Admin before importing routes
import "./src/utils/firebase";
// @ts-ignore
import type * as _ from "./src/zainpay/zainpay.global";

dotenv.config();

// Extend the Request interface to include user property
declare module "express-serve-static-core" {
  interface Request {
    user?: { _id: string };
  }
}

const app: Application = express();
const port: number = (process.env.PORT as never) || 8000;

// * Middleware
app.use(morgan("dev"));

app.use(
  express.json({
    verify(req, _, buf) {
      (req as unknown as { rawBody: string }).rawBody = buf.toString();
    },
  })
);

app.use(cors());

// Serve uploaded files statically (for simulation)
// This will be removed when migrating to Azure Blob Storage
const uploadsPath = path.join(__dirname, "uploads");
app.use("/uploads", express.static(uploadsPath));

// * Routes
app.use("/api/v1", routers);
app.get("/", (req, res) => res.status(200).send("WELCOME TO SKYID"));

app.listen(port, async () => {
  console.log(`🚀🚀-🚀🚀-🚀 Server is running at ${port}!`);
  // Connect to database after server starts
  await database();
});
