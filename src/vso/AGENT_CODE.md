# Agent Code — How It Works

An **AgentCode** is a referral/commission record tied to a specific actor (agent, channel partner, or VSO). It encodes two things:

- **`discountPercent`** — discount applied to the buyer's purchase price (currently unused / always `0`).
- **`allocationPercent`** — the percentage of a sale's value that the code owner earns as commission.

---

## Data Model

```
AgentCode {
  code            String   // e.g. "LAG_A3F9X2" — state prefix + 6-char alphanumeric
  createdFor      String   // ObjectId of the owner (agent | channel partner | VSO)
  createdForType  Enum     // "agent" | "channel_partner" | "vso"
  discountPercent Number
  allocationPercent Number
  status          Enum     // "active" | "inactive"
  expiresAt?      Date
}
```

The `createdForType` discriminator is required on every query — a single user can have at most one code per type, and queries always filter on both `createdFor` and `createdForType` to guarantee the correct document is returned.

---

## Creation

### Channel Partner code

Created by an **Account Manager** when onboarding a Silver-tier Channel Partner.

```
POST /account-manager/create-channel-partner
```

- `allocationPercent` is set explicitly (default `15` if omitted).
- This value is the CP's **fixed, immutable commission rate** — it is never modified after creation.
- Platinum-tier CPs do not get an agent code; they receive a wallet instead.

### VSO code

Created automatically when a Channel Partner creates a VSO.

```
POST /vso/create
```

- Only Silver-tier CPs create VSO codes (Platinum CPs use a wallet flow).
- The CP passes an optional `allocationPercent` for the VSO.
- **Constraint**: `vsoAllocationPercent` must be ≤ the CP's own `allocationPercent`. A VSO cannot earn more than their parent CP is authorised to give.
- If the CP omits the field (or sends `0`), the VSO code is created with `allocationPercent: 0`.
- The CP's `allocationPercent` is **never modified** during this process. It permanently represents the CP's commission grant from the platform.

### Agent code

Created by an admin/agent-manager flow, outside the VSO module. Follows the same schema with `createdForType: "agent"`.

---

## Updating a VSO's Allocation

```
PATCH /vso/update-allocation
Body: { vsoId, allocationPercent }
```

Only the VSO's **own** agent code is updated. The CP's code is untouched.

**Validation rule**: `newAllocationPercent ≤ cp.allocationPercent`

The CP's `allocationPercent` is the ceiling — a VSO can be assigned anywhere from `0` up to the full CP rate. Removing a VSO's commission entirely is allowed (set to `0`).

---

## Payout on a Successful Sale (webhook)

When a `deposit.success` webhook is received and the payment type is `buyNumber`, the system determines who to pay based on the **buyer's account type and agent code**.

### Path 1 — Buyer is a VSO

The VSO bought a number for themselves. The split is derived directly from the two agent codes:

| Recipient         | Amount formula                                   |
|-------------------|--------------------------------------------------|
| VSO               | `(vso.allocationPercent / 100) × saleAmount`     |
| Parent CP         | `((cp.allocationPercent − vso.allocationPercent) / 100) × saleAmount` |

- The VSO transfer is **skipped** if `vso.allocationPercent === 0`.
- The CP transfer is **skipped** if `cp.allocationPercent − vso.allocationPercent === 0`.
- Both transfers are independent Zainpay `fundsTransfer` calls, each producing its own `payout` Transaction record.

### Path 2 — Buyer used a referral code (`user.agentCode` is set)

The buyer signed up or purchased using someone else's code. The code is resolved by its `createdForType`:

| `createdForType`    | Who gets paid                                    | Amount formula                                   |
|---------------------|--------------------------------------------------|--------------------------------------------------|
| `agent`             | The agent                                        | `(code.allocationPercent / 100) × saleAmount`    |
| `channel_partner`   | The channel partner                              | `(code.allocationPercent / 100) × saleAmount`    |
| `vso`               | The VSO **and** their parent CP (split)          | VSO: `(code.allocationPercent / 100) × saleAmount`; CP: `((cp.allocationPercent − code.allocationPercent) / 100) × saleAmount` |

For the `vso` sub-case the parent CP's agent code is fetched at payout time to determine the CP's cut, using the same formula as Path 1.

### Path 3 — Buyer has no agent code and is not a VSO

No commission is initiated. A log entry is written and the transaction completes normally.

---

## Invariants Summary

1. `cp.allocationPercent` is **write-once** — set at CP creation, never modified by VSO operations.
2. `vso.allocationPercent ≤ cp.allocationPercent` — enforced on both creation and update.
3. CP payout = `cp.allocationPercent − vso.allocationPercent` — the CP always earns the difference between their grant and what they gave the VSO.
4. Every payout transfer produces a `Transaction` document of type `payout` linked to the transfer recipient.
5. Zero-value transfers are guarded — no Zainpay call is made if the computed payout amount is `0`.
