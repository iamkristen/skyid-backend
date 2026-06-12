# ASTPP Integration Mapping

This document outlines the business logic, mapping, and API orchestration required to integrate our backend application with the ASTPP switch for managing DIDs and Ring Groups.

## Overview

The primary goal of this integration is to automatically provision and manage Ring Groups, and correctly link them to incoming DIDs (Smart Numbers). To simplify identification, **a Ring Group is always named after the DID it is associated with**.

The ASTPP Wrapper (`AstppClient` in `astpp.service.ts`) provides static helper methods to interact with the switch.

## Orchestration Flow

When assigning a DID to a set of extensions (creating a ring group and forwarding the DID to it), follow this sequential process:

### 1. Retrieve Customer Details
Before creating a Ring Group, we must identify the `accountid` associated with the target DID.
*   **Method:** `AstppClient.listCustomers()`
*   **Endpoint:** `/admin/customer/` (Action: `customer_list`)
*   **Mapping:** Query using `object_where_params: { number: "<DID_NUMBER>" }`.
*   **Target Data:** Extract the `accountid` from the matched customer record.

### 2. Check for Existing Ring Group
To prevent duplicates, check if a Ring Group already exists for this DID.
*   **Method:** `AstppClient.listRingGroups()`
*   **Endpoint:** `/admin/ringgroup/` (Action: `ringgroup_list`)
*   **Mapping:** Query using `object_where_params: { name: "<DID_NUMBER>" }`.
*   **Target Data:** Check if `data` contains any records.

### 3. Create or Update the Ring Group
If no Ring Group exists, create a new one. The most critical mapping here is that the **Ring Group's account ID must match the DID's account ID**.
*   **Method:** `AstppClient.createRingGroup()`
*   **Endpoint:** `/admin/ringgroup` (Action: `ringgroup_create`)
*   **Mappings:**
    *   `ringgroup_name`: Set to the `<DID_NUMBER>` (e.g., `"07003100010"`).
    *   `accountid`: Set to the `accountid` retrieved in Step 1.
    *   `extensions`: Pass an array of `RingGroupExtension` objects. The wrapper dynamically flattens these into the `extensions_type_1`, `extensions_set_1`, etc., format expected by ASTPP.

*(Note: If the Ring Group already exists and you only need to modify it, use `AstppClient.updateRingGroup()` passing the `ringgroup_id`).*

### 4. Link the DID to the Ring Group (DID Forwarding)
Once the Ring Group is created, you must configure the DID to route incoming calls to this Ring Group.
*   **Method:** `AstppClient.forwardDid()`
*   **Endpoint:** `/admin/did_admin/` (Action: `forward`)
*   **Mappings:**
    *   `did_id`: The internal ID of the DID (can be retrieved via `listDids`).
    *   `call_type`: The ASTPP specific ID/code corresponding to routing to a Ring Group (e.g., "7").
    *   `call_type_destination`: The Ring Group identifier to route the call to.

## Entity Mappings Reference

### Ring Group Extensions
ASTPP expects flat keys for extensions (`extensions_type_1`, `extensions_set_1`, etc.). Our wrapper accepts an array of objects and formats them automatically:
```json
[
  {
    "type": "1",
    "set": "08146191761",
    "delay": "5",
    "timeout": "5",
    "promptdropdown": "1"
  }
]
```

### Deleting a Ring Group
To delete a Ring Group:
*   **Method:** `AstppClient.deleteRingGroup(ringgroup_id)`
*   **Endpoint:** `/admin/ringgroup` (Action: `ringgroup_delete`)
*   **Mapping:** Requires the specific internal `ringgroup_id` of the Ring Group (obtainable via `listRingGroups`).
