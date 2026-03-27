# Blog Runtime Content Hotfix

- **Date:** 2026-03-28
- **Scope:** Production `/blog` 500 recovery

## Delivered
- Fixed the production runtime packaging gap by copying `content/` into the Docker runtime image.
- Hardened the blog content loader so missing blog content no longer crashes the route with a server-side exception.

## Root Cause
- The blog loader reads MDX files from `content/blog` at runtime.
- The Docker runtime image copied `public/` and `.next/` but did not copy `content/`, so `/blog` failed on `fs.readdir(...)` in production.
