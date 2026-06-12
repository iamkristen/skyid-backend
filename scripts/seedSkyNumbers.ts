/**
 * Seeds the `phoneNumbers` pool (Kirani DB) with available Sky ID smart numbers
 * so the buy-number / suggest-number flow works in local development.
 *
 * Run with:  npx ts-node scripts/seedSkyNumbers.ts
 *
 * Idempotent: numbers that already exist are skipped (upsert on `number`).
 */
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const COUNT = 25;
const AMOUNT = 20000; // base price (display/reference only)

async function main() {
  const url = process.env.KIRANI_MONGOOSE_URL;
  if (!url) {
    throw new Error("KIRANI_MONGOOSE_URL is not set in .env");
  }

  const connection = await mongoose.createConnection(url).asPromise();
  console.log("✅ Connected to Kirani DB");

  const PhoneNumber = connection.model(
    "phoneNumbers",
    new mongoose.Schema({
      number: String,
      accountId: String,
      amount: Number,
      available: Boolean,
      billingPass: String,
      agentOwner: String,
      usedBy: String,
      platform: String,
    })
  );

  // Generate plausible Nigerian smart numbers, e.g. 07000123456.
  const numbers: string[] = [];
  for (let i = 0; i < COUNT; i++) {
    const suffix = (1000000 + i * 13).toString().padStart(7, "0");
    numbers.push(`0700${suffix}`);
  }

  let inserted = 0;
  let skipped = 0;
  for (const number of numbers) {
    const existing = await PhoneNumber.findOne({ number });
    if (existing) {
      skipped++;
      continue;
    }
    await PhoneNumber.create({
      number,
      amount: AMOUNT,
      available: true,
      agentOwner: null,
      usedBy: null,
      platform: "SKYID",
    });
    inserted++;
  }

  const availableCount = await PhoneNumber.countDocuments({
    available: true,
    usedBy: null,
    agentOwner: null,
  });

  console.log(
    `Done. Inserted ${inserted}, skipped ${skipped}. Available numbers in pool: ${availableCount}`
  );

  await connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
