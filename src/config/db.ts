import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

export const database = () => {
  try {
    mongoose.connect(process.env.MONGOOSE_URL as never);
    console.log("✅-✅ MongoDB is connected");
  } catch (error) {
    console.log(error, "❌ error");
  }
};

export const KiraniDatabase = () => {
  // Make Kirani database optional for development
  if (!process.env.KIRANI_MONGOOSE_URL) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('⚠️  KIRANI_MONGOOSE_URL not set - Kirani Database disabled. Some features may not work.');
    }
    return null;
  }

  try {
    const connection = mongoose.createConnection(process.env.KIRANI_MONGOOSE_URL as never);
    console.log("✅ Kirani Database is connected");
    return connection;
  } catch (error) {
    console.log(error, "❌ error");
    return null;
  }
};
