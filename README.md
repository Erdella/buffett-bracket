# The Buffett Bracket

A family song-by-song showdown for Jimmy Buffett's catalog. Each album gets its own bracket where five family members vote round-by-round until a champion emerges.

Live demo: hosted on the family Proxmox box. The same code is also deployed to a public read-only viewer.

## Features

- Album-by-album brackets with prelim and round entries (any track in any round)
- Five family voters: Tom, Renae, Danielle, Jon, Eric — majority wins, round advance is blocked until everyone votes
- Personal favorites tracked per voter, separate from bracket voting
- Read-only by default — admin login (single password) unlocks all editing
- SQLite persistence in a mounted volume so data survives container upgrades

## Tech

- Express + Vite + React + Tailwind CSS + shadcn/ui
- Drizzle ORM over `better-sqlite3`
- `express-session` + `bcryptjs` for the admin gate

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
```

### 2. Create `.env` next to it

```env
ADMIN_PASSWORD_HASH=$2b$12$your-bcrypt-hash-here
SESSION_SECRET=generate-with-openssl-rand-hex-32
```

Generate a fresh session secret:

```bash
openssl rand -hex 32
```

Generate a bcrypt hash for a new password (replace `your-password`):

```bash
docker run --rm node:20-slim sh -c "node -e \"console.log(require('bcryptjs').hashSync('your-password', 12))\""
```

The hash is safe to commit/share — only the plaintext password matters.

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

- Visitors see everything but cannot vote, advance rounds, paste matchups, set personal favorites, or use the Admin page
- One admin password (set via `ADMIN_PASSWORD_HASH`) unlocks all mutations
- Session lives in memory, lasts 30 days per browser, clears on restart — fine for a one-admin family app

## License

MIT
