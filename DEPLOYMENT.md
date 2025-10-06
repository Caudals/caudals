# Deployment Guide

This guide covers deploying your dataset platform to production.

## Pre-Deployment Checklist

- [ ] Database migrations completed
- [ ] Storage buckets configured
- [ ] Environment variables ready
- [ ] Authentication working locally
- [ ] File uploads tested
- [ ] All features tested locally

## Recommended Platform: Vercel

Vercel is the recommended platform for deploying Next.js applications.

### Step 1: Prepare Your Repository

1. **Initialize Git** (if not already done):

```bash
git init
git add .
git commit -m "Initial commit"
```

2. **Push to GitHub**:

```bash
git remote add origin <your-github-repo-url>
git push -u origin main
```

### Step 2: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. Configure project:
   - **Framework Preset**: Next.js
   - **Root Directory**: ./
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `.next` (default)

### Step 3: Configure Environment Variables

In Vercel project settings, add these environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**Important**: Do NOT add `SUPABASE_SERVICE_ROLE_KEY` to Vercel. It's only needed for local seeding.

### Step 4: Deploy

Click "Deploy" and wait for the build to complete (~2-3 minutes).

Your app will be live at: `https://your-app.vercel.app`

## Alternative: Other Platforms

### Netlify

1. Connect your GitHub repository
2. Build command: `npm run build`
3. Publish directory: `.next`
4. Add environment variables
5. Deploy

### Railway

1. Create new project from GitHub
2. Add environment variables
3. Railway auto-detects Next.js
4. Deploy

### Self-Hosted (VPS)

1. **Requirements**:

   - Node.js 18+
   - PM2 or similar process manager
   - Nginx (optional, for reverse proxy)

2. **Build**:

```bash
npm install
npm run build
```

3. **Start**:

```bash
npm start
```

Or with PM2:

```bash
pm2 start npm --name "dataset-platform" -- start
```

## Production Configuration

### 1. Supabase Configuration

#### Email Templates

Customize auth emails in Supabase dashboard:

- Go to Authentication → Email Templates
- Customize confirmation and password reset emails
- Use your production URL

#### Rate Limiting

Configure rate limits in Supabase:

- Go to Settings → API
- Adjust rate limits for your expected traffic

#### Backups

Supabase Pro includes automatic backups. For free tier:

- Set up manual backup routine
- Export data periodically

### 2. Security Hardening

#### Environment Variables

- Never commit `.env.local` to git
- Use Vercel/platform secrets for sensitive data
- Rotate keys periodically

#### CORS

Configure allowed origins in Supabase:

- Go to Settings → API
- Add your production domain to allowed origins

#### Rate Limiting

Consider adding rate limiting for API routes:

```typescript
// Example using Upstash Rate Limit
import { Ratelimit } from "@upstash/ratelimit";
```

### 3. Performance Optimization

#### Enable Caching

Update `next.config.ts`:

```typescript
const nextConfig = {
  images: {
    domains: ["your-supabase-project.supabase.co"],
  },
  experimental: {
    optimizeCss: true,
  },
};
```

#### Database Indexes

Ensure indexes are created (already in migration):

- dataset_requests(created_by)
- dataset_requests(status)
- dataset_requests(category)
- submissions(dataset_request_id)
- submissions(contributor_id)

### 4. Monitoring & Analytics

#### Vercel Analytics

Enable Vercel Analytics in project settings for:

- Page views
- Performance metrics
- User insights

#### Sentry (Optional)

Add error tracking:

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

#### Supabase Logs

Monitor database activity in Supabase dashboard:

- Go to Logs → Database
- Monitor slow queries
- Watch for errors

## Custom Domain

### Vercel

1. Go to Project Settings → Domains
2. Add your custom domain
3. Configure DNS:

   - Type: A Record
   - Name: @
   - Value: 76.76.21.21 (or Vercel's current IP)

   OR

   - Type: CNAME
   - Name: www
   - Value: cname.vercel-dns.com

4. Wait for DNS propagation (~24 hours max, usually <1 hour)

### SSL Certificate

Vercel automatically provisions SSL certificates via Let's Encrypt.

## Post-Deployment

### 1. Test Everything

- [ ] Sign up flow works
- [ ] Sign in flow works
- [ ] Create dataset request
- [ ] Upload files (contribute)
- [ ] Dashboard shows correct data
- [ ] Browse and filter datasets
- [ ] Email confirmations arrive

### 2. Seed Production Data (Optional)

If you want sample data in production:

1. Temporarily add `SUPABASE_SERVICE_ROLE_KEY` to environment
2. Run seed script from local terminal pointing to production
3. Remove the service role key from production

**Better approach**: Manually create a few real dataset requests.

### 3. Set Up Monitoring

#### Health Checks

Create a health check endpoint:

```typescript
// app/api/health/route.ts
export async function GET() {
  return Response.json({ status: "ok" });
}
```

#### Uptime Monitoring

Use services like:

- UptimeRobot
- Pingdom
- StatusCake

### 4. Configure Backups

#### Database Backups

For Supabase Pro:

- Automatic backups included
- Point-in-time recovery available

For Free tier:

```bash
# Export via Supabase CLI
supabase db dump -f backup.sql
```

#### Storage Backups

- Download important files periodically
- Consider S3 sync for large datasets

## Scaling Considerations

### When to Scale

Monitor these metrics:

- Database connection pool usage
- API response times
- Storage usage
- Monthly active users

### Supabase Scaling

**Free Tier Limits**:

- 500MB database
- 1GB file storage
- 50,000 monthly active users

**Upgrade to Pro** when approaching limits:

- 8GB database
- 100GB file storage
- 100,000 monthly active users

### Next.js Scaling

Vercel scales automatically, but monitor:

- Function execution time
- Edge function usage
- Bandwidth usage

### Database Optimization

If queries slow down:

1. Check missing indexes
2. Use database connection pooling
3. Implement caching (Redis)
4. Consider read replicas (Supabase Pro)

## Troubleshooting

### Build Fails

**Error**: Module not found

- Run `npm install` locally
- Check `package.json` dependencies
- Clear build cache

**Error**: Type errors

- Run `npm run typecheck` locally
- Fix TypeScript errors before deploying

### Runtime Errors

**Error**: "Failed to fetch"

- Check environment variables
- Verify Supabase URL is correct
- Check CORS settings

**Error**: "bucket not found"

- Verify storage buckets are created
- Check bucket names match code

### Performance Issues

**Slow page loads**:

- Enable Next.js caching
- Optimize images
- Use Incremental Static Regeneration

**Slow database queries**:

- Check for missing indexes
- Review RLS policies (can be slow)
- Consider caching frequently accessed data

## Maintenance

### Regular Tasks

**Weekly**:

- Check error logs
- Review performance metrics
- Monitor storage usage

**Monthly**:

- Review and delete old submissions
- Check for Supabase updates
- Review security advisories

**Quarterly**:

- Update dependencies
- Review and optimize database
- Audit user roles and access

### Updates

**Supabase**:

- Updates are automatic
- Check changelog for breaking changes
- Test in staging before production

**Next.js**:

```bash
npm update next react react-dom
npm test
git commit -am "Update Next.js"
git push
```

## Security Checklist

- [ ] RLS policies enabled on all tables
- [ ] Service role key not in production
- [ ] HTTPS enabled (automatic with Vercel)
- [ ] CORS configured correctly
- [ ] Rate limiting implemented
- [ ] Input validation on all forms
- [ ] File upload size limits enforced
- [ ] User authentication required for actions
- [ ] Regular security audits

## Support

If you encounter issues:

1. Check Vercel deployment logs
2. Review Supabase logs
3. Check browser console for errors
4. Review this guide
5. Consult Vercel/Supabase documentation

## Success! 🚀

Your dataset platform is now live and ready for users!

**Next steps**:

- Share with beta testers
- Gather feedback
- Iterate and improve
- Scale as needed

Remember to monitor your app regularly and keep dependencies updated for security and performance.
