# Quick Start Guide

Get your dataset platform up and running in 5 minutes!

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for your project to be ready (this takes ~2 minutes)
3. Copy your project credentials:
   - Go to Project Settings → API
   - Copy the Project URL and anon public key

## Step 3: Configure Environment

1. Create your `.env.local` file:

```bash
cp .env.local.example .env.local
```

2. Edit `.env.local` and add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

The service role key is in the same API settings page (keep it secret!).

## Step 4: Initialize Database

1. In your Supabase dashboard, go to the **SQL Editor**
2. Click "New Query"
3. Copy the contents of `supabase/migrations/001_initial_schema.sql`
4. Paste and click "Run"
5. You should see "Success. No rows returned"

6. Create another new query
7. Copy the contents of `scripts/setup-storage.sql`
8. Paste and click "Run"

## Step 5: Seed Sample Data

Run the seed script to populate your database with sample datasets:

```bash
npm run seed
```

This creates:

- 5 test user accounts
- 15+ realistic dataset requests
- Sample submissions

## Step 6: Run the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Step 7: Create Your First Account

1. Click "Sign Up" in the top right
2. Create an account with your email
3. Check your email for the confirmation link
4. You're ready to go!

## What's Next?

### As a Requester:

1. Go to Dashboard → New Request
2. Fill out the multi-step form
3. Publish your dataset request
4. Monitor submissions in your dashboard

### As a Contributor:

1. Browse available datasets
2. Click "Contribute" on any active request
3. Upload your files
4. Track your submissions

## Common Issues

### "relation does not exist" error

- You need to run the database migration (Step 4)

### "bucket not found" error

- Run the storage setup SQL (Step 4, part 2)

### Seed script fails

- Make sure `SUPABASE_SERVICE_ROLE_KEY` is set in `.env.local`
- Ensure the migration has been run first

### Auth errors

- Double-check your environment variables
- Make sure you're using the correct project URL and keys
- Restart the dev server after changing `.env.local`

## Testing the Platform

After seeding, try these flows:

1. **Browse datasets**: Go to `/browse` and filter by category
2. **Create a request**: Dashboard → New Request → Fill the form
3. **Make a contribution**: Click "Contribute" on any active dataset
4. **View analytics**: Check your dashboard for stats

## Production Deployment

When you're ready to deploy:

1. Push your code to GitHub
2. Deploy to Vercel (or your preferred host)
3. Add environment variables in your hosting dashboard
4. Your app is live!

## Need Help?

- Check [SETUP.md](./SETUP.md) for detailed instructions
- Review [README.md](./README.md) for full documentation
- Supabase docs: https://supabase.com/docs
- Next.js docs: https://nextjs.org/docs

## Success! 🎉

You now have a fully functional dataset crowdsourcing platform!

Try creating your first dataset request or contributing to an existing one.
