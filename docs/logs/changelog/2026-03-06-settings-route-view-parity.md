# 2026-03-06 - Settings Route View Parity Fix

## Summary
Fixed inconsistent "Settings" navigation between profile dropdown and sidebar when an admin switches between requester/contributor/admin views.

## Root Cause
- Sidebar settings target was derived from active view/path (`/admin`, `/contributor`, `/requester`).
- Profile dropdown settings target was derived from `userRole` only.
- For admins in non-admin views, dropdown jumped to `/admin/settings` while sidebar correctly used the current view's settings page.

## Changes
- Added shared route resolver: `lib/navigation/role-view.ts`
  - `resolveViewKey(pathname, userRole)`
  - `resolveSettingsHref(pathname, userRole)`
- Updated:
  - `components/app/nav-user.tsx`
  - `components/app/user-menu.tsx`
  - `components/app/app-sidebar.tsx`
- Added regression tests:
  - `lib/navigation/role-view.test.ts`

## Outcome
- Profile dropdown and sidebar now resolve to the same settings route for the active view.
