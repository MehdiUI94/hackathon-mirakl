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

## Free public deployment

The most practical fully free setup for this project is:

- `Vercel Hobby` for the Next.js app
- `Neon Free` for the PostgreSQL database

This repo is now configured for that setup.

### 1. Create a free Neon database

Create a Neon project and copy two connection strings:

- `DATABASE_URL`: the pooled connection string
- `DIRECT_URL`: the direct connection string

Prisma's PostgreSQL docs recommend using a pooled runtime URL and a direct URL for schema operations.

### 2. Deploy `webapp` on Vercel

When importing this repo in Vercel:

1. Import the GitHub repository
2. Set the **Root Directory** to `webapp`
3. Add these environment variables in Vercel:

```env
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
N8N_LAUNCH_WEBHOOK_URL=https://your-n8n.cloud/webhook/...
CRON_SECRET=your-random-secret
```

`CRON_SECRET` is used to protect the scheduled `/api/campaigns/tick` route.

### 3. Public URLs

Once deployed, your app will be publicly reachable at:

```text
https://<your-project>.vercel.app
```

Use these n8n endpoints:

```text
https://<your-project>.vercel.app/api/emails/preview
https://<your-project>.vercel.app/api/webhooks/n8n/preview
```

The app automatically derives its callback URL from the deployment host in production, so you do not need a local tunnel.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Notes

- Vercel Hobby cron jobs are limited, so this repo schedules a daily cron instead of an every-5-min job.
- For local development after this migration, set `DATABASE_URL` to a PostgreSQL database as well.
