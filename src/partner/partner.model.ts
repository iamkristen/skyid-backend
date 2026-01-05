import { model, Schema } from "mongoose";
import { IChannelPartner } from "./partner.types";

// 2. Create a Schema corresponding to the document interface.
const channelPartnerSchema = new Schema<IChannelPartner>(
  {
    name: String,
    phoneNumber: String,
    email: String,
    businessName: String,
    region: String,
    accountType: String,
    status: String,
    handledBy: String,
    signupSecret: String,
  },
  { timestamps: true }
);

// 3 Create a Model
const ChannelPartner = model("channelPartner", channelPartnerSchema);

export default ChannelPartner;
