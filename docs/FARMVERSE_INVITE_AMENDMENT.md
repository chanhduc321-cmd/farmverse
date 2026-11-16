# FV-INVITE-01 — Invite reward

| Field | Value |
|---|---|
| Amends | [MVP contract](FARMVERSE_MVP_CONTRACT.md) section 10 (no new mechanics without an amendment); adds one reward source beside the missions and attendance in [Gameplay](FARMVERSE_GAMEPLAY.md) |
| Proposed | 2026-11-16 |
| Status | **Approved by the project owner on 2026-11-16** |
| Implementation | `shared/invite.mts`, `backend/src/invite-store.ts`, migration `016_farm_invites.sql` |

## Scope

This amendment covers the invite reward only. It changes no existing price, mission, attendance reward or steal rule.

## Reason

The Threads and Facebook launch depends on players sending their farm link to friends. A small reward gives both sides a reason to finish the first harvest.

## Rule

| Domain | Rule & System Behavior |
|---|---|
| **Who qualifies** | A player who first arrived through another player's farm link, creates an account, and completes a first harvest. The two conditions may be met in either order. |
| **Invited player** | Receives **2 strawberry seeds** (20 Gold at the 10 Gold seed price). Seeds cannot be spent on fertilizer. |
| **Inviter** | Receives **10 Gold**, the size of the daily mission reward. |
| **Once only** | One reward per invited account. |
| **Daily cap** | An inviter is paid for at most **5** invited players per day, Vietnam time. Further invited players that day still receive their seeds. |
| **Never rewarded** | A click on a link, an account with no harvest, an unknown referrer, or a player naming themselves. |
| **Authority** | The server decides and applies the reward in one transaction. The client only names the referring player when the account is created. |

The values are the named constant `INVITE_REWARD` in `shared/invite.mts`.

## Impact

At most 50 Gold a day enters an inviter's balance from this source, compared with 10 Gold from the daily mission and 5 to 20 Gold from attendance.

## Acceptance

- The reward is granted once when both conditions are met, in either order.
- Repeated and concurrent requests grant nothing more.
- The sixth invited player in a day pays the inviter nothing and still receives seeds.
- Unknown and self referrers are ignored.
- The inviter sees the invite in the activity journal.
