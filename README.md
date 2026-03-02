# Invoice Tool (Next.js + Supabase)

Application complète de gestion de factures et devis pour freelance / petite agence, optimisée pour Vercel.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Supabase (PostgreSQL + Auth + Storage)
- PDF client-side: `@react-pdf/renderer`
- Assistant IA: Mammouth API (OpenAI-compatible) via package `openai`
- Toasts: `sonner`
- Thème sombre: `next-themes`

## Fonctionnalités principales

- Factures et devis (`FAC-YYYY-XXXX`, `DEV-YYYY-XXXX`)
- Numérotation atomique par type + année
- Conversion devis → facture
- Suivi de statut + paiement + détection retard
- Clients + autofill dans les documents
- Prévisualisation document + génération PDF immédiate
- Assistant IA pour patch JSON de formulaire
- Import d'une ancienne facture PDF dans l'assistant IA (pré-remplissage auto)
- Paramètres vendeur (SIRET, TVA, IBAN, logo, préfixes)

## Installation locale

1. Installer les dépendances:

```bash
npm install
```

2. Créer le fichier d'environnement:

```bash
cp .env.example .env.local
```

3. Renseigner les variables dans `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MAMMOUTH_API_KEY`
- `MAMMOUTH_PDF_MODEL` (optionnel, défaut: `mistral-small-3.2-24b-instruct`)
- `MAMMOUTH_OCR_MODEL` (optionnel, défaut: `gpt-4o`)
- `MAMMOUTH_OCR_MAX_PAGES` (optionnel, défaut: `2`, max `4`)
- `MAMMOUTH_OCR_TEXT_THRESHOLD` (optionnel, défaut: `500`)

4. Créer le schéma Supabase:

- Ouvrir Supabase SQL Editor
- Exécuter le contenu de [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql)
- Si la base est déjà initialisée, exécuter aussi [`supabase/migrations/002_micro_entrepreneur_legal_mention.sql`](supabase/migrations/002_micro_entrepreneur_legal_mention.sql)
- Créer un bucket public `logos` (Storage) pour l'upload logo
- Auth > URL Configuration:
  - Ajouter `http://localhost:3001/auth/callback` dans les Redirect URLs
  - Ajouter aussi votre URL Vercel en production, ex: `https://votre-app.vercel.app/auth/callback`

5. Lancer en local:

```bash
npm run dev
```

## Déploiement Vercel

1. Push sur votre dépôt Git
2. Importer le projet dans Vercel
3. Configurer les variables d'environnement identiques à `.env.local`
4. Déployer

Aucun Docker ni process long-running requis.

## Endpoints API

- `POST /api/documents/number` → génération atomique du numéro
- `POST /api/ai/fill-invoice` → assistant IA Mammouth
- `POST /api/ai/extract-from-pdf` → extraction d'une facture PDF puis patch JSON
- `POST /api/documents/mark-overdue` → passage auto en `overdue`
- `GET /auth/callback` → finalise la session Supabase après Magic Link

## Notes IA Mammouth

Le client OpenAI est configuré avec:

- `baseURL: "https://api.mammouth.ai/v1"`
- modèle `mistral-small-3.2-24b-instruct`

L'API attend l'état courant du document + message utilisateur et renvoie un JSON patch.

Pour l'import PDF V2:

- extraction texte native du PDF
- fallback OCR vision (Mammouth) si le PDF est scanné / pauvre en texte
- fusion des deux pour remplir la nouvelle facture
