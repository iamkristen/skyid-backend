import { Response, Request } from "express";
import dotenv from "dotenv";
import axios from "axios";
import redis from "../config/redis";
import { ZainpayHelper } from "../zainpay/zainpay.controller";
import { capitalize } from "../utils/string.utils";
import Kyc from "./kyc.model";

dotenv.config();

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
        "https://api.prembly.com/verification/vnin",
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
        "https://api.prembly.com/verification/vnin",
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
        "https://api.prembly.com/verification/cac",
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
          "https://api.prembly.com/verification/vnin",
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
}
