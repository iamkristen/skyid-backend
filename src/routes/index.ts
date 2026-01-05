import { Router } from "express";
import UserRoutes from "../user/user.routes";
import NumberRoutes from "../smart-number/number.routes";
import WebhookRoutes from "../zainpay/webhook.routes";
import WalletRoutes from "../wallet/wallet.routes";
import SwitchTeamRoute from "../switch/switch.routes";
import UserManagementRoute from "../admin/admin.routes";
import FinanceTeamRoutes from "../finance/finance.routes";
import ChannelPartnerRoutes from "../partner/partner.routes";
import VsoRoutes from "../vso/vso.routes";
import CustomerEnablementRoute from "../customer-enablement/customer.routes";
import AccountManagerRoutes from "../account-manager/account-manager.routes";
import KycRoute from "../kyc/kyc.routes";
import AgentRoute from "../agent/agent.routes";
import AuthRoutes from "../auth/auth.routes";
import CompetitionRoutes from "../competition/competition.routes";

const routers = Router();

routers.use("/auth", AuthRoutes);
routers.use("/user", UserRoutes);
routers.use("/smart-number", NumberRoutes);
routers.use("/webhook", WebhookRoutes);
routers.use("/wallet", WalletRoutes);
routers.use("/switch-team", SwitchTeamRoute);
routers.use("/account-manager", AccountManagerRoutes);
routers.use("/customer-enablement", CustomerEnablementRoute);
routers.use("/finance-team", FinanceTeamRoutes);
routers.use("/channel-partner", ChannelPartnerRoutes);
routers.use("/vso", VsoRoutes);
routers.use("/admin", UserManagementRoute);
routers.use("/kyc", KycRoute);
routers.use("/agent", AgentRoute);
routers.use("/competition", CompetitionRoutes);

// Integration routes for third-party services
routers.use("/integration", AuthRoutes);
routers.use("/integration", UserRoutes);
routers.use("/integration", NumberRoutes);

export default routers;
