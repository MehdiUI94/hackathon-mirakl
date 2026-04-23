# Marketplace Growth Engine — Hackathon Mirakl

Outil interne de prospection et d'activation de marques pour marketplace. Identifie, score, enrichit et contacte automatiquement des marques candidates via des campagnes email pilotées par n8n.

## Fonctionnalités

- **Brand Discovery** — Recherche et filtrage de marques par catégorie, pays, score
- **Scoring automatique** — Score de potentiel calculé à partir de signaux marketplace (Amazon, Zalando, etc.)
- **Enrichissement IA** — Scraping + Claude pour compléter les fiches marques (email, persona, signaux)
- **Campagnes email** — Lancement de séquences outreach via n8n avec suivi des statuts
- **Inbox drafts** — Validation et édition des emails générés avant envoi
- **Dashboard KPI** — Vue d'ensemble des performances (taux de réponse, conversions)

## Stack

- **Next.js 16** + TypeScript + Tailwind CSS
- **Prisma 7** + SQLite (BDD locale, persistante sur Render via disque)
- **Claude API** (Anthropic) pour l'enrichissement des marques
- **n8n** pour l'orchestration des campagnes email
- **Nodemailer** pour l'envoi SMTP
- **next-intl** pour l'i18n (FR / EN)

## Structure du projet

```
hackathon-mirakl/
├── webapp/                  ← Application Next.js (source unique de vérité)
│   ├── app/                 ← Routes API + pages (App Router)
│   ├── components/          ← Composants React
│   ├── lib/                 ← Logique métier (scoring, enrichissement, email, séquences)
│   ├── prisma/              ← Schéma Prisma
│   └── scripts/             ← Seed, import contacts/signaux
├── marketplace_growth_engine_v3.xlsx   ← Workbook source (données brutes)
├── brands_enriched_110_batch.csv       ← Export enrichissement marques
├── render.yaml              ← Config déploiement Render.com
└── netlify.toml             ← Config Netlify (edge functions)
```

## Installation

```bash
cd webapp
npm install          # installe les dépendances + génère le client Prisma
cp .env.example .env # configurer les variables d'environnement
```

### Variables d'environnement requises (`.env`)

```env
DATABASE_URL="file:./dev.db"
ANTHROPIC_API_KEY="sk-ant-..."
N8N_WEBHOOK_URL="https://..."          # webhook n8n pour lancer les campagnes
N8N_CALLBACK_BASE_URL="https://..."    # URL publique de l'app (pour les callbacks n8n)
APP_BASE_URL="https://..."             # URL publique de l'app
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_USER="..."
SMTP_PASS="..."
SMTP_FROM="..."
```

## Développement

```bash
cd webapp
npm run dev          # démarre sur http://localhost:3000
```

### Initialiser la base de données

```bash
# Première fois
npx prisma migrate dev --config ./prisma.config.ts

# Seed avec les données du workbook
npm run seed

# Importer les contacts enrichis
npm run import:contacts

# Importer les signaux marketplace
npm run import:signals
```

## Scripts disponibles

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de développement (port 3000) |
| `npm run build` | Build de production |
| `npm run start` | Serveur de production |
| `npm run render:start` | Démarrage Render (migrate + start) |
| `npm run seed` | Seed de la BDD depuis le workbook |
| `npm run import:contacts` | Import des contacts enrichis |
| `npm run import:signals` | Import des signaux marketplace |

## Déploiement

### Render.com (configuré)

Le fichier `render.yaml` à la racine configure le déploiement automatique :
- Runtime : Node.js, région Frankfurt
- Répertoire : `webapp/`
- Base de données : SQLite sur disque persistant (`/var/data/dev.db`)
- Auto-deploy sur push vers `main`

1. Aller sur [render.com](https://render.com) → New → Blueprint
2. Connecter le repo GitHub `MehdiUI94/hackathon-mirakl`
3. Render détecte `render.yaml` automatiquement
4. Ajouter les variables d'environnement manquantes (`ANTHROPIC_API_KEY`, SMTP, n8n URLs)

### Variables à configurer manuellement sur Render

`ANTHROPIC_API_KEY`, `N8N_WEBHOOK_URL`, `N8N_CALLBACK_BASE_URL`, `APP_BASE_URL`, `SMTP_*`

## Architecture n8n

L'app expose des webhooks pour s'intégrer avec n8n :

- `POST /api/campaigns/launch` → déclenche le workflow n8n
- `POST /api/webhooks/n8n/preview` → callback de prévisualisation email
- `GET /api/emails/preview` → rendu HTML de l'email pour n8n
- `GET /api/campaigns/tick` → cron interne (toutes les 5 min via `instrumentation.ts`)

## Données sources

Les fichiers Excel/CSV à la racine sont les données brutes du hackathon. Ils servent de source pour les scripts d'import et ne font pas partie de l'application.

| Fichier | Contenu |
|---------|---------|
| `marketplace_growth_engine_v3.xlsx` | Workbook principal (marques, scoring, campagnes) |
| `brands_enriched_110_batch.csv` | Marques enrichies (110 entrées) |
| `contact_marques_enrichi_emails_v2.xlsx` | Contacts enrichis avec emails |
| `stratégie-matching/` | CSVs de scoring détaillé et recommandations |
