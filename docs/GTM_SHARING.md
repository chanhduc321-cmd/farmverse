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
