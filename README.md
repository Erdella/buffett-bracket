# Parrothead Madness

A Jimmy Buffett song-by-song showdown. Each album gets its own bracket where five family members vote round-by-round until a champion emerges — and the wider **Parrothead Madness** community can join in with their own separate vote tally.

Live demo: hosted on the family Proxmox box. The same code is also deployed to a public read-only viewer.

## Features

- Album-by-album brackets with prelim and round entries (any track in any round)
- Five family voters: Tom, Renae, Danielle, Jon, Eric — majority wins, round advance is blocked until everyone votes
- Personal favorites tracked per voter, separate from bracket voting
- **Community voting (Parrothead Madness):** anyone can sign in with a passwordless magic link (powered by [Resend](https://resend.com)) and cast votes in a *separate* community tally, plus mark their favorite song on each album
- **Admin-controlled community rounds:** open a round for community voting, then close it to lock the community's plurality winner into the bracket (only where a family winner isn't already set)
- **Member management:** see everyone who's signed in and block anyone who shouldn't be voting
- Read-only by default — admin login (single password) unlocks all editing
- SQLite persistence in a mounted volume so data survives container upgrades

## Tech

- Express + Vite + React + Tailwind CSS + shadcn/ui
- Drizzle ORM over `better-sqlite3`
- `express-session` + `bcryptjs` for the admin gate
- [Resend](https://resend.com) for transactional magic-link emails

## Self-hosting on Proxmox (or any Docker host)

### 1. Pick a directory and create `docker-compose.yml`

```yaml
services:
  buffett-bracket:
    image: ghcr.io/erdella/buffett-bracket:latest
    container_name: buffett-bracket
    restart: unless-stopped
    ports:
      - "5000:5000"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=5000
      - ADMIN_PASSWORD_HASH=${ADMIN_PASSWORD_HASH}
      - SESSION_SECRET=${SESSION_SECRET}
      # Community voting (magic-link sign-in via Resend)
      - RESEND_API_KEY=${RESEND_API_KEY}
      - MAIL_FROM=${MAIL_FROM}
      - APP_BASE_URL=${APP_BASE_URL}
```

### 2. Create `.env` next to it

```env
ADMIN_PASSWORD_HASH=$2b$12$your-bcrypt-hash-here
SESSION_SECRET=generate-with-openssl-rand-hex-32

# Community voting via Resend magic links
RESEND_API_KEY=re_your_resend_api_key
MAIL_FROM=Parrothead Madness <noreply@erdella.com>
APP_BASE_URL=https://buffett.erdella.com
```

See `.env.example` for the full annotated list.

Generate a fresh session secret:

```bash
openssl rand -hex 32
```

Generate a bcrypt hash for a new password (replace `your-password`):

```bash
docker run --rm node:20-slim sh -c "node -e \"console.log(require('bcryptjs').hashSync('your-password', 12))\""
```

The hash is safe to commit/share — only the plaintext password matters.

#### Community voting email (Resend)

Community members sign in with a passwordless magic link, delivered via [Resend](https://resend.com):

- `RESEND_API_KEY` — your Resend API key. **Leave it blank to run in dev mode**, where magic links are logged to the server console and shown in the sign-in dialog instead of being emailed (handy for local testing).
- `MAIL_FROM` — the From address, e.g. `Parrothead Madness <noreply@erdella.com>`. The domain must be verified in your Resend account.
- `APP_BASE_URL` — the public base URL (no trailing slash) used to build magic-link URLs, e.g. `https://buffett.erdella.com`. If unset, the app falls back to the request's own origin.

Magic-link tokens are single-use and expire after 30 minutes.

### 3. Start it

```bash
docker compose up -d
```

The app is now on port 5000. Point a reverse proxy (Caddy, Nginx, Traefik) at it for HTTPS.

### 4. Update flow

Whenever you push to `main` on GitHub, the workflow in `.github/workflows/docker.yml` builds a new image and pushes it to `ghcr.io/erdella/buffett-bracket:latest`. To pull the new image on your Proxmox box:

```bash
docker compose pull && docker compose up -d
```

Data in `./data/data.db` survives upgrades.

## Local development

```bash
npm install
npm run dev
```

Server runs on port 5000 with hot-reload for both client and server.

To run the production bundle locally:

```bash
npm run build
ADMIN_PASSWORD_HASH='...' SESSION_SECRET='...' npm start
```

## Auth model

There are two independent sign-in paths:

- **Admin** — one password (set via `ADMIN_PASSWORD_HASH`) unlocks all editing: brackets, family votes, personal favorites, community rounds, and member management.
- **Community member** — a passwordless magic link grants the ability to cast community votes and set album favorites, nothing more.
- Visitors with no session see everything but cannot vote, advance rounds, paste matchups, set favorites, or use the Admin page.
- Sessions live in memory, last 30 days per browser, and clear on restart — fine for a family/community app.

### Family vs. community voting

The two tallies are completely separate. The family bracket still requires all five family members to vote before a round advances. The **community** vote is a separate plurality count that the admin opens and closes per round; closing a round writes the community's winning song onto the bracket *only* for matches that don't already have a family-decided winner.

## License

MIT
