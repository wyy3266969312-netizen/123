# TikTok Creator SOP Tool

An AI-powered workflow platform for TikTok Shop creator outreach and collaboration.

This tool helps TikTok Shop sellers manage creator outreach, sample follow-up, video delivery, and collaboration status in a clear SOP-based workflow.

Built with ChatGPT + Codex for creator collaboration operations.

**Using the tool day to day?** See [使用手册](docs/使用手册.md) — a step-by-step operator guide in Chinese, from setting up a product through running a round to closing it out. The rest of this README is for people working on the code.

---

## Features

- One-time purchase, unlocked by an approved account or a license key
- Manual approval from the Supabase table editor — nobody can self-approve
- Free `?demo=1` preview that needs neither
- Creator outreach workflow management
- Daily creator follow-up task list
- Sample delivery and video progress tracking
- AI-assisted creator message generation
- Multiple script angles per scenario, switchable per creator
- Relationship-tier tone layering for outreach messages
- Product-category presets covering pet, beauty, home, kitchen, apparel, electronics, baby, food, and fitness
- Two collaboration models: TikTok Shop affiliate link, or discount code with creator-placed orders
- TikTok Creator Marketplace intake as a distinct outreach path
- Email subject lines, with in-thread follow-ups kept on the original subject
- FTC disclosure and content-usage clauses in every filming brief
- SOP-based collaboration status management
- Multi-stage creator pipeline
- Local creator workflow and message generation without required API keys
- Optional DeepSeek integration for creator reply translation and personalized replies

---

## Product Goal

After uploading a creator collaboration spreadsheet, the tool automatically analyzes each creator’s current status and generates a daily follow-up task list.

The goal is to help sellers know which creators need attention today and what action should be taken next.

---

## Target Users

- TikTok Shop small sellers
- Chinese cross-border e-commerce teams
- New sellers managing creator collaborations for the first time
- Brand-side operators who need a clearer outreach workflow

---

## Core Value

The tool helps users:

1. Know what to do next in each creator collaboration stage
2. Manage creators in a more professional brand-side workflow
3. Save time writing creator follow-up messages
4. Improve creator video delivery rate
5. Reduce wasted product samples

---

## Scope

A lightweight deployable web tool.

Users can upload a spreadsheet. The tool reads the creator data, analyzes each creator’s current status, and generates a daily task list.

The tool is sold as a one-time purchase and unlocked with a license key. There is
still no login, no database, and no TikTok API connection: the key is verified by
signature on each check, and all creator data stays in the user's own browser.

---

## First Product Template

The first product template is designed for a pet steam grooming brush.

Video requirements:

- 2 videos per creator
- Each video should be 60 seconds or longer
- Video 1: real review style
- Video 2: daily pet-care routine style
- Must tag the brand account
- Must add the TikTok Shop product link

Content priority:

1. Show the loose hair removed
2. Show the mist feature clearly
3. Show the pet’s real reaction during grooming
4. Show a natural daily pet-care scene
5. Show easy cleanup

---

## Creator Status Options

- Not Contacted
- Invited
- Replied
- Sample Requested
- Sample Approved
- Sample Shipped
- Delivered
- Waiting Video
- Posted
- Need Revision
- Product Tag Missing
- Ready for Ads
- Spark Ads Requested
- Completed
- Lost

---

## Spreadsheet Fields

The uploaded spreadsheet should include:

- Creator username
- Creator profile link
- Contact method
- Product
- Current status
- Sample shipping status
- Video progress
- Last contact date
- Notes

Video progress uses `X/N`, where `N` is the current Campaign's positive required-video count. `N` is not limited to a fixed list or maximum.

Spreadsheet software may auto-convert values like `1/2` into a date, so users can also use safer formats such as:

- `1 of 2`
- `0 of 2`
- `2 of 2`
- `1 video`
- `posted 1`

The system should generate:

- Suggested status
- Suggested reason
- Daily task
- Priority
- Recommended next action

---

## Daily Task Priority Rules

Priority order:

1. Highest: the creator has replied and is waiting for handling, or the product was delivered at least 2 natural days ago and video progress is still `0/N`
2. High: the creator has posted some but not all required videos, or the product is delivered but its delivery date is missing
3. Medium: creator was followed up, but has not replied after 1 day
4. Low: creator was contacted, but has not replied after 2 days

Handled-today, archived, completed, and failed work does not enter today's pending queue. A pending creator reply overrides pause notes and future follow-up dates. Without a pending reply, an explicit pause or future follow-up date suppresses the automatic delivered-age Highest rule.

---

## Failed Collaboration Candidate Rules

The system should only suggest failure. The user makes the final decision.

Suggest “Failed Candidate” when:

- Sample was delivered 7 days ago and video progress is still `0/N`; the task remains Highest and also shows the warning
- Creator was followed up twice and still has not replied
- Creator posted only 1 video and has not posted the second video after 5 days
- Creator has not replied for a long time and has no clear filming plan
- The video does not follow the brief and the creator is unwilling to correct it

---

## Output Structure

After the user uploads a spreadsheet, the tool should show:

1. Daily task summary
2. Daily task table sorted by priority
3. Explanation for all highest-priority creators
4. Suggested next action for each creator
5. A prompt for the user to select a creator and generate a message

The tool should not automatically generate messages for all creators at once.

---

## Message Generation Logic

When the user selects a creator and contact channel, the tool should generate:

1. English message first
2. Chinese explanation below

Message style:

- Native US creator communication style
- Professional but warm
- Not too humble
- Not overly excited
- Clear and direct
- Suitable for TikTok Shop creator collaboration

Channel style:

- TikTok DM: short and natural
- TikTok Shop affiliate message: medium length and clear
- Email: more complete and structured
- WhatsApp: conversational but slightly more detailed than TikTok DM

Script angles:

Each scenario carries several angles instead of one fixed template, so a batch
of creators does not receive byte-identical messages. Angle 1 is the neutral
default and matches the wording the tool has always produced; the composer's
"换一个说法" button cycles through the rest. Angles change the approach, never
the campaign facts.

Relationship tiers:

Outreach-stage messages take an extra tone layer chosen per creator — 冷启动,
腰部达人, 头部达人, or 老合作达人 — which adjusts the opening and closing only.
Logistics, revision, and final-confirmation messages stay neutral at every tier
so the required action stays unambiguous.

Collaboration models:

A campaign is either `affiliate-link` (TikTok Shop product link, brand ships the
sample) or `discount-code` (personal creator code, audience discount, commission
attributed through the code). Order method is configured separately: the brand
ships, or the creator places the order themselves with a code covering the full
cost and sends back an order number before anything is shipped. Commission
rates, discounts, attribution windows, and codes are stated in the copy only
when the campaign has actually set them.

Creator source:

Creators are either found by outreach or arrive through TikTok Creator
Marketplace. TCM creators have already opted in, so they get a follow-up on the
accepted invitation rather than a cold pitch — including a direct answer to the
common question about why the marketplace shows a particular fee.

Email subjects:

Email is the only channel with a subject line. First contact and campaign
milestones get a fresh subject; follow-ups deliberately get none, and the
composer shows a note to reply inside the existing thread instead.

Compliance:

Every full brief asks for an `#ad` or branded-content disclosure, which US
creators need under FTC endorsement guidance. Campaigns that set a content-usage
window also state it in the brief. Both are configurable per campaign.

Product categories:

A campaign's category preset supplies the default filming requirements and the
Chinese-to-English lexicon used to build the brief. The category is chosen in
campaign settings, or inferred from the product name for campaigns saved before
categories existed. A Chinese content point that has no translation falls back
to the category's English wording rather than being dropped from the message.

---

## Tech Stack

- TypeScript
- Vite
- ChatGPT
- Codex
- Vercel

---

## Deployment

A static Vite build plus four serverless routes, deployed to Vercel: two paid AI
endpoints and the two license endpoints. Nothing else is required to run it —
there is no database and no session store.

---

## Running the Paid Deployment

This is a commercial product, not a template. The source is proprietary — see
[LICENSE](LICENSE) — and the sections below are the operating notes for whoever
runs the deployment.

Day-to-day selling and support steps live in
[上线运营手册](docs/上线运营手册.md). This section covers the wiring.

### How the paywall works

A license key looks like `SOP-A2BC-D3EF-GH4J-KMN5-PQR6`. The first 8 characters
are a serial that identifies the purchase; the last 12 are an HMAC of that
serial under `LICENSE_SIGNING_SECRET`. The signature is the proof of purchase,
so a key can be issued and verified with **no database** — which is what lets
the paid version run on the same static + serverless deployment as before.

What that buys, and what it costs:

- Issuing a key is one HTTP call and stores nothing.
- A key cannot be un-issued, only revoked, through `LICENSE_REVOKED_SERIALS`.
- Nothing counts devices. One key pasted into ten browsers unlocks ten
  browsers; revoking its serial is the answer to a key that leaks.
- Rotating `LICENSE_SIGNING_SECRET` invalidates **every key ever sold**. Set it
  once and back it up.

The browser stores the accepted key in `localStorage` and re-presents it on
every paid API call. It re-checks the key with the server every 14 days: an
explicit rejection locks the app, while an unreachable server leaves access
alone, so a buyer offline does not lose the tool they paid for.

Because the app is client-side, a determined technical user can bypass the UI
gate. The server-side guard on `/api/deepseek-reply` is what actually protects
the part that costs money — it refuses an unlicensed request before calling the
provider.

### Environment variables

Required in production:

```env
LICENSE_SIGNING_SECRET=long_random_secret   # openssl rand -base64 48
LICENSE_ADMIN_TOKEN=separate_admin_token    # guards the key-minting endpoint
```

Optional:

```env
LICENSE_REVOKED_SERIALS=ABCDEFGH,JKMNPQRS   # serials to stop accepting
DEEPSEEK_API_KEY=...                        # creator reply translation
DEEPSEEK_MODEL=deepseek-chat
```

Purchase-page copy is build-time configuration, so these are baked into the
bundle and are public by design:

```env
VITE_LICENSE_PRICE_LABEL=¥49
VITE_LICENSE_CONTACT=your_wechat_id
VITE_LICENSE_PAY_QR=/pay-qr.png             # file goes in public/
VITE_LICENSE_BUY_URL=                       # hosted checkout, if any
```

`VITE_*` values are read at build time, so changing one needs a redeploy.

Never commit real secrets. Every one of these belongs in the Vercel project's
environment variables or in a local `.env.local`.

### Issuing a key after someone pays

```bash
curl -X POST https://<deployment>/api/issue-license \
  -H "x-admin-token: $LICENSE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"count":1,"note":"wechat 2026-08-26"}'
```

The response is `{ "keys": ["SOP-…"], … }`. Send the key to the buyer; they
paste it into the purchase page once. `note` is echoed back untouched and is
only there to help you paste the key and the buyer together into your own
records — the server keeps nothing.

`count` is capped at 50 per request.

### Revoking a key

Add the key's serial — the 8 characters right after `SOP-` — to
`LICENSE_REVOKED_SERIALS` and redeploy. The next check locks that key out, at
most 14 days later for a browser that is already unlocked, immediately for a
new activation.

### Local development

`vite dev` does not serve `/api`, so a key cannot be verified locally and the
paywall is off in development builds (`isLicenseGateActive` in
[src/license.ts](src/license.ts)). It is on for every production build,
including `npm run preview` — which will therefore be stuck at the purchase
page, since `/api` still is not served. Test the gate on a real deployment or a
preview deployment.

### Public Demo Safety

Add `?demo=1` to the URL to open Safe Demo Mode, for example
`https://your-deployment/?demo=1`. Demo mode is in front of the paywall on
purpose: it is the free preview a buyer looks at before deciding, and the
purchase page links to it.

In demo mode the app shows a fixed set of obviously-fake creators and one demo
campaign, and a banner at the top of the workspace makes the mode visible.
Nothing is read from or written to `localStorage` while it is on:
`loadCreatorRows`, `loadCampaigns`, and the filming-requirements loader all
short-circuit, and the storage accessors in `creatorData.ts` and
`campaignData.ts` return `null`, so saves become no-ops. Real creator records
are neither shown nor modified, and edits made during a demo live in React
state only and disappear on reload.

License storage is deliberately outside that isolation, so a demo session can
never clear a paying user's activation.

Remove the parameter (or use the banner's "退出演示模式" link) to return to your
own data, which is untouched.

Demo mode is the recommended way to give public demonstrations, take
screenshots, or share a walkthrough link. Outside demo mode, do not import real
creator data, private collaboration records, production spreadsheets, or real
credentials for those purposes.

---

## Privacy and Security

- Do not upload real creator CSV files to GitHub.
- Do not commit `.env`, `.env.local`, `.env.production`, or other environment files.
- Do not commit API keys, tokens, passwords, cookies, or private credentials.
- Do not share production `localStorage` data, because it may contain real creator workflow information.
- Use Safe Demo Mode (`?demo=1`) for public or shared demonstrations; it isolates the session from your real data.
- Do not use real creator data in public or shared demonstrations.

---

## Roadmap

### Implemented

- Excel / CSV creator data import and export
- Browser-local creator and campaign data storage
- Daily task analysis and follow-up queues
- Creator database search, filtering, status management, and archiving
- Local creator message templates and follow-up message generation
- Optional DeepSeek reply translation and personalized reply generation
- Content review workflow and ad-ready asset tracking
- Multi-store and multi-product campaign configuration
- Safe Demo Mode with isolated fake data (`?demo=1`)
- Multi-angle script library with a per-creator variant switcher
- Relationship-tier tone layering for outreach scripts
- Product-category presets and lexicons for non-pet campaigns
- Discount-code collaboration model with a creator-placed-order pipeline
- TikTok Creator Marketplace source field and dedicated follow-up scripts
- Email subject-line generation and in-thread follow-up handling
- FTC disclosure and content-usage clauses in the filming brief
- One-time license key paywall, with the paid API routes guarded server-side
- Account sign-up and sign-in, gated on manual approval, beside license keys

### Planned

- Browser automation support
- TikTok Shop workflow integration
- Campaign performance tracking
- Team collaboration features

---

## License

Proprietary. All rights reserved — see [LICENSE](LICENSE).

Versions published before that file changed were released under the MIT License;
that grant still covers copies already obtained under it.
