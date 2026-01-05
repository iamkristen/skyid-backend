import { Request, Response } from "express";
import Competition from "./competition.model";
import ValidateCompetitionSchema from "./competition.schema";
import { generateAuditionCode } from "../utils/generateOtp";

export default class CompetitionController {
  static async register(req: Request, res: Response) {
    try {
      const { error, value } = ValidateCompetitionSchema.register(req.body);
      if (error) {
        return res.status(400).json({
          message: error.details[0].message,
        });
      }

      // Generate unique audition code
      let auditionCode: string;
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!isUnique && attempts < maxAttempts) {
        auditionCode = generateAuditionCode();
        const existing = await Competition.findOne({ auditionCode });
        if (!existing) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        return res.status(500).json({
          message: "Failed to generate unique audition code. Please try again.",
        });
      }

      // Format handles to ensure they start with @
      const formattedData = {
        name: value.name.trim(),
        state: value.state,
        tiktokHandle: value.tiktokHandle.startsWith("@") ? value.tiktokHandle : `@${value.tiktokHandle}`,
        instagramHandle: value.instagramHandle.startsWith("@") ? value.instagramHandle : `@${value.instagramHandle}`,
        videoLink: value.videoLink.trim(),
        auditionCode: auditionCode!,
      };

      const registration = new Competition(formattedData);
      await registration.save();

      return res.status(200).json({
        message: "success",
        data: {
          auditionCode: auditionCode!,
          name: formattedData.name,
        },
      });
    } catch (error: any) {
      console.error("Error registering for competition:", error);
      
      // Handle duplicate key error
      if (error.code === 11000) {
        return res.status(400).json({
          message: "A registration with this information already exists.",
        });
      }

      return res.status(500).json({
        message: "An error occurred while processing your registration. Please try again.",
      });
    }
  }

  static async getAllParticipants(req: Request, res: Response) {
    try {
      const participants = await Competition.find().sort({ date: -1 });
      return res.status(200).json({
        message: "success",
        data: participants,
      });
    } catch (error: any) {
      console.error("Error fetching participants:", error);
      return res.status(500).json({
        message: "An error occurred while fetching participants. Please try again.",
      });
    }
  }

  static async markAsWinner(req: Request, res: Response) {
    try {
      const { participantId } = req.params;
      
      const participant = await Competition.findById(participantId);
      if (!participant) {
        return res.status(404).json({
          message: "Participant not found",
        });
      }

      // Check if already a winner
      if (participant.isWinner) {
        return res.status(400).json({
          message: "This participant is already marked as a winner",
        });
      }

      // Check if we already have 3 winners
      const winnerCount = await Competition.countDocuments({ isWinner: true });
      if (winnerCount >= 3) {
        return res.status(400).json({
          message: "Maximum of 3 winners allowed. Please remove a winner first.",
        });
      }

      // Mark this participant as winner
      participant.isWinner = true;
      await participant.save();

      return res.status(200).json({
        message: "success",
        data: participant,
      });
    } catch (error: any) {
      console.error("Error marking winner:", error);
      return res.status(500).json({
        message: "An error occurred while marking winner. Please try again.",
      });
    }
  }

  static async removeWinner(req: Request, res: Response) {
    try {
      const { participantId } = req.params;
      
      const participant = await Competition.findById(participantId);
      if (!participant) {
        return res.status(404).json({
          message: "Participant not found",
        });
      }

      participant.isWinner = false;
      await participant.save();

      return res.status(200).json({
        message: "success",
        data: participant,
      });
    } catch (error: any) {
      console.error("Error removing winner:", error);
      return res.status(500).json({
        message: "An error occurred while removing winner. Please try again.",
      });
    }
  }
}

