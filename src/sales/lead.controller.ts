import { Request, Response } from "express";
import { Lead, LEAD_STAGES } from "./lead.model";
import AdminUser from "../admin/admin.model";
import { getAdminRoles } from "../admin/admin.controller";
import validation from "./lead.schema";

const SALES_ACCESS_ROLES = ["sales", "super_admin"];

async function requireSalesAccess(req: Request): Promise<boolean> {
  const admin = await AdminUser.findById(req.user?._id).select("role roles").lean();
  const roles = getAdminRoles(admin as { role?: string; roles?: string[] });
  return roles.some((r) => SALES_ACCESS_ROLES.includes(r));
}

export default class LeadController {
  static async listLeads(req: Request, res: Response) {
    try {
      if (!(await requireSalesAccess(req)))
        return res.status(403).json({ message: "Sales or Super Admin access required." });
      const stage = req.query.stage as string | undefined;
      const match = stage && LEAD_STAGES.includes(stage as typeof LEAD_STAGES[number]) ? { stage } : {};
      const leads = await Lead.find(match).sort({ createdAt: -1 }).lean();
      return res.status(200).json({ message: "success", data: leads });
    } catch (err) {
      console.error("listLeads error:", err);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async createLead(req: Request, res: Response) {
    try {
      if (!(await requireSalesAccess(req)))
        return res.status(403).json({ message: "Sales or Super Admin access required." });
      const { error, value } = validation.createLead(req.body);
      if (error) return res.status(400).json({ message: error.details[0].message });
      const doc = await Lead.create({
        ...value,
        email: value.email.toLowerCase().trim(),
        createdBy: req.user?._id?.toString(),
      });
      return res.status(201).json({ message: "success", data: doc });
    } catch (err) {
      console.error("createLead error:", err);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async updateLead(req: Request, res: Response) {
    try {
      if (!(await requireSalesAccess(req)))
        return res.status(403).json({ message: "Sales or Super Admin access required." });
      const { error, value } = validation.updateLead(req.body);
      if (error) return res.status(400).json({ message: error.details[0].message });
      const doc = await Lead.findByIdAndUpdate(
        req.params.id,
        { $set: value },
        { new: true }
      ).lean();
      if (!doc) return res.status(404).json({ message: "Lead not found." });
      return res.status(200).json({ message: "success", data: doc });
    } catch (err) {
      console.error("updateLead error:", err);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async getPipelineSummary(req: Request, res: Response) {
    try {
      if (!(await requireSalesAccess(req)))
        return res.status(403).json({ message: "Sales or Super Admin access required." });
      const summary = await Lead.aggregate([
        { $group: { _id: "$stage", count: { $sum: 1 } } },
      ]);
      const byStage: Record<string, number> = {};
      LEAD_STAGES.forEach((s) => (byStage[s] = 0));
      summary.forEach((s: { _id: string; count: number }) => (byStage[s._id] = s.count));
      return res.status(200).json({ message: "success", data: byStage });
    } catch (err) {
      console.error("getPipelineSummary error:", err);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async getReportsSummary(req: Request, res: Response) {
    try {
      if (!(await requireSalesAccess(req)))
        return res.status(403).json({ message: "Sales or Super Admin access required." });
      const [total, won, lost] = await Promise.all([
        Lead.countDocuments(),
        Lead.countDocuments({ stage: "won" }),
        Lead.countDocuments({ stage: "lost" }),
      ]);
      return res.status(200).json({
        message: "success",
        data: { total, won, lost, open: total - won - lost },
      });
    } catch (err) {
      console.error("getReportsSummary error:", err);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }
}
