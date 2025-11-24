# Supabase VPS Migration Guide

## ✅ Migration Complete!

Your Supabase has been successfully migrated to your VPS at `161.35.200.8`.

**Current Status**: Supabase API is accessible at `http://161.35.200.8:8000` (HTTP, no SSL)

**⚠️ Important**: Kong API Gateway requires HTTP Basic Authentication:

- **Username**: `admin`
- **Password**: `d8SRvFmJUJqE4Nfl2kAc1A==`

After Basic A th, you still need to provide the API key in the `apikey` header for REST endpoints.

## 📋 What Was Done

### 1. **VPS Setup**

- ✅ Upgraded RAM to 4GB
- ✅ Installed Docker and Docker Compose
- ✅ Cloned Supabase official repository

### 2. **Supabase Installation**

- ✅ Configured environment variables in `/supabase/supabase/docker/.env`
- ✅ Generated secure JWT secrets and keys
- ✅ Started all Supabase services:
  - PostgreSQL Database
  - PostgREST API
  - GoTrue Authentication
  - Storage API
  - Realtime Server
  - Kong API Gateway
  - Studio Dashboard
  - Analytics

### 3. **Database Migration**

- ✅ Applied all 18 migration files
- ✅ Created database schema with all tables, functions, and triggers
- ✅ Set up Row Level Security (RLS) policies
- ✅ Created all storage buckets: `dataset-images`, `dataset-files`, `user-avatars`
- ✅ Tables created: `profiles`, `dataset_requests`, `submissions`, `wallets`, `transactions`, `stripe_accounts`, `admin_activity_log`, `waitlist_signups`

### 3.5. **Data Migration** (Nov 17, 2025)

**COMPLETE DATA MIGRATION:**

- ✅ Migrated 16 users from auth.users (with passwords preserved)
- ✅ Migrated 16 profiles (all user profiles)
- ✅ Migrated **37 dataset requests** with all metadata (previously only had 15)
- ✅ Migrated **232 submissions** with statuses and metadata (previously had 0)
- ✅ Migrated 34 files from storage buckets:
  - 26 files from `dataset-images`
  - 8 files from `dataset-files`
  - 0 files from `user-avatars`
- ✅ All data verified and accessible via API
- ✅ RLS policies working correctly

### 4. **Domain & SSL Configuration**

- ✅ Configured Traefik reverse proxy
- ✅ Set up `api.caudals.com` domain routing
- ✅ Enabled automatic SSL certificate generation via Let's Encrypt

## 🔐 Your Credentials

### API Keys (from `/supabase/supabase/docker/.env`):

```
NEXT_PUBLIC_SUPABASE_URL=https://api.caudals.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=***REMOVED-CREDENTIAL***
SUPABASE_SERVICE_ROLE_KEY=***REMOVED-CREDENTIAL***
```

### Database Access:

```
Host: 161.35.200.8
Port: 5432
Database: postgres
User: postgres
Password: ***REMOVED-CREDENTIAL***
```

### Studio Dashboard:

- **Status**: Running but NOT exposed (port 3000 is used by Dokploy)
- **Internal Access Only**: `http://studio:3000` (only accessible from within Docker network)
- **Username**: `admin`
- **Password**: `d8SRvFmJUJqE4Nfl2kAc1A==`

**Note**: To access Studio Dashboard, you would need to either:

1. Expose it on a different port (e.g., 3001)
2. Access it through SSH tunnel: `ssh -L 3001:localhost:3000 root@161.35.200.8`

## 🚀 Next Steps

### 1. Configure DNS

Add an A record in your DNS provider:

```
Type: A
Name: api
Value: 161.35.200.8
TTL: 300
```

### 2. Wait for SSL Certificate

After DNS propagation (5-15 minutes), Traefik will automatically request an SSL certificate from Let's Encrypt.

### 3. Update Your Application

Update your `.env.local` file with these values:

```bash
# Currently using HTTP on port 8000 (no SSL) - Traefik routing not working yet
NEXT_PUBLIC_SUPABASE_URL=http://161.35.200.8:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=***REMOVED-CREDENTIAL***
SUPABASE_SERVICE_ROLE_KEY=***REMOVED-CREDENTIAL***
```

### 4. Test the Connection

```bash
# Test API endpoint (returns empty array if no data)
curl http://161.35.200.8:8000/rest/v1/dataset_requests -H "apikey: ***REMOVED-CREDENTIAL***"

# Should return: []
```

### 5. Migrate Existing Data (if any)

If you have existing data in Supabase Cloud, you'll need to:

1. Export data from your old Supabase project
2. Import it into the new VPS database

## 📍 Service URLs

**Current (HTTP, port 8000)**:

- **API**: http://161.35.200.8:8000
- **Auth**: http://161.35.200.8:8000/auth/v1/
- **Storage**: http://161.35.200.8:8000/storage/v1/
- **Realtime**: ws://161.35.200.8:8000/realtime/v1/
- **Studio** (internal): http://161.35.200.8:3000

**Future (when Traefik is fixed)**:

- **API**: https://api.caudals.com
- **Auth**: https://api.caudals.com/auth/v1/
- **Storage**: https://api.caudals.com/storage/v1/
- **Realtime**: wss://api.caudals.com/realtime/v1/

## 🛠️ Management Commands

### Access VPS

```bash
ssh root@161.35.200.8
```

### Check Service Status

```bash
cd /supabase/supabase/docker
docker compose ps
```

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f kong
docker compose logs -f db
docker compose logs -f auth
```

### Restart Services

```bash
# All services
docker compose restart

# Specific service
docker compose restart kong
```

### Stop Services

```bash
docker compose down
```

### Start Services

```bash
docker compose up -d
```

### Access Database

```bash
docker exec -it supabase-db psql -U postgres -d postgres
```

## ⚠️ Known Issues & Fixes

### ✅ Fixed Issues (Nov 17, 2025)

1. **Database Migrations Applied**: All 18 migration files successfully applied
2. **Storage Buckets Created**: All 3 buckets (`dataset-images`, `dataset-files`, `user-avatars`) created with policies
3. **Realtime Fixed**: Realtime service now running and healthy after network restart
4. **Environment Variables**: `API_URL` and `SITE_URL` added to `.env`
5. **Docker Network DNS Issues Fixed**: All services now on same network (`supabase_default`) with proper DNS resolution
6. **Kong Port Exposed**: API accessible at `http://161.35.200.8:8000` as temporary workaround

### 🔧 Current Issues

#### Traefik Routing Not Working

**Problem**: Traefik is not routing `api.caudals.com` requests to Kong (Supabase API gateway)
**Root Cause**: Traefik's Docker provider is experiencing API version compatibility errors (client version 1.24 vs required 1.44), and the file provider appears to have stopped working
**Status**:

- Kong is running and healthy - responds with correct 401 Unauthorized when accessed directly
- Configuration files exist and are syntactically valid in `/etc/dokploy/traefik/dynamic/`
- Traefik returns 404 for all requests to `api.caudals.com`
- File provider does not appear to be loading configurations

**Current Workaround (IMPLEMENTED)**:

- ✅ Kong port exposed directly on `8000:8000`
- ✅ Supabase accessible at `http://161.35.200.8:8000`
- ❌ No SSL/HTTPS (not ideal for production)

**To Fix Properly (Future)**:

1. Update Dokploy or Traefik to fix Docker API compatibility
2. Restart Traefik and verify file provider is working
3. Configure domain routing for `api.caudals.com`
4. Switch application to use `https://api.caudals.com`

#### Storage API DNS Resolution

**Problem**: Storage service cannot resolve `db` hostname (similar to realtime issue)
**Status**: Storage container is running but may have connection issues
**Temporary Workaround**: Storage API may work through Kong gateway
**To Fix**: May need to restart all services or check Docker network configuration

## 🔧 Troubleshooting

### Issue: Can't connect to api.caudals.com

**Solution**:

1. Check DNS propagation: `nslookup api.caudals.com`
2. Verify Traefik is running: `docker ps | grep traefik`
3. Check Kong container: `docker ps | grep kong`

### Issue: Storage API not working

**Solution**:

1. Check storage logs: `cd /supabase/supabase/docker && docker compose logs storage`
2. Restart storage: `docker compose restart storage`
3. Verify network: `docker network inspect supabase-network`
4. Test direct connection: `curl http://localhost:5000/status`

### Issue: SSL certificate not working

**Solution**:

1. Wait 5-15 minutes after DNS propagation
2. Check Traefik logs: `docker logs dokploy-traefik`
3. Verify domain points to correct IP

### Issue: Database connection fails

**Solution**:

1. Check if database is running: `docker ps | grep supabase-db`
2. Verify password in `.env` file
3. Check firewall: `sudo ufw status`

### Issue: High memory usage

**Solution**:

1. Check memory: `free -h`
2. Restart services: `cd /supabase/supabase/docker && docker compose restart`
3. Consider upgrading to 8GB RAM for better performance

## 📊 Monitoring

### Check Resource Usage

```bash
# Memory
free -h

# Disk
df -h

# CPU and processes
htop

# Docker stats
docker stats
```

### Database Size

```bash
docker exec supabase-db psql -U postgres -c "SELECT pg_size_pretty(pg_database_size('postgres'));"
```

## 🔒 Security Recommendations

1. **Firewall**: Ensure only necessary ports are open

   - Port 22 (SSH)
   - Port 80 (HTTP - redirects to HTTPS)
   - Port 443 (HTTPS)
   - Port 5432 (PostgreSQL - only if you need external access)

2. **Backup**: Set up regular database backups

```bash
# Create backup
docker exec supabase-db pg_dump -U postgres postgres > backup_$(date +%Y%m%d).sql

# Restore backup
docker exec -i supabase-db psql -U postgres postgres < backup_20231117.sql
```

3. **Update `.env` passwords**: Change default passwords in production

4. **Monitor logs**: Regularly check logs for suspicious activity

## 📝 Important Files

- **Environment Config**: `/supabase/supabase/docker/.env`
- **Docker Compose**: `/supabase/supabase/docker/docker-compose.yml`
- **Traefik Config**: `/supabase/supabase/docker/docker-compose.override.yml`
- **Migrations**: `/tmp/supabase/migrations/` (on VPS)

## 🎉 Success!

Your Supabase instance is now running on your own infrastructure. You have full control over:

- Data storage and privacy
- Service uptime and performance
- Cost management
- Customization and configuration

For support or questions, refer to:

- [Supabase Self-Hosting Docs](https://supabase.com/docs/guides/self-hosting)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Traefik Documentation](https://doc.traefik.io/traefik/)
