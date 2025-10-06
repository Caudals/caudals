# Dataset Platform - Backend Setup Guide

This guide will help you set up the Supabase backend for the dataset platform.

## Prerequisites

- Node.js 18+ installed
- A Supabase account and project created at [supabase.com](https://supabase.com)

## Step 1: Environment Variables

1. Copy the example environment file:

```bash
cp .env.local.example .env.local
```

2. Fill in your Supabase credentials in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

You can find these values in your Supabase project settings under "API".

## Step 2: Database Setup

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Run the migration file: `supabase/migrations/001_initial_schema.sql`
   - Copy and paste the entire contents of the file
   - Click "Run" to execute

This will create:

- All database tables (profiles, dataset_requests, submissions)
- Row Level Security (RLS) policies
- Database functions and triggers
- Indexes for performance

## Step 3: Storage Setup

1. In the Supabase dashboard, go to Storage
2. Run the storage setup SQL: `scripts/setup-storage.sql`
   - This creates the required buckets and policies for file uploads

Alternatively, you can manually create the buckets:

- Create a bucket named `dataset-files` (public)
- Create a bucket named `user-avatars` (public)

## Step 4: Seed the Database

To populate your database with realistic sample data:

1. Install tsx if you haven't:

```bash
npm install -g tsx
```

2. Run the seed script:

```bash
npx tsx scripts/seed-database.ts
```

This will create:

- 5 sample users with different roles
- 15+ dataset requests across various categories
- Random submissions for testing

## Step 5: Run the Application

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Test Accounts

After seeding, you can log in with any of these test accounts:

- alex.johnson@example.com
- sarah.chen@example.com
- michael.patel@example.com
- emma.wilson@example.com
- david.martinez@example.com

**Note:** These are test accounts. The password for seeded accounts needs to be reset via Supabase dashboard or you can create new accounts through the sign-up flow.

## Database Schema Overview

### Tables

1. **profiles**

   - Extends Supabase auth.users
   - Stores user role (contributor/requester/both)
   - Links to all user-created content

2. **dataset_requests**

   - Main dataset listings
   - Contains all request details
   - Automatically updates status based on deadline/completion

3. **submissions**
   - User contributions to datasets
   - Links files to requests
   - Tracks approval status

### Key Features

- **Auto-updating status**: Datasets automatically become "closing-soon" within 7 days of deadline
- **Sample counting**: Approved submissions automatically increment the samples_collected counter
- **Row Level Security**: Users can only modify their own data
- **Triggers**: Automatic timestamp updates and status changes

## Troubleshooting

### Error: "relation does not exist"

- Make sure you've run the migration SQL file in Supabase

### Error: "bucket not found"

- Run the storage setup SQL or manually create the buckets

### Error: "JWT expired" or auth issues

- Check that your environment variables are correct
- Ensure the Supabase URL and keys match your project

### Seed script fails

- Ensure SUPABASE_SERVICE_ROLE_KEY is set in .env.local
- Check that the migration has been run first

## Next Steps

- Create your first dataset request via the dashboard
- Explore the browse page to see all datasets
- Check the analytics and stats in the dashboard
- Customize the platform for your specific use case

## Support

For issues or questions:

- Check the Supabase documentation: https://supabase.com/docs
- Review the Next.js documentation: https://nextjs.org/docs
