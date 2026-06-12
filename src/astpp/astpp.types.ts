export interface RingGroupInfo {
  strategy: string;
  reseller_id: string;
  accountid: string;
  description: string;
  duration: string;
  status: string;
  ringgroup_id: string;
  ringgroup_name: string;
}

export interface DidInfo {
  id: string;
  did_id?: string;
  productid: string;
  number: string;
  status: string;
  country_id: string;
  accountid: string;
  cost: string;
  monthlycost: string;
  call_type: string;
  extensions: string;
  province: string;
  city: string;
  setup_fee: string;
  call_timeout: string;
  cc: string;
  days_to_unhold: number;
  is_purchased: string;
  billing_type: string;
  billing_days: string;
  reseller_id: string;
}

export interface AstppAuthResponse {
  status?: boolean;
  error?: string;
  response_code: number;
  data?: { id: string; token: string };
  [key: string]: any;
}

export interface AstppResponse {
  status?: boolean;
  success?: string;
  error?: string;
  response_code: number;
  total_count?: number;
  data?: any;
  [key: string]: any;
}

export interface RingGroupExtension {
  type: string; // e.g., "1"
  set: string; // e.g., phone number like "08146191761"
  delay: string; // e.g., "5"
  timeout: string; // e.g., "5"
  promptdropdown: string; // e.g., "1"
}

export interface CreateRingGroupData {
  accountid: string;
  ringgroup_name: string;
  reseller_id?: string;
  ring_strategy?: string;
  extensions: RingGroupExtension[];
  description?: string;
  announcement?: string;
  ringback?: string;
  cid_name_prefix?: string;
  cid_number_prefix?: string;
  callrecording?: string;
  skipbusy?: string;
  no_answer_call_type?: string;
  no_answer_call_type_value?: string;
  status?: string;
}

export interface UpdateRingGroupData extends Partial<CreateRingGroupData> {
  ringgroup_id: string; // The ID of the ring group to update
}

export interface ListRingGroupsParams {
  object_where_params?: {
    name?: string;
    reseller?: string;
    account?: string;
    ring_strategy?: string;
    status?: string;
  };
  start_limit?: string;
  end_limit?: string;
}

export interface ForwardDidData {
  did_id: string;
  call_type: string;
  call_type_destination: string;
  always?: string;
  always_destination?: string;
  user_busy?: string;
  user_busy_destination?: string;
  user_not_registered?: string;
  user_not_registered_destination?: string;
  no_answer?: string;
  no_answer_destination?: string;
}

export interface ListDidsParams {
  object_where_params?: {
    number?: string;
    country_id?: string;
    province?: string;
    city?: string;
    reseller_id?: string;
    accountid?: string;
    call_type?: string;
    extensions?: string;
    status?: string;
  };
  start_limit?: string;
  end_limit?: string;
}

export interface ListCustomersParams {
  object_where_params?: {
    number?: string;
    first_name?: string;
    last_name?: string;
    company_name?: string;
    maxchannels?: string;
    balance?: string;
    credit_limit?: string;
    first_used?: string;
    expiry?: string;
    pricelist_id?: string;
    status?: string;
    type?: string;
    permission_id?: string;
    creation?: string;
    posttoexternal?: string;
    sweep_id?: string;
    reseller_id?: string;
  };
  start_limit?: string;
  end_limit?: string;
}

export interface CreateRecordingData {
  recording_name: string;
  reseller_id: string | number;
  accountid: string | number;
  audio_recording?: any;
}

export interface RecordingData {
  name: string;
  file_name: string;
  accountid: string;
  reseller_id: number;
  creation_date: string;
  last_modified_date: string;
  recording_id: number;
}
