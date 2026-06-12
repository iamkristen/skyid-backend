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
  try {
    const connection = mongoose.createConnection(process.env.KIRANI_MONGOOSE_URL as never);
    console.log("✅ Kirani Database is connected");
    return connection;
  } catch (error) {
    console.log(error, "❌ error");
  }
};
