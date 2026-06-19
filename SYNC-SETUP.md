# Cross-device sync setup

Recall·Queue can sync your progress between devices through a tiny Cloudflare
Worker that **you own and deploy**. It's free, private to you, and the app
talks to it directly — there's no third party in between.

How it stays private and free:

- Every request (read **and** write) requires a bearer secret only you hold.
  A stranger who finds the Worker URL can neither read nor change your data.
- All traffic is HTTPS, so the secret and your data can't be intercepted on
  the network.
- Deploy on Cloudflare's **Free plan with no billing attached** — if a limit
  is ever hit, the Worker just returns errors until the next daily reset. It
  cannot generate a bill.

---

## What you need to do (one-time)

You'll need a Cloudflare account and the `wrangler` CLI. I can't do this part
for you — it requires logging into your own Cloudflare account.

1. **Create a free Cloudflare account** at <https://dash.cloudflare.com/sign-up>.
   Do **not** add a payment method — staying on the Free plan is what
   guarantees you can never be charged.

2. **Install wrangler and log in:**
   ```bash
   npm install -g wrangler
   wrangler login
   ```

3. **Create the KV namespace** (from inside the `sync-worker/` folder):
   ```bash
   cd sync-worker
   wrangler kv namespace create STATE
   ```
   Copy the printed `id` into `wrangler.toml`, replacing
   `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.

4. **Generate a long random secret** in your password manager (e.g. 32+ random
   characters) and store it there. Then set it on the Worker:
   ```bash
   wrangler secret put SYNC_SECRET
   # paste the secret when prompted
   ```

5. **Deploy:**
   ```bash
   wrangler deploy
   ```
   Wrangler prints your Worker URL, e.g. `https://srs-prep-sync.<you>.workers.dev`.

6. **Connect each device:** open the app → **Settings → Sync across devices**,
   paste the Worker URL and the same secret. Then, to set the initial
   direction deterministically (rather than relying on timestamps):
   - On the device that has the progress you want to keep, tap
     **↑ Push this device** — this makes it the source of truth in the cloud.
   - On every *other* device, tap **↓ Pull to this device** to overwrite that
     device with the cloud copy.

That's it. After that, sync is automatic: changes push a few seconds after you
make them, and the latest progress is pulled whenever you switch back to a
device. **Tip:** export a backup (Settings → Backup) on your main device before
first-time setup, just in case.

---

## What you do NOT need to share with anyone

- The **secret** stays in your password manager and in each device's
  `localStorage`. Don't commit it, and don't paste it into the repo or chat.
- The **Worker URL** and secret are entered in the app at runtime, so neither
  lives in this public repository.

---

## Notes / limits

- Free KV limits are ~100k reads/day and 1,000 writes/day. The app debounces
  writes, so normal use is a few dozen writes/day — nowhere near the cap.
- The Worker also rejects writes that arrive less than 2 seconds apart, as a
  server-side backstop against a runaway client.
- `ALLOWED_ORIGIN` in `worker.js` is locked to `https://in0x.github.io`. If you
  ever serve the app from a different origin, update that constant and redeploy.
- Conflict handling is last-write-wins on a timestamp — correct for a single
  user across devices, since you're not editing two devices simultaneously.
