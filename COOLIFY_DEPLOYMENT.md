# PhotoPal API - Coolify Deployment Guide

## Prerequisites

- Coolify instance running
- Docker installed on Coolify host
- Environment variables configured

## Deployment Steps

### 1. Build the Docker Image

From the root of your repository:

```bash
docker build -f backend/Dockerfile -t photopal-api:latest ./backend
```

Or let Coolify auto-build by connecting your GitHub repository.

### 2. Environment Configuration

Set these environment variables in Coolify:

**Essential Variables:**

- `PUBLIC_BASE_URL` - Your Coolify domain (e.g., https://api.example.com)
- `CIVIC_CLIENT_ID` - From Civic Auth
- `CIVIC_CLIENT_SECRET` - From Civic Auth
- `GOOGLE_OAUTH_CLIENT_ID` - From Google Cloud Console
- `GOOGLE_OAUTH_CLIENT_SECRET` - From Google Cloud Console

**Service URLs:**

- `CIVIC_REDIRECT_URL` - `https://api.example.com/auth/callback`
- `GOOGLE_OAUTH_REDIRECT_URL` - `https://api.example.com/auth/google/callback`
- `SUPABASE_URL`, `SUPABASE_KEY` - Your Supabase instance
- `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY` - AI service API keys

### 3. Coolify Configuration

In Coolify, create a new application:

1. **General Settings:**
   - Docker Image: `photopal-api:latest`
   - Container Port: `8000`
   - **Set all environment variables** from `.env.example`

2. **Port Mapping:**
   - Internal Port: `8000`
   - Public Port: `443` (via your domain's reverse proxy) or custom port

3. **Resources:**
   - CPU: 1-2 cores
   - Memory: 512MB - 1GB (adjust based on load)
   - Restart Policy: Always

4. **Health Check:**
   - Path: `/health`
   - Interval: 30 seconds
   - Timeout: 10 seconds
   - Start Period: 5 seconds

### 4. Domain Setup

Configure your reverse proxy/domain:

- Domain: `api.example.com` (or your chosen domain)
- Forward to: `http://localhost:8000` (or container service name)
- Enable HTTPS with SSL certificate

### 5. Verify Deployment

Test the health endpoint:

```bash
curl https://api.example.com/health
```

Expected response: `{"status":"ok"}` or similar

## Docker Image Details

The Dockerfile uses:

- **Base Image:** Python 3.11-slim (lightweight)
- **Multi-stage Build:** Optimizes image size by excluding build tools
- **Health Checks:** Built-in Docker health checks for container monitoring
- **Port:** `8000` (standard FastAPI/Uvicorn)

## Troubleshooting

### Container won't start

- Check all environment variables are set
- Check logs: `docker logs <container_id>`
- Verify CIVIC_CLIENT_ID and GOOGLE_OAUTH_CLIENT_ID are valid

### Health check failing

- Ensure the app is actually running: `curl http://localhost:8000/health` inside container
- Check firewall/port access
- Increase health check start period if app takes longer to start

### API endpoints returning 404

- Verify environment variables are loaded correctly
- Check the routers are properly imported in `server.py`
- Ensure PUBLIC_BASE_URL is set correctly

## Performance Optimization

For high traffic:

1. **Scaling:** Configure Coolify to run multiple instances (3-5)
2. **Load Balancing:** Let Coolify's load balancer distribute requests
3. **Database:** Optimize Supabase queries and add connection pooling
4. **Caching:** Add Redis for session/cache management

## Security Checklist

- [ ] All API keys stored as environment variables (never in code)
- [ ] HTTPS enabled on domain
- [ ] CORS configured appropriately
- [ ] Database credentials use service role, not anon key for sensitive operations
- [ ] Rate limiting enabled (can be added to FastAPI app)
- [ ] Regular security updates for dependencies

## Updating the Container

1. Pull latest code from GitHub
2. Rebuild image: `docker build -f backend/Dockerfile -t photopal-api:latest ./backend`
3. Redeploy in Coolify (or use CI/CD automation)

## Monitoring

- Check Coolify dashboard for CPU/Memory usage
- Monitor `/health` endpoint uptime
- Review application logs regularly
- Set up alerts for high resource usage
