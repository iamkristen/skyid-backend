import axios, { AxiosInstance } from "axios";
import FormData from "form-data";
import fs from "fs";
import {
  AstppAuthResponse,
  AstppResponse,
  CreateRecordingData,
  CreateRingGroupData,
  ForwardDidData,
  ListCustomersParams,
  ListDidsParams,
  ListRingGroupsParams,
  RingGroupExtension,
  UpdateRingGroupData,
} from "./astpp.types";

export class AstppClient {
  private static id: string = "";
  private static token: string = "";
  private static auth_token: string = process.env.ASTPP_API_TOKEN || "";
  private static client: AxiosInstance = axios.create({
    baseURL: process.env.ASTPP_API_URL || "",
    headers: {
      "Content-Type": "application/json",
      "x-auth-token": this.auth_token,
    },
  });

  /**
   * Helper to dynamically flatten extensions list into the format required by ASTPP
   */
  private static formatExtensions(extensions: RingGroupExtension[]): Record<string, string> {
    const result: Record<string, string> = {
      row_count: extensions.length.toString(),
    };

    extensions.forEach((ext, index) => {
      const i = index + 1; // 1-based indexing for ASTPP extension fields
      result[`extensions_type_${i}`] = ext.type;
      result[`extensions_set_${i}`] = ext.set;
      result[`delay_${i}`] = ext.delay;
      result[`time_out_${i}`] = ext.timeout;
      result[`promptdropdown_${i}`] = ext.promptdropdown;
    });

    return result;
  }

  private static async authenticate() {
    if (AstppClient.id && AstppClient.token) {
      return;
    }
    const payload = {
      username: process.env.ASTPP_API_USERNAME || "",
      password: process.env.ASTPP_API_PASSWORD || "",
      device_id: "45C18B55-26C-4504-AADF-034BDFE1AFEA",
      callkit_token: "BE6CAF775FFC2C1AAD28D9992E467156F044D68D21C59E4973C3A692DACAB03C",
      apns_token: "63c7620a2c5ce0a1717850ecb559fb994c57bc6180f49c2e815efab09421f924",
      mobile_type: "android",
    };

    const response = await AstppClient.client.post<AstppAuthResponse>(
      `${process.env.ASTPP_API_URL}/api/login/`,
      payload
    );
    if (!response.data.status || !response.data.data) {
      console.error(response.data);
      throw new Error("Failed to authenticate with ASTPP API");
    }
    AstppClient.id = response.data.data.id;
    AstppClient.token = response.data.data.token;
    console.log(`Authenticated with ASTPP API as user ${AstppClient.id}`);
  }

  /**
   * Creates a new ring group
   */
  public static async createRingGroup(data: CreateRingGroupData): Promise<AstppResponse> {
    const { extensions, ...rest } = data;
    const extensionData = AstppClient.formatExtensions(extensions);

    const payload = {
      ...rest,
      token: AstppClient.token,
      action: "ringgroup_create",
      id: AstppClient.id,
      reseller_id: data.reseller_id || "0",
      ring_strategy: data.ring_strategy || "simultaneous",
      ringback: data.ringback || "au-ring",
      callrecording: data.callrecording || "0",
      description: data.description || "",
      announcement: data.announcement || "",
      cid_name_prefix: data.cid_name_prefix || "",
      cid_number_prefix: data.cid_number_prefix || "",
      skipbusy: data.skipbusy || "",
      no_answer_call_type: data.no_answer_call_type || "",
      no_answer_call_type_value: data.no_answer_call_type_value || "",
      status: data.status || "",
      ...extensionData,
    };

    try {
      const response = await AstppClient.client.post("/admin/ringgroup/", payload);
      return response.data;
    } catch (error: any) {
      if (error.response && error.response.data) {
        return error.response.data;
      }
      throw error;
    }
  }

  /**
   * Updates an existing ring group
   */
  public static async updateRingGroup(data: UpdateRingGroupData): Promise<AstppResponse> {
    const { extensions, ...rest } = data;

    let payload: Record<string, any> = {
      ...rest,
      id: AstppClient.id,
      token: AstppClient.token,
      action: "ringgroup_update",
    };

    if (extensions) {
      const extensionData = AstppClient.formatExtensions(extensions);
      payload = { ...payload, ...extensionData };
    }

    try {
      const response = await AstppClient.client.post("/admin/ringgroup/", payload);
      return response.data;
    } catch (error: any) {
      if (error.response && error.response.data) {
        return error.response.data;
      }
      throw error;
    }
  }

  /**
   * Deletes a ring group
   */
  public static async deleteRingGroup(ringgroup_id: string): Promise<AstppResponse> {
    const payload = {
      id: AstppClient.id,
      token: AstppClient.token,
      action: "ringgroup_delete",
      ringgroup_id: ringgroup_id,
    };

    try {
      const response = await AstppClient.client.post("/admin/ringgroup/", payload);
      return response.data;
    } catch (error: any) {
      if (error.response && error.response.data) {
        return error.response.data;
      }
      throw error;
    }
  }

  /**
   * Lists DIDs
   */
  public static async listDids(params?: ListDidsParams): Promise<AstppResponse> {
    const payload = {
      id: AstppClient.id,
      token: AstppClient.token,
      action: "list",
      start_limit: params?.start_limit || "1",
      end_limit: params?.end_limit || "50",
      object_where_params: params?.object_where_params || {
        number: "",
        country_id: "",
        province: "",
        city: "",
        reseller_id: "",
        accountid: "",
        call_type: "",
        extensions: "",
        status: "",
      },
    };

    try {
      const response = await AstppClient.client.post("/admin/did_admin/", payload);
      return response.data;
    } catch (error: any) {
      if (error.response && error.response.data) {
        return error.response.data;
      }
      throw error;
    }
  }

  /**
   * Forwards a DID to a destination (e.g. ring group)
   */
  public static async forwardDid(data: ForwardDidData): Promise<AstppResponse> {
    const payload = {
      id: AstppClient.id,
      token: AstppClient.token,
      action: "forward",
      did_id: data.did_id,
      call_type: data.call_type,
      call_type_destination: data.call_type_destination,
      always: data.always || "",
      always_destination: data.always_destination || "",
      user_busy: data.user_busy || "",
      user_busy_destination: data.user_busy_destination || "",
      user_not_registered: data.user_not_registered || "",
      user_not_registered_destination: data.user_not_registered_destination || "",
      no_answer: data.no_answer || "",
      no_answer_destination: data.no_answer_destination || "",
    };

    try {
      const response = await AstppClient.client.post("/admin/did_admin/", payload);
      return response.data;
    } catch (error: any) {
      if (error.response && error.response.data) {
        return error.response.data;
      }
      throw error;
    }
  }

  /**
   * Lists ring groups
   */
  public static async listRingGroups(params?: ListRingGroupsParams): Promise<AstppResponse> {
    const payload = {
      id: AstppClient.id,
      token: AstppClient.token,
      action: "ringgroup_list",
      object_where_params: params?.object_where_params || {
        name: "",
        reseller: "",
        account: "",
        ring_strategy: "",
        status: "",
      },
      start_limit: params?.start_limit || "1",
      end_limit: params?.end_limit || "100",
    };

    try {
      const response = await AstppClient.client.post("/admin/ringgroup/", payload);
      return response.data;
    } catch (error: any) {
      if (error.response && error.response.data) {
        return error.response.data;
      }
      throw error;
    }
  }

  /**
   * Creates a recording in ASTPP
   */
  public static async createRecording(data: CreateRecordingData, fileStream: fs.ReadStream): Promise<AstppResponse> {
    try {
      await AstppClient.authenticate();

      const form = new FormData();
      form.append("action", "create");
      form.append("recording_name", data.recording_name);
      form.append("reseller_id", data.reseller_id.toString());
      form.append("accountid", data.accountid.toString());
      form.append("id", AstppClient.id);
      form.append("token", AstppClient.token);

      if (fileStream) {
        form.append("audio_recording", fileStream);
      }

      const response = await AstppClient.client.post("/admin/recording/", form, {
        headers: {
          ...form.getHeaders(),
          "x-auth-token": AstppClient.auth_token,
        },
      });
      return response.data;
    } catch (error: any) {
      if (error.response && error.response.data) {
        return error.response.data;
      }
      throw error;
    }
  }

  /**
   * Updates the ringback for a specific DID's ring group
   */
  public static async updateRingback(didNumber: string, recordingId: string): Promise<boolean> {
    try {
      await AstppClient.authenticate();

      // 1. Check for Existing Ring Group
      const ringGroupListResponse = await AstppClient.listRingGroups({
        object_where_params: { name: didNumber },
      });

      const existingRingGroup =
        ringGroupListResponse.response_code === 200 &&
        ringGroupListResponse.data &&
        ringGroupListResponse.data.length > 0
          ? ringGroupListResponse.data[0]
          : null;

      if (!existingRingGroup) {
        console.error(`ASTPP Sync: No ring group found for ${didNumber} to update ringback.`);
        return false;
      }

      const updateResponse = await AstppClient.updateRingGroup({
        ringgroup_id: existingRingGroup.ringgroup_id || existingRingGroup.id,
        accountid: existingRingGroup.accountid,
        ringgroup_name: existingRingGroup.ringgroup_name || didNumber,
        ringback: recordingId,
      });

      if (!updateResponse.status) {
        console.error(`ASTPP Sync: Failed to update ringback for ring group ${didNumber}:`, updateResponse.error);
        return false;
      }

      return true;
    } catch (error) {
      console.error(`ASTPP Sync Error updating ringback for DID ${didNumber}:`, error);
      return false;
    }
  }

  /**
   * Lists customers
   */
  public static async listCustomers(params?: ListCustomersParams): Promise<AstppResponse> {
    const payload = {
      id: AstppClient.id,
      token: AstppClient.token,
      action: "customer_list",
      object_where_params: params?.object_where_params || {
        number: "",
        first_name: "",
        last_name: "",
        company_name: "",
        maxchannels: "",
        balance: "",
        credit_limit: "",
        first_used: "",
        expiry: "",
        pricelist_id: "",
        status: "",
        type: "",
        permission_id: "",
        creation: "",
        posttoexternal: "",
        sweep_id: "",
        reseller_id: "",
      },
      start_limit: params?.start_limit || "1",
      end_limit: params?.end_limit || "50",
    };

    try {
      const response = await AstppClient.client.post("/admin/customer/", payload);
      return response.data;
    } catch (error: any) {
      if (error.response && error.response.data) {
        return error.response.data;
      }
      throw error;
    }
  }

  /**
   * Orchestrates the process of syncing a DID's ring group based on its mapped numbers.
   * Creates a ring group if it doesn't exist, updates it if it does, and forwards the DID to it.
   */
  public static async syncRingGroupForDid(
    didNumber: string,
    extensionsData: { number: string; delay?: string; timeout?: string }[]
  ): Promise<boolean> {
    try {
      await AstppClient.authenticate();

      // 1. Retrieve Customer Details to get accountid
      const customerListResponse = await AstppClient.listCustomers({
        object_where_params: { number: didNumber },
      });

      if (
        customerListResponse.response_code !== 200 ||
        !customerListResponse.data ||
        customerListResponse.data.length === 0
      ) {
        console.error(`ASTPP Sync: Customer with number ${didNumber} not found.`);
        console.error(customerListResponse);
        return false;
      }

      const customerInfo = customerListResponse.data[0];
      const accountId = customerInfo.accountid;

      if (!accountId) {
        console.error(`ASTPP Sync: No accountid found for customer ${didNumber}.`);
        return false;
      }

      // 2. Check for Existing Ring Group
      const ringGroupListResponse = await AstppClient.listRingGroups({
        object_where_params: { name: didNumber },
      });

      const existingRingGroup =
        ringGroupListResponse.response_code === 200 &&
        ringGroupListResponse.data &&
        ringGroupListResponse.data.length > 0
          ? ringGroupListResponse.data[0]
          : null;

      // Prepare extensions
      const extensions: RingGroupExtension[] = extensionsData.map((ext) => ({
        type: "1", // 1 typically means external number/PSTN
        set: ext.number,
        delay: ext.delay || "0",
        timeout: ext.timeout || "0",
        promptdropdown: "0",
      }));

      // 3. Create or Update the Ring Group
      let ringgroupIdToForward = "";

      if (existingRingGroup) {
        ringgroupIdToForward = existingRingGroup.ringgroup_id || existingRingGroup.ringgroup_name || didNumber;
        const updateResponse = await AstppClient.updateRingGroup({
          ringgroup_id: existingRingGroup.ringgroup_id || existingRingGroup.id,
          accountid: accountId,
          ringgroup_name: didNumber,
          extensions: extensions,
          ringback: existingRingGroup.ringback || "au-ring",
        });

        if (!updateResponse.status) {
          console.error(`ASTPP Sync: Failed to update ring group for ${didNumber}:`, updateResponse.error);
          return false;
        }
      } else {
        const createResponse = await AstppClient.createRingGroup({
          accountid: accountId,
          ringgroup_name: didNumber,
          extensions: extensions,
        });

        if (!createResponse.status) {
          console.error(`ASTPP Sync: Failed to create ring group for ${didNumber}:`, createResponse.error);
          return false;
        }
        const createdRingGroup = await AstppClient.listRingGroups({
          object_where_params: { name: didNumber },
        });

        // Use the DID number as the ring group identifier for forwarding since it's used as the name
        ringgroupIdToForward = createdRingGroup.data?.[0].ringgroup_id;
      }

      // 4. Link the DID to the Ring Group
      // We need to fetch the DID id first
      const didListResponse = await AstppClient.listDids({
        object_where_params: { number: didNumber },
      });

      if (didListResponse.response_code !== 200 || !didListResponse.data || didListResponse.data.length === 0) {
        console.error(`ASTPP Sync: DID ${didNumber} not found for forwarding.`);
        return false;
      }

      const didInfo = didListResponse.data[0];
      const didId = didInfo.did_id;

      if (!didId) {
        console.error(`ASTPP Sync: No did_id found for DID ${didNumber}.`);
        return false;
      }

      // call_type "7"is typically Ring Group in ASTPP
      const forwardResponse = await AstppClient.forwardDid({
        did_id: didId,
        call_type: "7",
        call_type_destination: ringgroupIdToForward,
      });

      if (!forwardResponse.status) {
        console.error(`ASTPP Sync: Failed to forward DID ${didNumber}:`, forwardResponse.error);
        return false;
      }

      console.log(`ASTPP Sync: Successfully synced Ring Group for DID ${didNumber}`);
      return true;
    } catch (error) {
      console.error(`ASTPP Sync Error for DID ${didNumber}:`, error);
      return false;
    }
  }
}
