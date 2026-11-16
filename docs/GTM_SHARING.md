# Sharing and link previews

Player-facing copy on these surfaces is Vietnamese and describes the game only: planting, visiting and taking fruit with friends. Keep infrastructure terms out of it.

## Link preview

`web/index.html` carries the Open Graph and Twitter card tags. They point at `https://nongtraimongmo.xyz/social/preview.jpg`, which Vite serves from `image/social/preview.jpg` (1200 × 630).

The image is composed from existing approved art: the loading background (`image/background/loading-desktop.webp`) and one frame of the guard dog (`image/pets/dog/dog-guard.png`), with the title and tagline set in the system font. Its source is `docs/art/social-preview.html`. To render it again after changing the source:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
  --allow-file-access-from-files --window-size=1200,630 \
  --screenshot=/tmp/preview.png "file://$PWD/docs/art/social-preview.html"
sips -s format jpeg -s formatOptions 82 /tmp/preview.png --out image/social/preview.jpg
```

Facebook and Threads cache previews per URL. After a deploy that changes the image or tags, re-scrape the URL in the Meta Sharing Debugger before posting.

## Farm links

`/farm/<username>` opens the game on that player's farm. `/?farm=<username>` is an equivalent fallback for places that strip paths. Both are parsed by `parseFarmLink` in `shared/community.mts`.

- A visitor with an account goes through the normal visit route, so the owner sees the visit in their journal.
- A visitor with no account sees the farm read-only through `GET /community/public/farms/:username`. Nothing is recorded, and tapping a ripe plot opens account creation. After signing up or logging in, the farm reloads through the account route and fruit can be taken.
- A link that names an unknown or malformed player leaves the visitor on their own farm with a message, and the address is reset to `/`.

On Vercel the route is added in `tools/build-vercel.mjs` (`/farm/<username>` → `index.html`). The Vite dev and preview servers already fall back to `index.html`.

## Share buttons

Every share links to the sharer's own farm (`farmShareUrl` in `web/src/share.ts`) so the people who open it can visit and take fruit from them.

| Surface | Where | `surface` value |
|---|---|---|
| Chia sẻ vườn | HUD action row on the home farm | `farm` |
| Khoe ngay | Visit bar, after taking a fruit | `steal` |
| Kể bạn bè | Visit bar, after a guard pet blocks the attempt | `pet_block` |
| Chia sẻ | Beside each entry in the activity journal | `journal` |

The device share sheet is used when the browser has one. Otherwise the message and link are copied and the player is told to paste them. Dismissing the share sheet does nothing. A player with no account is sent to account creation, since a farm link needs a username.

Each attempt sends the GA4 event `share_click` with `surface` and `outcome` (`shared`, `copied`, `cancelled` or `failed`).

## Mobile and in-app browsers

Most shared links open inside the Facebook or Threads app on a phone.

**Load weight.** Measured on the production build at 375 × 812 (headless Chrome, local network, 16 Nov 2026): the first load fell from 24.3 MB to 10.6 MB after ten HUD icons were downscaled from 1024–1416 px to 256 px (they are drawn at 56 px or less) and the default background was converted from PNG to JPEG. The request count is unchanged at 318. What remains is mostly the four theme backgrounds and every crop sprite being preloaded; loading only the active theme and the crops a player can plant is the next saving.

**Guest progress.** A guest's farm is tied to an HttpOnly cookie that lasts 30 days, so closing and reopening the same in-app browser keeps the farm. The farm is not reachable from another browser, and it is lost if the app clears its cookies. After a guest's first harvest the game shows a one-time card offering to create an account (`web/src/save-prompt.ts`). It waits for the tour and any open dialog, and reports the GA4 event `save_prompt` with `action` `shown`, `accept` or `dismiss`.

**Touch targets.** The share buttons and the save card buttons are at least 44 px tall.

### Manual checklist (one Android phone, one iPhone)

Headless Chrome cannot stand in for the real in-app browsers. Run this on the deployed site, once from the Facebook app and once from the Threads app on each phone.

1. Post or message yourself `https://nongtraimongmo.xyz/farm/<a real username>`. The preview shows the farm image, the title and the Vietnamese description.
2. Tap the link. It opens inside the app's browser, the loading bar finishes, and you land on that player's farm with their name at the top left. Note the time from tap to farm on mobile data.
3. Tap a plot marked “Lấy 1 quả”. The account form opens on the create tab. The keyboard does not cover the password field or the submit button.
4. Create an account. You return to the same farm, and tapping the plot now takes a fruit or shows the guard pet blocking you.
5. Tap “Khoe ngay” or “Kể bạn bè”. The phone's share sheet opens with the message and your farm link. If no sheet opens, a message says the text was copied; paste it into a chat to confirm.
6. Tap “Về nhà”. The address returns to the home page and your own farm shows.
7. On your own farm, tap the share button in the top-right action column. The share sheet or the copy message appears.
8. Open the journal and tap “Chia sẻ” on an entry. Same result as step 7.
9. Close the in-app browser, reopen the same link from the app, and confirm you are still signed in.
10. In a fresh guest session (log out first): plant, harvest, and confirm the “Giữ vườn này lại nhé!” card appears once the tour and dialogs are closed, both buttons are easy to hit, and “Để sau” does not bring it back after a reload.
11. Close the in-app browser as a guest, reopen the home link from the app, and confirm the guest farm is unchanged. Then open the same link in Safari or Chrome and note that it starts a new farm; this is expected and is why step 10 exists.
12. Rotate to landscape and back on the home farm and on a visited farm. Nothing is cut off and no horizontal scroll appears.

## Attribution

On first load the client reads `utm_source`, `utm_medium`, `utm_campaign` and the farm named by a shared link (`web/src/attribution.ts`). The first visit that carries any of them is stored on the device and reused afterwards, so a player who arrives from Threads and signs up two days later is still counted for Threads.

`game_boot` and `sign_up` carry `utm_source` (`(direct)` when there is none), `utm_medium`, `utm_campaign` and `referred_by_player`. The referring username is kept on the device and is never sent to analytics; `referred_by_player` only says that a player's link brought them.

Values must be lowercase slugs of up to 40 characters (`a-z`, `0-9`, `_`, `.`, `-`). Anything else is dropped.

### UTM convention

| Where the link is posted | `utm_source` | `utm_medium` | `utm_campaign` |
|---|---|---|---|
| Threads post, reply or bio | `threads` | `social` | post type and week, e.g. `nostalgia_w1`, `dare_w2`, `launch` |
| Facebook Page post or Reel | `facebook_page` | `social` | e.g. `reel_w1`, `leaderboard_w2`, `raid_night` |
| Own Facebook group | `facebook_group` | `community` | e.g. `daily_links`, `pinned` |
| Someone else's group | `facebook_group` | `seeding` | a short name for the group, e.g. `hoai_niem_8x` |
| Creator posts | `creator` | `social` | the creator's handle, e.g. `tenkoc` |
| Paid boost | `facebook_ads` | `paid` | the ad name, e.g. `reel_pet_w3` |
| Player share buttons (set automatically) | `share` | `player` | `farm`, `steal`, `pet_block` or `journal` |

Example: `https://nongtraimongmo.xyz/?utm_source=threads&utm_medium=social&utm_campaign=nostalgia_w1`. A dare on the founder's farm uses the farm link with the same parameters: `https://nongtraimongmo.xyz/farm/<username>?utm_source=threads&utm_medium=social&utm_campaign=dare_w1`.

Register `utm_source`, `utm_medium`, `utm_campaign`, `referred_by_player`, `surface` and `outcome` as event-scoped custom dimensions in GA4 before the launch, or they will not appear in reports.

## Weekly leaderboard

`GET /community/leaderboard` returns this week's top five in three rankings. It needs no account and is cached for a minute. The week runs Monday 00:00 to Sunday 24:00 in Vietnam time (`leaderboardWeekStart` in `shared/community.mts`).

| Ranking | Ordered by | Tie-break |
|---|---|---|
| Trùm trộm rau | different farms the player took fruit from | fruit taken, then username |
| Vườn bị trộm nhiều nhất | different players who took fruit from the farm | fruit lost, then username |
| Thú cưng giữ vườn giỏi nhất | different players the farm's pet turned away | number of blocks, then username |

Counting different farms and players first means raiding one friend's farm over and over cannot lift someone up the board. The panel opens from the trophy button in the HUD, prints the week and the site address so a screenshot carries the link, highlights the signed-in player, and has its own share button (`surface` `leaderboard`).

Usernames on the board are visible to anyone who opens the game, including people with no account.

## Invite reward

Approved as amendment FV-INVITE-01 in `docs/FARMVERSE_MVP_CONTRACT.md`. Sizes live in `shared/invite.mts`.

- The client sends the stored referring username with account creation. The server looks it up, ignores unknown names and self-referrals, and stores it on the new account (`farm_accounts.referred_by`).
- The reward is settled by the server (`backend/src/invite-store.ts`) once the invited player has both an account and a completed harvest, in either order: after the harvest for someone who signed up first, or at sign-up for a guest who had already harvested.
- The invited player gets 2 strawberry seeds. The inviter gets 10 Gold for up to 5 invited players per Vietnam day; beyond that the invited player still gets seeds and the inviter gets nothing for that one.
- Both farms change in one transaction, and the account is marked settled in the same transaction, so retries and concurrent requests pay nothing more.
- The inviter sees an entry in their journal: “… đã vào chơi nhờ lời mời của bạn. Bạn nhận 10 Gold.”

Sign-in through the gated social login does not carry a referrer, so those accounts earn no invite reward.
