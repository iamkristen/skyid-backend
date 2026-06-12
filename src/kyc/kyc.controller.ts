import { Response, Request } from "express";
import dotenv from "dotenv";
import axios from "axios";
import redis from "../config/redis";
import { ZainpayHelper } from "../zainpay/zainpay.controller";
import { capitalize } from "../utils/string.utils";
import Kyc from "./kyc.model";

dotenv.config();

const PREMBLY_BASE = process.env.PREMBLY_BASE_URL || "https://api.prembly.com";

export default class KYCController {
  // 🔥 NEW HELPER METHOD - Returns data instead of sending response
  static async getNINData(nin: string): Promise<any> {
    try {
      const cacheKey = `nin:${nin}`;

      // Check cache first
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        console.log("✅ Cache hit for NIN:", nin);
        return JSON.parse(cachedData);
      }

      console.log("❌ Cache miss for NIN:", nin);
      const response = await axios.post(
        `${PREMBLY_BASE}/verification/vnin`,
        { number_nin: nin },
        {
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.PREMBLY_API_KEY as string,
            "app-id": process.env.PREMBLY_APP_ID as string,
          },
        }
      );

      // Save to cache for 1 hour (3600 seconds)
      await redis.set(cacheKey, JSON.stringify(response.data), "EX", 3600);

      return response.data;
    } catch (error: any) {
      console.error("Failed to get NIN data:", error.response?.data || error.message);
      throw new Error(error.response?.data?.message || "Failed to verify NIN");
    }
  }

  // Original route handler - now uses the helper method
  static async getNIN(req: Request, res: Response) {
    try {
      const { nin } = req.body; // this should be the VIN number

      const number = nin;
      console.log("Number:", number);
      const cacheKey = `nin:${number}`;

      // 🔹 Check cache first
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        console.log("✅ Cache hit for NIN:", number);
        return res.status(200).json({
          message: "success (from cache)",
          data: JSON.parse(cachedData),
        });
      }

      console.log("❌ Cache miss for NIN:", number);
      const response = await axios.post(
        `${PREMBLY_BASE}/verification/vnin`,
        { number_nin: number },
        {
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.PREMBLY_API_KEY as string, // ✅ Required header
            "app-id": process.env.PREMBLY_APP_ID as string, // ✅ Required header
          },
        }
      );

      // 🔹 Save to cache for 1 hour (3600 seconds)
      await redis.set(cacheKey, JSON.stringify(response.data), "EX", 3600);

      return res.status(200).json({
        message: "success",
        data: response.data,
      });
    } catch (error: any) {
      console.error("Failed to get KYC:", error.response?.data || error.message);
      return res.status(500).json({
        message: "Internal Server Error!",
        error: error.response?.data || error.message,
      });
    }
  }

  static async getCAC(req: Request, res: Response) {
    try {
      const { number } = req.body;

      console.log("Number:", number);
      const cacheKey = `cac:${number}`;

      // // 🔹 Check cache first
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        console.log("✅ Cache hit for CAC:", number);
        return res.status(200).json({
          message: "success (from cache)",
          data: JSON.parse(cachedData),
        });
      }

      const response = await axios.post(
        `${PREMBLY_BASE}/verification/cac`,
        {
          rc_number: `${number.slice(2)}`,
          company_type: `${number.slice(0, 2).toUpperCase()}`,
          company_name: ``,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.PREMBLY_API_KEY as string,
            "app-id": process.env.PREMBLY_APP_ID as string,
          },
        }
      );

      // 🔹 Save to cache for 1 hour (3600 seconds)
      await redis.set(cacheKey, JSON.stringify(response.data), "EX", 3600);
      return res.status(200).json({
        message: "success",
        data: response.data,
      });
    } catch (error: any) {
      console.error("Failed to get KYC:", error.response?.data || error.message);
      return res.status(500).json({
        message: "Internal Server Error!",
        error: error.response?.data || error.message,
      });
    }
  }

  static async getBankList(req: Request, res: Response) {
    try {
      const cacheKey = "bankList";

      // 🔹 Check cache first
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        console.log("✅ Cache hit for Bank List");
        return res.status(200).json({
          message: "success (from cache)",
          data: JSON.parse(cachedData),
        });
      }

      const response = await ZainpayHelper.getBankList();

      // 🔹 Save to cache for 24 hours
      await redis.set(cacheKey, JSON.stringify(response), "EX", 86400);

      return res.status(200).json({
        message: "success",
        data: response,
      });
    } catch (error) {
      console.error("Failed to get bank list:", error);
    }
  }
  static async nameEnquiry(req: Request, res: Response) {
    try {
      const { bankCode, accountNumber } = req.body;

      if (!bankCode || !accountNumber) {
        return res.status(400).json({
          message: "bankCode and accountNumber are required",
        });
      }

      const cacheKey = `nameEnquiry:${bankCode}:${accountNumber}`;

      // 🔹 Check cache first
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        console.log("✅ Cache hit for Name Enquiry:", bankCode, accountNumber);
        return res.status(200).json({
          message: "success (from cache)",
          data: JSON.parse(cachedData),
        });
      }

      const response = await ZainpayHelper.nameEnquiry(req.body.bankCode, req.body.accountNumber);

      // 🔹 Save to cache for 1 hour
      await redis.set(cacheKey, JSON.stringify(response), "EX", 3600);

      return res.status(200).json({
        message: "success",
        data: response,
      });
    } catch (error) {
      console.error("Failed to get bank list:", error);
    }
  }

  static async bvnEnquiry(req: Request, res: Response) {
    try {
      const { bvn } = req.body as { bvn: string };

      if (!bvn || bvn.length !== 11) {
        return res.status(400).json({
          message: "BVN must be exactly 11 digits",
        });
      }

      const cacheKey = `bvnEnquiry:${bvn}`;
      try {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          return res.status(200).json({
            message: "success (from cache)",
            data: parsed,
          });
        }
      } catch (_) {
        // Redis down or invalid cache – continue without cache
      }

      if (!process.env.PREMBLY_API_KEY || !process.env.PREMBLY_APP_ID) {
        console.error("BVN enquiry: PREMBLY_API_KEY or PREMBLY_APP_ID is missing");
        return res.status(500).json({ message: "BVN verification is not configured. Please contact support." });
      }

      const params = new URLSearchParams();
      params.append("number", bvn);

      const response = await axios.post(
        `${PREMBLY_BASE}/identitypass/verification/bvn_validation`,
        params,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "x-api-key": process.env.PREMBLY_API_KEY,
            "app-id": process.env.PREMBLY_APP_ID,
          },
        }
      );

      const data = response.data;
      if (data && typeof data === "object" && data.status === false) {
        const errMsg = data.message || data.detail || "BVN verification failed";
        return res.status(400).json({ message: errMsg });
      }
      const bvnData = data && typeof data === "object" ? (data.bvn_data || data.data) : null;
      const firstName = bvnData?.firstName ?? bvnData?.first_name ?? "";
      const middleName = bvnData?.middleName ?? bvnData?.middle_name ?? "";
      const lastName = bvnData?.lastName ?? bvnData?.last_name ?? "";
      const accountName = [firstName, middleName, lastName].filter(Boolean).join(" ").trim() || null;

      const result = { accountName };
      try {
        await redis.set(cacheKey, JSON.stringify(result), "EX", 3600);
      } catch (_) {
        // Cache write failed – still return success
      }

      return res.status(200).json({
        message: "success",
        data: result,
      });
    } catch (error: any) {
      const errData = error.response?.data;
      const premblyStatus = error.response?.status;
      const premblyMsg =
        errData?.message ||
        errData?.detail ||
        (typeof errData === "string" ? errData : null);

      console.error("BVN enquiry error:", premblyStatus, error.message, errData ? JSON.stringify(errData) : "");

      const isNetworkError =
        error.code === "ENOTFOUND" ||
        error.code === "ECONNREFUSED" ||
        error.code === "ETIMEDOUT" ||
        /getaddrinfo|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(String(error.message));
      if (isNetworkError) {
        return res.status(502).json({
          message:
            "BVN verification service is unreachable. Check your network or set PREMBLY_BASE_URL in .env if using a different API host.",
        });
      }

      if (premblyStatus >= 500) {
        return res.status(502).json({
          message:
            "BVN verification service is temporarily unavailable. Please try again in a few minutes.",
        });
      }

      const msg = premblyMsg || error.message || "BVN verification failed";
      return res.status(premblyStatus || 500).json({ message: msg });
    }
  }

  static async cacEnquiry(req: Request, res: Response) {
    try {
      const { cacRnNumber } = req.body as { cacRnNumber: string };
      const raw = typeof cacRnNumber === "string" ? cacRnNumber.trim().replace(/\s+/g, "") : "";

      if (!raw || raw.length < 6) {
        return res.status(400).json({
          message: "CAC RN must be at least 6 characters (e.g. RC123456 or 123456)",
        });
      }

      let companyType = "RC";
      let rcNumber = raw;
      const prefix = raw.slice(0, 2).toUpperCase();
      if (["RC", "BN", "IT"].includes(prefix) && raw.length >= 8) {
        companyType = prefix;
        rcNumber = raw.slice(2);
      } else if (/^\d+$/.test(raw)) {
        rcNumber = raw;
      }

      const cacheKey = `cacEnquiry:${companyType}:${rcNumber}`;
      try {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          return res.status(200).json({
            message: "success (from cache)",
            data: parsed,
          });
        }
      } catch (_) {
        // Redis down or invalid cache – continue without cache
      }

      if (!process.env.PREMBLY_API_KEY || !process.env.PREMBLY_APP_ID) {
        console.error("CAC enquiry: PREMBLY_API_KEY or PREMBLY_APP_ID is missing");
        return res.status(500).json({ message: "CAC verification is not configured. Please contact support." });
      }

      const response = await axios.post(
        `${PREMBLY_BASE}/verification/cac`,
        {
          rc_number: rcNumber,
          company_type: companyType,
          company_name: "",
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.PREMBLY_API_KEY,
            "app-id": process.env.PREMBLY_APP_ID,
          },
        }
      );

      const data = response.data;
      if (data && typeof data === "object" && data.status === false) {
        const errMsg = data.message || data.detail || "CAC verification failed";
        return res.status(400).json({ message: errMsg });
      }
      const cacData = data && typeof data === "object" ? data.data : null;
      const companyName =
        cacData?.company_name ?? cacData?.companyName ?? (typeof cacData === "object" && cacData ? null : null);

      const result = { companyName: companyName || null };
      try {
        await redis.set(cacheKey, JSON.stringify(result), "EX", 3600);
      } catch (_) {
        // Cache write failed – still return success
      }

      return res.status(200).json({
        message: "success",
        data: result,
      });
    } catch (error: any) {
      const errData = error.response?.data;
      const premblyStatus = error.response?.status;
      const premblyMsg =
        errData?.message ||
        errData?.detail ||
        (typeof errData === "string" ? errData : null);

      console.error("CAC enquiry error:", premblyStatus, error.message, errData ? JSON.stringify(errData) : "");

      const isNetworkError =
        error.code === "ENOTFOUND" ||
        error.code === "ECONNREFUSED" ||
        error.code === "ETIMEDOUT" ||
        /getaddrinfo|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(String(error.message));
      if (isNetworkError) {
        return res.status(502).json({
          message:
            "CAC verification service is unreachable. Check your network or set PREMBLY_BASE_URL in .env if using a different API host.",
        });
      }

      if (premblyStatus >= 500) {
        return res.status(502).json({
          message:
            "CAC verification service is temporarily unavailable. Please try again in a few minutes.",
        });
      }

      const msg = premblyMsg || error.message || "CAC verification failed";
      return res.status(premblyStatus || 500).json({ message: msg });
    }
  }

  // static async validateUser(req: Request, res: Response) {
  //   try {
  //     const resNIN =  KYCController.getNIN();
  //     const resNameEnquiry = KYCController.nameEnquiry();

  //   } catch (error) {
  //     console.error("Failed to get bank list:", error);
  //   }
  // }

  // 🔥 Helper method to normalize names for comparison
  private static normalizeName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z\s]/g, "") // Remove special characters
      .replace(/\s+/g, " "); // Replace multiple spaces with single space
  }

  // 🔥 Helper method to check if names match
  private static compareNames(ninNames: { surname: string; firstname: string }, accountName: string): boolean {
    const normalizedSurname = this.normalizeName(ninNames.surname);
    const normalizedFirstname = this.normalizeName(ninNames.firstname);
    const normalizedAccountName = this.normalizeName(accountName);

    // Split account name into parts
    const accountNameParts = normalizedAccountName.split(" ");

    // Check if both surname and firstname are present in the account name
    const surnameMatch = accountNameParts.some((part) => part === normalizedSurname);
    const firstnameMatch = accountNameParts.some((part) => part === normalizedFirstname);

    return surnameMatch && firstnameMatch;
  }

  static async validateUser(req: Request, res: Response) {
    try {
      const { nin, bankCode, accountNumber } = req.body;

      // 1. Validate required fields
      if (!nin || !bankCode || !accountNumber) {
        return res.status(400).json({
          message: "NIN, bankCode, and accountNumber are required",
        });
      }

      const cacheKey = `validateUser:${nin}:${bankCode}:${accountNumber}`;

      // 🔹 Check cache first
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        console.log("✅ Cache hit for validateUser:", cacheKey);
        const parsedData = JSON.parse(cachedData);
        return res.status(parsedData.status).json(parsedData.body);
      }
      console.log("❌ Cache miss for validateUser:", cacheKey);

      // 2. Make API calls in parallel
      const [ninResponse, nameEnquiryResponse] = await Promise.all([
        axios.post(
          `${PREMBLY_BASE}/verification/vnin`,
          { number_nin: nin },
          {
            headers: {
              "Content-Type": "application/json",
              "x-api-key": process.env.PREMBLY_API_KEY as string,
              "app-id": process.env.PREMBLY_APP_ID as string,
            },
          }
        ),
        ZainpayHelper.nameEnquiry(bankCode, accountNumber),
      ]);

      // 3. Extract data and check for errors
      const ninData = ninResponse.data?.nin_data;
      if (!ninData) {
        return res.status(400).json({
          message: "Invalid NIN or NIN verification failed",
        });
      }

      // Handle ZainPay response structure
      let accountName: string | undefined;

      if (typeof nameEnquiryResponse === "string") {
        try {
          const parsed = JSON.parse(nameEnquiryResponse);
          accountName = parsed.data?.accountName || parsed.accountName;
        } catch (error) {
          // ignore parsing error, will be handled by !accountName check
        }
      } else if (typeof nameEnquiryResponse === "object" && nameEnquiryResponse !== null) {
        const responseAsAny = nameEnquiryResponse as any;
        accountName = responseAsAny.data?.accountName || responseAsAny.accountName;
      }

      if (!accountName) {
        return res.status(400).json({
          message: "Invalid account details or name enquiry failed",
          debug: nameEnquiryResponse,
        });
      }

      // 4. Compare names
      const ninNames = {
        surname: ninData.surname,
        firstname: ninData.firstname,
      };

      const namesMatch = KYCController.compareNames(ninNames, accountName);

      // 5. Send response
      if (namesMatch) {
        const responseBody = {
          message: "success",
          data: {
            firstName: capitalize(ninData.firstname),
            lastName: capitalize(ninData.surname),
            middleName: capitalize(ninData.middleName),
            validation: "PASSED",
            nin_names: `${ninNames.firstname} ${ninNames.surname}`,
            account_name: accountName,
            match_status: "Names match successfully",
          },
        };
        await redis.set(cacheKey, JSON.stringify({ status: 200, body: responseBody }), "EX", 3600);
        return res.status(200).json(responseBody);
      } else {
        const responseBody = {
          message: "Names do not match",
          data: {
            validation: "FAILED",
            nin_names: `${ninNames.firstname} ${ninNames.surname}`,
            account_name: accountName,
            match_status: "Names do not match",
          },
        };
        await redis.set(cacheKey, JSON.stringify({ status: 400, body: responseBody }), "EX", 3600);
        return res.status(400).json(responseBody);
      }
    } catch (error: any) {
      console.error("Failed to validate user:", error.response?.data || error.message);
      return res.status(500).json({
        message: "Internal Server Error!",
        error: error.response?.data || error.message,
      });
    }
  }

  static async getKYCByUserId(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          message: "userId is required",
        });
      }

      const kyc = await Kyc.findOne({ user_id: userId });

      if (!kyc) {
        return res.status(404).json({
          message: "KYC not found for this user",
        });
      }

      return res.status(200).json({
        message: "success",
        data: kyc,
      });
    } catch (error: any) {
      console.error("Failed to get KYC:", error.response?.data || error.message);
      return res.status(500).json({
        message: "Internal Server Error!",
        error: error.response?.data || error.message,
      });
    }
  }

  /**
   * Submit KYC (app workflow): creates/updates the user's KYC record,
   * optionally cross-checking NIN + bank name, and marks it pending.
   */
  static async submitKYC(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const {
        accountType: kycAccountType,
        fullName,
        phone,
        address,
        state,
        nin,
        bankCode,
        bankName,
        accountNumber,
        businessName,
        businessRegNumber,
        governmentIdUrl,
        selfieWithIdUrl, // Can be liveness photo URL
        livenessPhotoUrl, // Dedicated liveness photo URL
        businessCertificateUrl,
        // Liveness verification evidence
        livenessVerifiedAt,
        livenessStepsCompleted,
        livenessStepsTotal,
        livenessVerified,
        livenessPhotoUrls, // All step photos {center, left, right, up, down}
      } = req.body;

      // Validate required fields
      if (!kycAccountType || !fullName) {
        return res.status(400).json({
          message: "accountType and fullName are required",
        });
      }

      // Check if KYC already exists
      let kyc = await Kyc.findOne({ user_id: userId });

      if (kyc && kyc.status === "approved") {
        return res.status(400).json({
          message: "Your KYC has already been approved",
        });
      }

      // Verify NIN if provided
      let ninVerified = false;
      let nameMatchVerified = false;
      let accountName = null;

      if (nin && bankCode && accountNumber) {
        try {
          // Use the existing validateUser logic
          const [ninResponse, nameEnquiryResponse] = await Promise.all([
            KYCController.getNINData(nin),
            ZainpayHelper.nameEnquiry(bankCode, accountNumber),
          ]);

          const ninData = ninResponse?.nin_data;
          if (ninData) {
            ninVerified = true;

            // Extract account name from response
            if (typeof nameEnquiryResponse === "string") {
              try {
                const parsed = JSON.parse(nameEnquiryResponse);
                accountName = parsed.data?.accountName || parsed.accountName;
              } catch (error) {}
            } else if (typeof nameEnquiryResponse === "object" && nameEnquiryResponse !== null) {
              const responseAsAny = nameEnquiryResponse as any;
              accountName = responseAsAny.data?.accountName || responseAsAny.accountName;
            }

            // Compare names
            if (accountName) {
              const normalizedSurname = ninData.surname?.toLowerCase().trim() || "";
              const normalizedFirstname = ninData.firstname?.toLowerCase().trim() || "";
              const normalizedAccountName = accountName.toLowerCase().trim();
              const accountNameParts = normalizedAccountName.split(" ");

              const surnameMatch = accountNameParts.some((part: string) => part === normalizedSurname);
              const firstnameMatch = accountNameParts.some((part: string) => part === normalizedFirstname);

              nameMatchVerified = surnameMatch && firstnameMatch;
            }
          }
        } catch (error) {
          console.log("NIN/Bank verification failed, continuing with KYC submission:", error);
        }
      }

      // Create or update KYC record
      const kycData = {
        user_id: userId,
        kycAccountType,
        fullName,
        phone,
        address,
        state,
        nin,
        bankCode,
        bankName,
        accountNumber,
        accountName,
        businessName,
        businessRegNumber,
        governmentIdUrl,
        selfieWithIdUrl: selfieWithIdUrl || livenessPhotoUrl, // Use liveness photo if selfie not provided
        livenessPhotoUrl: livenessPhotoUrl || selfieWithIdUrl, // Store in dedicated field too
        businessCertificateUrl,
        // Liveness verification evidence
        livenessVerifiedAt: livenessVerifiedAt ? new Date(livenessVerifiedAt) : undefined,
        livenessStepsCompleted: livenessStepsCompleted || 0,
        livenessStepsTotal: livenessStepsTotal || 5,
        livenessVerified: livenessVerified || false,
        livenessPhotoUrls: livenessPhotoUrls || {}, // All step photos for evidence
        // Status
        status: "pending" as const,
        verificationLevel: "none" as const,
        ninVerified,
        nameMatchVerified,
        submittedAt: new Date(),
      };

      if (kyc) {
        // Update existing record
        kyc = await Kyc.findOneAndUpdate(
          { user_id: userId },
          { $set: kycData },
          { new: true }
        );
      } else {
        // Create new record
        kyc = new Kyc(kycData);
        await kyc.save();
      }

      return res.status(201).json({
        message: "KYC submitted successfully",
        data: {
          status: kyc?.status,
          ninVerified,
          nameMatchVerified,
          submittedAt: kyc?.submittedAt,
        },
      });
    } catch (error: any) {
      console.error("Failed to submit KYC:", error);
      return res.status(500).json({
        message: "Internal Server Error!",
        error: error.message,
      });
    }
  }

  /**
   * Get current user's KYC status
   */
  static async getMyKYCStatus(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const kyc = await Kyc.findOne({ user_id: userId }).select(
        "status verificationLevel ninVerified nameMatchVerified submittedAt reviewedAt rejectionReason kycAccountType"
      );

      if (!kyc) {
        return res.status(200).json({
          message: "success",
          data: {
            status: "not_submitted",
            verificationLevel: "none",
          },
        });
      }

      return res.status(200).json({
        message: "success",
        data: kyc,
      });
    } catch (error: any) {
      console.error("Failed to get KYC status:", error);
      return res.status(500).json({
        message: "Internal Server Error!",
        error: error.message,
      });
    }
  }

  /**
   * Admin: Approve KYC request
   * - Personal accounts: Just verified (no tier)
   * - Business accounts: Require tier level (bronze, gold, platinum)
   */
  static async approveKYC(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { verificationLevel } = req.body;
      const adminId = req.user?._id;

      // First, get the KYC to check account type
      const existingKyc = await Kyc.findOne({ user_id: userId });
      if (!existingKyc) {
        return res.status(404).json({ message: "KYC not found" });
      }

      const isBusinessAccount = existingKyc.kycAccountType === "business";

      // Business accounts require tier level
      if (isBusinessAccount) {
        if (!verificationLevel || !["bronze", "gold", "platinum"].includes(verificationLevel)) {
          return res.status(400).json({
            message: "Business accounts require verification level: bronze, gold, or platinum",
          });
        }
      }

      // For personal accounts, set level to 'verified', for business use the tier
      const finalLevel = isBusinessAccount ? verificationLevel : "verified";

      const kyc = await Kyc.findOneAndUpdate(
        { user_id: userId },
        {
          $set: {
            status: "approved",
            verificationLevel: finalLevel,
            reviewedBy: adminId,
            reviewedAt: new Date(),
          },
        },
        { new: true }
      );

      // Update user's verified field
      const User = require("../user/user.model").default;
      await User.findByIdAndUpdate(userId, {
        $set: {
          verified: isBusinessAccount ? capitalize(verificationLevel) : "Verified",
        },
      });

      return res.status(200).json({
        message: "KYC approved successfully",
        data: kyc,
      });
    } catch (error: any) {
      console.error("Failed to approve KYC:", error);
      return res.status(500).json({
        message: "Internal Server Error!",
        error: error.message,
      });
    }
  }

  /**
   * Admin: Reject KYC request
   */
  static async rejectKYC(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      const adminId = req.user?._id;

      const kyc = await Kyc.findOneAndUpdate(
        { user_id: userId },
        {
          $set: {
            status: "rejected",
            rejectionReason:
              reason || "Your KYC submission was rejected. Please resubmit with valid documents.",
            reviewedBy: adminId,
            reviewedAt: new Date(),
          },
        },
        { new: true }
      );

      if (!kyc) {
        return res.status(404).json({ message: "KYC not found" });
      }

      return res.status(200).json({
        message: "KYC rejected",
        data: kyc,
      });
    } catch (error: any) {
      console.error("Failed to reject KYC:", error);
      return res.status(500).json({
        message: "Internal Server Error!",
        error: error.message,
      });
    }
  }

  /**
   * Admin: Get all pending KYC requests
   */
  static async getPendingKYC(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const [kycRequests, total] = await Promise.all([
        Kyc.find({ status: "pending" }).sort({ submittedAt: -1 }).skip(skip).limit(limit).lean(),
        Kyc.countDocuments({ status: "pending" }),
      ]);

      return res.status(200).json({
        message: "success",
        data: {
          requests: kycRequests,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error: any) {
      console.error("Failed to get pending KYC:", error);
      return res.status(500).json({
        message: "Internal Server Error!",
        error: error.message,
      });
    }
  }
}
