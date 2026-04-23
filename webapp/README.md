This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## n8n Callback URL

If n8n Cloud must send previews back to this app, set a public callback URL in [webapp/.env](/c:/Cours/hackathon-mirakl/webapp/.env):

```env
N8N_CALLBACK_BASE_URL="https://your-app.ngrok-free.app"
```

You can also use:

```env
APP_BASE_URL="https://your-app.ngrok-free.app"
```

`N8N_CALLBACK_BASE_URL` is preferred for the n8n callback. It should point to a public URL that reaches this local app, for example through ngrok or Cloudflare Tunnel.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Render

This app uses SQLite, so the simplest public deployment is a Render web service with a persistent disk.

### Render setup

This repo includes a root [render.yaml](/c:/Cours/hackathon-mirakl/render.yaml) blueprint.

What it does:

- deploys the `webapp` subdirectory as a Node web service
- mounts a persistent disk at `/var/data`
- stores SQLite at `file:/var/data/dev.db`
- runs Prisma migrations before start
- lets the app auto-detect its public URL via Render's `RENDER_EXTERNAL_URL`

After deployment, your preview endpoint will be:

```text
https://<your-service>.onrender.com/api/emails/preview
```
