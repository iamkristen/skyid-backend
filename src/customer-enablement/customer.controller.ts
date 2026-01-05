import { Response, Request } from "express";
import dotenv from "dotenv";
import CustomerEnablementRequest from "./customer.model";
import SkyId from "../smart-number/number.skyId.model";
import User from "../user/user.model";
import { startSession } from "mongoose";
import SwitchTeamRequest from "../switch/switch.model";
import EmailService from "../utils/EmailService";

dotenv.config();

export default class CustomerEnablementController {
  static async getRequests(req: Request, res: Response) {
    try {
      // const page = req.query.page ? parseInt(req.query.page as string) : 0;
      // const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      // const skip = page * limit;

      const requests = await CustomerEnablementRequest.find().sort({
        createdAt: -1,
      });
      // .skip(skip)
      // .limit(limit);

      return res.status(200).send({ message: "success", data: requests });
    } catch (error) {
      console.error(`Failed to get customer enablement requests: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async approveRequest(req: Request, res: Response) {
    const { id } = req.params;
    const session = await startSession();
    await session.startTransaction();
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const enablementReq = await CustomerEnablementRequest.findOneAndUpdate(
        { _id: id },
        { $set: { status: "approved", handledBy: req.user._id } },
        { session }
      );
      if (!enablementReq) return res.status(404).json({ message: "Customer enablement request not found" });

      const skyIdNumber = await SkyId.findOne({ skyId: enablementReq.skyId });
      if (!skyIdNumber) throw new Error(`SkyId ${enablementReq.skyId} not found`);

      const { request_type, skyId, fileUrl, _id } = enablementReq;
      console.log(`Addon ${enablementReq.fileUrl} approved`);
      await SwitchTeamRequest.create({
        request_type,
        skyId,
        txnRef: _id.toString(),
        fileUrl,
        amount: 0,
        createdBy: skyIdNumber.userId,
        status: "pending",
      });
      console.log(`Created switch request for addon ${enablementReq.id}`);

      await session.commitTransaction();

      // Send notification email to the user
      try {
        const user = await User.findById(skyIdNumber.userId);
        if (user && user.email) {
          const requestTypeDisplay = enablementReq.request_type === "ivr" ? "IVR Add-on" : 
                                   enablementReq.request_type === "ivm" ? "IVM Add-on" : enablementReq.request_type;

          await EmailService.sendMappingRequestApproved(
            user.email,
            `${user.firstName} ${user.lastName}`,
            enablementReq.skyId,
            requestTypeDisplay
          );
        }
      } catch (emailError) {
        console.error("Failed to send approval notification email:", emailError);
        // Don't fail the request if email fails
      }

      return res.status(200).json({ message: "success" });
    } catch (error) {
      await session.abortTransaction();
      console.error(`Failed to approve customer enablement request ${id}: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await session.endSession();
    }
  }

  static async rejectRequest(req: Request, res: Response) {
    const { id } = req.params;
    const { remark } = req.body;
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const enablementReq = await CustomerEnablementRequest.findOneAndUpdate(
        { _id: id },
        { $set: { status: "rejected", handledBy: req.user._id, remark } }
      );

      if (!enablementReq) return res.status(404).json({ message: "Customer enablement request not found" });

      // Send notification email to the user
      try {
        const skyIdNumber = await SkyId.findOne({ skyId: enablementReq.skyId });
        if (skyIdNumber) {
          const user = await User.findById(skyIdNumber.userId);
          if (user && user.email) {
            const requestTypeDisplay = enablementReq.request_type === "ivr" ? "IVR Add-on" : 
                                     enablementReq.request_type === "ivm" ? "IVM Add-on" : enablementReq.request_type;

            await EmailService.sendMappingRequestRejected(
              user.email,
              `${user.firstName} ${user.lastName}`,
              enablementReq.skyId,
              requestTypeDisplay,
              remark || "No specific reason provided"
            );
          }
        }
      } catch (emailError) {
        console.error("Failed to send rejection notification email:", emailError);
        // Don't fail the request if email fails
      }

      return res.status(200).json({ message: "success" });
    } catch (error) {
      console.error(`Failed to reject customer enablement request ${id}: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }
}
