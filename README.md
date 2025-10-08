# Collective - AI Dataset Crowdsourcing Platform

A modern, full-stack platform for creating, managing, and contributing to AI dataset collection projects. Built with Next.js 15, Supabase, and TypeScript.

## Features

### For Dataset Requesters

- **Create Dataset Requests**: Multi-step form to define your data collection needs
- **Dashboard Analytics**: Track submissions, contributors, and spending in real-time
- **Request Management**: Pause, resume, or delete dataset requests
- **Submission Review**: Approve or reject contributor submissions
- **Progress Tracking**: Monitor collection progress with visual indicators

### For Contributors

- **Browse Datasets**: Filter and search through active dataset requests
- **Easy Submission**: Upload files directly through an intuitive interface
- **Reward System**: See potential earnings for each contribution
- **Role Flexibility**: Switch between contributor and requester roles

### Platform Features

- **Authentication**: Secure auth with Supabase (email/password + OAuth)
- **File Storage**: Supabase Storage for images, videos, audio, and documents
- **Real-time Updates**: Automatic status updates and progress tracking
- **Responsive Design**: Beautiful UI that works on all devices
- **Type Safety**: Full TypeScript implementation
- **Database Security**: Row Level Security (RLS) policies

## Tech Stack

- **Framework**: Next.js 15 (App Router, React Server Components)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Type Safety**: TypeScript
- **Forms**: React Hook Form + Zod
- **Notifications**: Sonner (Toast)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- A Supabase account

### Installation

1. **Clone the repository**

```bash
git clone <repository-url>
cd datasets
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

```bash
cp .env.local.example .env.local
```

Then fill in your Supabase credentials in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL="Collective <team@yourdomain.com>"
# Required for syncing waitlist signups to Resend contacts
RESEND_GENERAL_AUDIENCE_ID=your_resend_audience_id
# Optional: receive internal notifications when someone joins the waitlist
WAITLIST_NOTIFICATION_EMAIL=team@yourdomain.com
```

4. **Set up the database**

Go to your Supabase project's SQL Editor and run:

- `supabase/migrations/001_initial_schema.sql`
- `scripts/setup-storage.sql`

See [SETUP.md](./SETUP.md) for detailed instructions.

5. **Seed the database (optional)**

```bash
npm install -g tsx
npx tsx scripts/seed-database.ts
```

This creates 5 test users and 15+ sample dataset requests.

6. **Run the development server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Project Structure

```
datasets/
├── app/                      # Next.js App Router
│   ├── auth/                # Authentication pages
│   ├── browse/              # Dataset browsing
│   ├── dashboard/           # Dashboard pages
│   └── page.tsx             # Landing page
├── components/              # React components
│   ├── browse/              # Browse-specific components
│   ├── dashboard/           # Dashboard components
│   ├── landing/             # Landing page components
│   └── ui/                  # Reusable UI components
├── lib/                     # Utilities and actions
│   ├── actions/             # Server actions
│   ├── auth/                # Auth provider
│   ├── data/                # Data utilities
│   ├── storage/             # File upload utilities
│   └── supabase/            # Supabase clients
├── scripts/                 # Setup and seed scripts
├── supabase/                # Database migrations
│   └── migrations/
├── types/                   # TypeScript type definitions
└── public/                  # Static assets
```

## Key Features Implementation

### Database Schema

- **profiles**: Extended user profiles with roles
- **dataset_requests**: Main dataset listings
- **submissions**: User contributions linked to requests
- **Automatic triggers**: Update samples_collected, auto-status changes
- **RLS policies**: Secure data access per user

### Server Actions

All data mutations use Next.js Server Actions for type-safety:

- `dataset-actions.ts`: CRUD for dataset requests
- `submission-actions.ts`: Handle file submissions
- `dashboard-actions.ts`: Fetch analytics and stats
- `profile-actions.ts`: Manage user profiles

### File Uploads

- Drag-and-drop file upload component
- Automatic file validation (size, type)
- Supabase Storage integration
- Support for images, videos, audio, and documents

## Environment Variables

Required variables in `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=        # Your Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Public anon key
SUPABASE_SERVICE_ROLE_KEY=       # Service role key (for seeding)
```

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npx tsx scripts/seed-database.ts` - Seed the database

## Database Migrations

Located in `supabase/migrations/`:

- `001_initial_schema.sql`: Complete database setup with tables, RLS, triggers

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Security

- Row Level Security (RLS) enabled on all tables
- Users can only modify their own data
- File uploads scoped to user folders
- Service role key used only for admin operations

## License

MIT License - feel free to use this project for your own purposes.

## Support

For detailed setup instructions, see [SETUP.md](./SETUP.md)

For issues or questions:

- Supabase docs: https://supabase.com/docs
- Next.js docs: https://nextjs.org/docs

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Database and auth by [Supabase](https://supabase.com/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/)
