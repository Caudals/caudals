# Caudals App Shell Redesign Plan

## Executive Summary

This plan outlines the complete redesign of the Caudals app shell (layout, navigation, and structure) for the authenticated application area (app.caudals.com). The goal is to create a **production-ready, professional, and polished** app shell that serves as the foundation for three distinct role-based views: **Contributor**, **Requester**, and **Admin**.

---

## 1. Current State Analysis

### Existing Implementation

**Current Layout Structure:**
- Basic `SidebarProvider` + `AppSidebar` + `SidebarInset` pattern
- Collapsible icon sidebar (`collapsible="icon"`)
- Role-based navigation switching (admin/requester/contributor)
- Simple role switcher for admins
- Basic NavUser component in footer

**Pain Points:**
1. **Generic Dashboard Feel** - Current implementation uses basic shadcn/ui patterns without customization
2. **Limited Visual Hierarchy** - No clear separation between different app sections
3. **Minimal Branding** - Logo is small, no brand presence in the app
4. **Basic Header** - No topbar/breadcrumb navigation
5. **Limited Context** - Users don't have quick access to key information (wallet balance, notifications, etc.)
6. **No Quick Actions** - Missing command palette, search, or quick action buttons
7. **Mobile Experience** - While responsive, could be more tailored for mobile workflows

### What Works Well

1. **Role-based Navigation Logic** - Solid foundation for switching between views
2. **Sidebar Component** - Using modern shadcn/ui sidebar with proper state management
3. **Internationalization** - Already integrated with translation system
4. **Icon Collapse** - Space-efficient collapsed state

---

## 2. Design Vision

### Overall Design Philosophy

The new app shell should feel like a **modern SaaS platform** comparable to:
- Linear (clean, fast, minimal)
- Stripe Dashboard (professional, data-dense when needed)
- Vercel Dashboard (elegant, brand-forward)
- Notion (versatile, organized)

### Key Design Principles

1. **Professional & Polished** - Production-ready, not prototype
2. **Role-Appropriate** - Design adapts to user needs per role
3. **Information-Dense** - Surface important data without clutter
4. **Quick Access** - Minimize clicks to common actions
5. **Brand-Forward** - Caudals identity throughout
6. **Performant** - Fast loading, smooth transitions
7. **Accessible** - Keyboard shortcuts, ARIA labels, screen reader support
8. **Responsive** - Mobile-first approach with desktop enhancements

---

## 3. App Shell Architecture

### Component Hierarchy

```
app/(app)/layout.tsx (New Root Layout)
├── AppShellProvider (New - App-level context)
│   ├── NotificationProvider
│   ├── WalletProvider
│   └── OnboardingProvider
│
└── SidebarProvider
    ├── AppSidebar (Enhanced)
    │   ├── SidebarHeader
    │   │   ├── BrandLogo (Enhanced)
    │   │   ├── RoleSwitcher (Enhanced - Admin only)
    │   │   └── WorkspaceBadge (New - Non-admin)
    │   │
    │   ├── SidebarContent
    │   │   ├── QuickActions (New)
    │   │   ├── PrimaryNavigation
    │   │   │   ├── NavGroup (with submenus)
    │   │   │   └── CollapsibleSections
    │   │   └── SecondaryNavigation (New)
    │   │
    │   └── SidebarFooter
    │       ├── WalletWidget (New - Requesters/Contributors)
    │       ├── NotificationBell (New)
    │       └── NavUser (Enhanced)
    │
    └── SidebarInset
        ├── AppHeader (New - Top Navigation Bar)
        │   ├── SidebarTrigger
        │   ├── Breadcrumbs (Dynamic)
        │   ├── GlobalSearch (New)
        │   ├── NotificationCenter (New)
        │   └── UserMenu (Enhanced)
        │
        └── MainContent
            ├── PageHeader (New - Standardized)
            │   ├── Title & Description
            │   ├── Actions (Primary CTAs)
            │   └── Tabs/Filters (Context-specific)
            │
            └── PageBody (children)
```

---

## 4. Detailed Component Design

### 4.1 Enhanced Sidebar

#### SidebarHeader

**Brand Logo Section:**
- **Larger Logo** - 32px (up from 20px) for better brand presence
- **App Name** - "Caudals" with role badge inline
- **Collapsed State** - Show just logo with tooltip
- **Link to Home** - Click logo to go to dashboard home

**Role Switcher (Admin Only):**
- **Visual Upgrade** - Dropdown menu instead of button group
- **Icons per Role** - Shield (Admin), Package (Requester), User (Contributor)
- **Current Context** - Show current view prominently
- **Quick Switch** - Keyboard shortcut (Cmd/Ctrl + K → Role)
- **Role Indicators** - Badge with role color

**Workspace Badge (Non-Admin):**
- **Account Type** - Show "Contributor Account" or "Requester Account"
- **Subtle Design** - Muted colors, non-prominent
- **Info Tooltip** - Explain role capabilities on hover

#### SidebarContent

**Quick Actions Section (New):**
Located at top of sidebar for immediate access:

- **Requester Quick Actions:**
  - "New Request" (primary button)
  - "Upload Dataset" (if needed)
  - "Quick Search" (⌘K)

- **Contributor Quick Actions:**
  - "Browse Datasets" (primary button)
  - "Upload Contribution" (quick upload)
  - "Quick Search" (⌘K)

- **Admin Quick Actions:**
  - "Pending Reviews" (with count badge)
  - "Create Featured Ad"
  - "Quick Search" (⌘K)

**Primary Navigation:**

Enhanced navigation with:
- **Active States** - Clear visual indicator (accent border + background)
- **Icon Consistency** - All icons from lucide-react
- **Badge Indicators** - Show counts (pending items, new notifications)
- **Collapsible Groups** - Organize related items
- **Keyboard Shortcuts** - Display shortcuts in tooltips

**Navigation Structure by Role:**

**Requester Navigation:**
```
Dashboard (Overview)
├── Overview (home icon)
│
My Requests (group)
├── All Requests (list icon)
├── Active Requests (checkbox icon)
├── Completed Requests (check-circle icon)
└── Create New (plus icon) [CTA style]

Contributors (group)
├── All Contributors (users icon)
├── Top Performers (star icon)

Analytics & Insights (group)
├── Analytics Dashboard (bar-chart icon)
├── Performance Reports (trending-up icon)

Account (group)
├── Billing & Wallet (credit-card icon)
├── Settings (settings icon)
```

**Contributor Navigation:**
```
Dashboard (Overview)
├── Overview (home icon)
│
Datasets (group)
├── Browse All (database icon)
├── Recommended (sparkles icon)
├── Saved (bookmark icon)

My Activity (group)
├── My Contributions (file-up icon)
├── In Progress (clock icon)
├── Upload New (plus icon) [CTA style]

Earnings (group)
├── Earnings Overview (dollar-sign icon)
├── Payouts (wallet icon)
├── Transaction History (receipt icon)

Account (group)
├── Settings (settings icon)
├── Payout Methods (credit-card icon)
```

**Admin Navigation:**
```
Admin Console (home icon)
│
Moderation (group)
├── Pending Requests (file-text icon) [with badge]
├── Pending Submissions (file-up icon) [with badge]
├── Flagged Content (flag icon) [with badge]

Management (group)
├── All Datasets (database icon)
├── All Users (users icon)
├── Featured Ads (megaphone icon)

Financial (group)
├── Payment Overview (credit-card icon)
├── Payouts & Commissions (wallet icon)
├── Generate Invoices (receipt icon)

Analytics (group)
├── User Analytics (users-2 icon)
├── Dataset Analytics (bar-chart icon)
├── Revenue Analytics (trending-up icon)
├── Platform Health (activity icon)

System (group)
├── Settings (settings icon)
├── Email Templates (mail icon)
├── API & Webhooks (webhook icon)
```

**Secondary Navigation (Bottom of Content):**
- **Help & Support** (question-mark-circle icon)
- **Documentation** (book-open icon)
- **Changelog** (megaphone icon)
- **Keyboard Shortcuts** (⌘ icon)

#### SidebarFooter

**Wallet Widget (New - Requesters & Contributors):**
- **Available Balance** - Show current balance
- **Pending Balance** - Show pending (if any)
- **Currency** - USD/EUR (based on account)
- **Quick Actions** - "Add Funds" or "Request Payout" button
- **Compact in Collapsed** - Show just amount with tooltip
- **Click to Expand** - Opens billing/earnings page

**Notification Bell (New):**
- **Badge Count** - Unread notification count
- **Popover Preview** - Last 3 notifications on click
- **Mark as Read** - Quick action
- **View All** - Link to notification center

**NavUser (Enhanced):**
- **User Avatar** - Profile picture (from Supabase)
- **User Name** - Full name
- **User Email** - Muted, smaller
- **Dropdown Menu:**
  - Profile
  - Settings
  - Billing (if requester)
  - Support
  - Keyboard Shortcuts
  - Documentation
  - Sign Out
- **Collapsed State** - Just avatar with dropdown
- **Status Indicator** - Online/away dot (future: presence)

### 4.2 App Header (New Top Bar)

**Purpose:** Provide contextual navigation and actions for the current page

**Components:**

1. **SidebarTrigger (Left)**
   - Hamburger menu icon
   - Mobile: Opens sidebar sheet
   - Desktop: Collapses sidebar to icon mode
   - Keyboard shortcut hint (⌘B)

2. **Breadcrumbs (Dynamic)**
   - Show current location hierarchy
   - Clickable navigation up the tree
   - Auto-generated from route
   - Max 3 levels, then ellipsis
   - Examples:
     - Dashboard / Requests / Request #123
     - Admin / Datasets / Computer Vision
     - Dashboard / Settings / Billing

3. **Global Search (Center/Right) (New)**
   - **Command Palette** - ⌘K to open
   - **Search Everything:**
     - Datasets by name/category
     - Requests by title
     - Contributors by name
     - Navigation (jump to any page)
     - Actions (create request, upload, etc.)
   - **Recent Items** - Show recently viewed
   - **Keyboard Navigation** - Arrow keys + Enter
   - **Grouped Results** - By type (Datasets, Requests, etc.)
   - **Icon:** Search icon (magnifying glass)
   - **Placeholder:** "Search or jump to... (⌘K)"

4. **Notification Center (Right)**
   - Bell icon with badge
   - Click to open popover
   - Show last 5 notifications
   - Mark all as read
   - Link to full notification page
   - Real-time updates (future: websockets)

5. **User Menu (Far Right)**
   - Avatar + Name (desktop) or just Avatar (mobile)
   - Dropdown with quick actions
   - Theme toggle (light/dark)
   - Language selector (EN/ES)
   - Sign out

**Design:**
- **Height:** 64px (h-16)
- **Sticky:** Top position (sticky top-0)
- **Background:** bg-background with border-b
- **Padding:** px-4 md:px-6
- **Z-index:** Above content, below modals

**Responsive Behavior:**
- **Mobile:** Hide breadcrumbs, show only trigger + search icon + avatar
- **Tablet:** Show breadcrumbs (2 levels max) + all actions
- **Desktop:** Full breadcrumbs (3 levels) + expanded search bar

### 4.3 Page Header Component (New Standardized Pattern)

**Purpose:** Consistent header pattern for all pages

**Structure:**
```tsx
<PageHeader>
  <PageHeaderContent>
    <PageHeaderTitle>Page Title</PageHeaderTitle>
    <PageHeaderDescription>Optional description</PageHeaderDescription>
  </PageHeaderContent>
  <PageHeaderActions>
    <Button>Primary Action</Button>
    <Button variant="outline">Secondary</Button>
  </PageHeaderActions>
</PageHeader>

{/* Optional: Tabs or Filters */}
<PageHeaderTabs>
  <Tabs>...</Tabs>
</PageHeaderTabs>
```

**Features:**
- **Consistent Spacing** - Same padding/margins across pages
- **Flexible Actions** - Support multiple buttons, dropdowns
- **Responsive** - Stack on mobile, inline on desktop
- **Optional Subtitle** - Muted text for context
- **Tab Integration** - Seamless tabs below header

**Examples:**

*Requester Requests Page:*
```
Title: My Dataset Requests
Description: Create and manage your dataset collection requests
Actions: [+ New Request] [Filter ▾]
Tabs: All | Active | Completed | Draft
```

*Admin Datasets Page:*
```
Title: Dataset Management
Description: Review and manage all datasets on the platform
Actions: [Export Data] [Bulk Actions ▾]
Filters: Category | Status | Date Range
```

---

## 5. Role-Based Customization

### Color Theming per Role

While maintaining the core Caudals brand (#0b0c11 black, #7ac8b5 teal), add subtle role indicators:

**Requester:**
- **Accent Color:** Teal (#7ac8b5) - existing brand color
- **Sidebar Accent:** Subtle teal border on active items
- **Quick Action Button:** Primary with teal accent

**Contributor:**
- **Accent Color:** Blue (#60a5fa) - represents data collection
- **Sidebar Accent:** Blue border on active items
- **Quick Action Button:** Primary with blue accent

**Admin:**
- **Accent Color:** Purple (#a855f7) - represents authority
- **Sidebar Accent:** Purple border on active items
- **Dashboard Cards:** Purple accent on key metrics

**Implementation:**
- CSS variables per role: `--role-accent`
- Apply via data attribute: `data-role="requester"`
- Scoped to specific components (sidebar, buttons, badges)

### Content Differences

**Sidebar Footer:**
- **Requester:** Wallet widget (available balance)
- **Contributor:** Earnings widget (total earned)
- **Admin:** System health indicator (API status, pending count)

**Quick Actions:**
- **Requester:** "New Request" + "Upload Dataset"
- **Contributor:** "Browse Datasets" + "Upload Contribution"
- **Admin:** "Pending Reviews" + "Create Ad"

**Page Headers:**
- **Requester:** Budget-focused metrics (total spent, avg reward)
- **Contributor:** Earnings-focused metrics (total earned, pending)
- **Admin:** Platform-wide metrics (total users, datasets, transactions)

---

## 6. New Features & Components

### 6.1 Command Palette (Global Search)

**Technology:**
- Use `cmdk` library (already used by shadcn/ui)
- Keyboard shortcut: ⌘K (Mac) / Ctrl+K (Windows)
- Dialog overlay with fuzzy search

**Features:**
- **Search Datasets** - By name, category, tags
- **Search Requests** - By title, status
- **Search Users** - By name, email (admin only)
- **Navigation** - Jump to any page
- **Actions** - Trigger common actions
- **Recent** - Show recently viewed items
- **Grouped Results** - Organized by type
- **Keyboard Nav** - Full keyboard support

**Implementation:**
- Component: `components/app/command-palette.tsx`
- Hook: `use-command-palette.ts` (for programmatic opening)
- Search function: Server action with full-text search
- Cache: Recent items in localStorage

### 6.2 Notification System

**Components:**
- **NotificationBell** - Header + sidebar footer
- **NotificationPopover** - Quick preview (last 5)
- **NotificationCenter** - Full page (/notifications)

**Notification Types:**
- **Requester:**
  - New submission received
  - Dataset request approved/rejected (admin)
  - Payment processed
  - Milestone reached (50% collected, etc.)

- **Contributor:**
  - Submission approved/rejected
  - Payout processed
  - New dataset matching interests
  - Featured opportunity

- **Admin:**
  - New dataset request pending
  - New submission pending
  - Payment issue
  - System alert

**Features:**
- Real-time badge count
- Mark as read/unread
- Grouped by date
- Action buttons (view request, etc.)
- Preferences (email, push, in-app)

**Database Schema (New Table):**
```sql
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id),
  type text not null, -- submission_approved, request_pending, etc.
  title text not null,
  message text,
  link text, -- internal link to relevant page
  read boolean default false,
  created_at timestamptz default now()
);
```

### 6.3 Wallet Widget

**Display:**
- Available balance (large, prominent)
- Pending balance (smaller, muted)
- Currency icon/symbol
- Trend indicator (up/down from last week)

**Actions:**
- **Requester:** "Add Funds" button → payment flow
- **Contributor:** "Request Payout" button → payout flow
- **Click Entire Widget:** Navigate to billing/earnings page

**States:**
- **Low Balance (Requester):** Warning color if < $100
- **Pending Payout (Contributor):** Info badge if pending > $50
- **Collapsed:** Show just balance with currency symbol

### 6.4 Onboarding & Walkthrough

**Trigger:** First-time user detection (flag in profiles table)

**Contributor Onboarding:**
1. Welcome screen - "Welcome to Caudals"
2. Browse datasets - Tour the browse page
3. Submit data - Explain submission process
4. Earn rewards - Show earnings page
5. Get paid - Explain payout setup

**Requester Onboarding:**
1. Welcome screen - "Create Your First Dataset Request"
2. Create request - Tour the creation form
3. Review submissions - Explain approval process
4. Fund request - Show payment options
5. Download data - Explain export feature

**Admin Onboarding:**
1. Welcome screen - "Admin Console Overview"
2. Pending reviews - Explain moderation queue
3. Analytics - Tour dashboards
4. User management - Explain user tools
5. Platform settings - Show configuration

**Implementation:**
- Library: react-joyride or custom with Radix Popover
- Component: `components/app/onboarding-tour.tsx`
- State: `onboarding_completed` flag in profiles
- Dismissible: Can skip or restart from settings

### 6.5 Breadcrumb Navigation

**Auto-Generation:**
- Parse current pathname
- Map to human-readable labels
- Support dynamic segments ([id])
- Fetch titles for dynamic routes (e.g., request name)

**Examples:**
- `/dashboard/requests/[id]` → "Dashboard / Requests / Machine Learning Dataset #123"
- `/admin/datasets` → "Admin / Datasets"
- `/dashboard/analytics` → "Dashboard / Analytics"

**Features:**
- Clickable links (except last item)
- Separator: `/` or `>` icon
- Max 3 levels (collapse middle with `...`)
- Responsive: Hide on mobile, show on desktop

**Implementation:**
- Component: `components/app/breadcrumbs.tsx`
- Hook: `use-breadcrumbs.ts` (generates from pathname)
- Map: Route definitions with labels

### 6.6 Enhanced User Menu

**Location:** App header (top-right) and sidebar footer

**Menu Items:**
1. **Profile Section:**
   - Avatar
   - Name
   - Email
   - Role badge

2. **Navigation:**
   - View Profile
   - Settings
   - Billing (requesters) / Earnings (contributors)

3. **Utilities:**
   - Notifications
   - Keyboard Shortcuts (opens modal)
   - Documentation (external)
   - Support / Help Center

4. **Preferences:**
   - Theme Toggle (Light/Dark)
   - Language Selector (EN/ES)

5. **Account:**
   - Sign Out

**Features:**
- Keyboard navigation
- Icons for all items
- Dividers between sections
- Status indicator (online/offline)

---

## 7. Responsive Design Strategy

### Breakpoints

Following Tailwind defaults:
- **sm:** 640px (tablet portrait)
- **md:** 768px (tablet landscape)
- **lg:** 1024px (desktop)
- **xl:** 1280px (large desktop)
- **2xl:** 1536px (extra large)

### Mobile (< 768px)

**Sidebar:**
- Default: Hidden (offcanvas)
- Trigger: Hamburger menu in header
- Sheet modal overlay
- Full-width menu
- Swipe to close (future)

**Header:**
- Simplified: Trigger + Search icon + Avatar
- No breadcrumbs
- No notification bell (in user menu instead)

**Page Header:**
- Title only (no description on small screens)
- Actions in dropdown menu

**Navigation:**
- Bottom tab bar (future addition)
- Fixed navigation for key pages

### Tablet (768px - 1024px)

**Sidebar:**
- Collapsible icon mode by default
- Expand on hover (desktop-like)
- Or full sidebar (user preference)

**Header:**
- Show breadcrumbs (max 2 levels)
- Show all icons
- Compact search bar

### Desktop (> 1024px)

**Sidebar:**
- Full sidebar by default
- Icon collapse option
- Persistent state (cookie)

**Header:**
- Full breadcrumbs (3 levels)
- Expanded search bar with placeholder
- All actions visible

---

## 8. Accessibility Considerations

### Keyboard Navigation

**Shortcuts:**
- `⌘K` / `Ctrl+K` - Open command palette
- `⌘B` / `Ctrl+B` - Toggle sidebar
- `⌘/` / `Ctrl+/` - Open keyboard shortcuts modal
- `Esc` - Close modals/dialogs
- `Tab` - Navigate focusable elements
- `Arrow keys` - Navigate menus/lists
- `Enter` - Activate focused element
- `Space` - Toggle checkboxes/switches

**Shortcuts Modal:**
- Component showing all available shortcuts
- Searchable/filterable
- Grouped by section (Navigation, Actions, etc.)
- Accessible via `⌘/` or help menu

### ARIA Labels

- All interactive elements have labels
- Icon buttons have `aria-label`
- Navigation has `aria-current="page"`
- Expandable menus have `aria-expanded`
- Notifications have `aria-live="polite"`

### Screen Reader Support

- Semantic HTML (nav, main, aside, header)
- Skip to content link
- Descriptive link text
- Form labels and error messages
- Status announcements

### Focus Management

- Visible focus indicators (ring-2)
- Focus trap in modals
- Return focus after modal close
- Logical tab order

### Color Contrast

- All text meets WCAG AA (4.5:1)
- Interactive elements: AAA (7:1)
- Test with both light and dark modes
- Don't rely on color alone (use icons + text)

---

## 9. Performance Optimizations

### Code Splitting

- Lazy load heavy components (charts, tables)
- Dynamic imports for modals
- Route-based splitting (Next.js automatic)

### Caching Strategy

- Server components for static data
- SWR/React Query for client fetching (if needed)
- Supabase real-time for live data
- localStorage for user preferences

### Image Optimization

- Next.js Image component
- Responsive images (srcset)
- Lazy loading below fold
- WebP format with fallback

### Bundle Size

- Tree-shake unused components
- Use individual lucide-react icon imports
- Minimize client-side JavaScript
- Analyze with `@next/bundle-analyzer`

---

## 10. Implementation Phases

### Phase 1: Foundation (This Plan) ✅ Current

**Tasks:**
1. ✅ Analyze existing codebase
2. ✅ Research shadcn/ui best practices
3. ✅ Design app shell architecture
4. 🔄 Write comprehensive plan (this document)

**Deliverable:** Complete design plan approved by user

---

### Phase 2: Core App Shell (Next)

**Tasks:**
1. Create new app layout structure
2. Build enhanced sidebar component
3. Implement app header with breadcrumbs
4. Add role-based navigation logic
5. Create page header component
6. Set up responsive breakpoints
7. Add keyboard shortcuts (basic)

**Components to Build:**
- `app/(app)/layout.tsx` (new structure)
- `components/app/app-sidebar.tsx` (enhanced)
- `components/app/app-header.tsx` (new)
- `components/app/page-header.tsx` (new)
- `components/app/breadcrumbs.tsx` (new)
- `lib/navigation/routes.ts` (route definitions)
- `lib/navigation/use-breadcrumbs.ts` (hook)

**Deliverable:** Functional app shell with navigation

---

### Phase 3: Advanced Features

**Tasks:**
1. Implement command palette (⌘K search)
2. Build notification system (bell + center)
3. Create wallet widget (sidebar footer)
4. Add enhanced user menu
5. Build keyboard shortcuts modal
6. Add onboarding tour system

**Components to Build:**
- `components/app/command-palette.tsx`
- `components/app/notification-bell.tsx`
- `components/app/notification-center.tsx`
- `components/app/wallet-widget.tsx`
- `components/app/user-menu.tsx`
- `components/app/keyboard-shortcuts-modal.tsx`
- `components/app/onboarding-tour.tsx`

**Database Changes:**
- Create notifications table
- Add onboarding_completed flag to profiles

**Deliverable:** Feature-rich app shell

---

### Phase 4: Polish & Accessibility

**Tasks:**
1. Add all keyboard shortcuts
2. Implement full ARIA labels
3. Test screen reader support
4. Optimize focus management
5. Add skip to content links
6. Test color contrast (light + dark)
7. Performance audit and optimization

**Deliverable:** Accessible, performant app shell

---

### Phase 5: Internationalization

**Tasks:**
1. Extract all new text strings
2. Add English translations to source
3. Add Spanish translations to es.json
4. Test language switching
5. Verify RTL support (future: Arabic)

**Files to Update:**
- `lib/i18n/es.json` (add ~100-150 new strings)
- All new components (use `t()` function)

**Deliverable:** Fully bilingual app shell

---

### Phase 6: Testing & Documentation

**Tasks:**
1. Write unit tests (Vitest)
2. Write E2E tests (Playwright)
3. Manual testing across devices
4. Document component API
5. Create usage examples
6. Update README

**Deliverable:** Tested, documented app shell

---

## 11. Technical Specifications

### File Structure

```
app/
├── (app)/
│   ├── layout.tsx                    # ← MODIFY: New app shell layout
│   ├── dashboard/
│   ├── admin/
│   └── ...
│
components/
├── app/                              # ← NEW: App shell components
│   ├── app-sidebar.tsx               # ← NEW: Enhanced sidebar
│   ├── app-header.tsx                # ← NEW: Top navigation bar
│   ├── breadcrumbs.tsx               # ← NEW: Dynamic breadcrumbs
│   ├── command-palette.tsx           # ← NEW: ⌘K search
│   ├── notification-bell.tsx         # ← NEW: Notification widget
│   ├── notification-center.tsx       # ← NEW: Full notification page
│   ├── notification-popover.tsx      # ← NEW: Quick preview
│   ├── wallet-widget.tsx             # ← NEW: Balance display
│   ├── user-menu.tsx                 # ← NEW: Enhanced user menu
│   ├── page-header.tsx               # ← NEW: Standardized page header
│   ├── keyboard-shortcuts-modal.tsx  # ← NEW: Shortcuts reference
│   ├── onboarding-tour.tsx           # ← NEW: First-time walkthrough
│   ├── role-switcher.tsx             # ← ENHANCE: Improved admin switcher
│   └── nav-user.tsx                  # ← ENHANCE: Enhanced user widget
│
lib/
├── navigation/                       # ← NEW: Navigation utilities
│   ├── routes.ts                     # Route definitions + metadata
│   ├── use-breadcrumbs.ts            # Breadcrumb generation hook
│   ├── use-command-palette.ts        # Command palette hook
│   └── navigation-items.ts           # Role-based nav items
│
├── hooks/                            # ← NEW: App shell hooks
│   ├── use-notifications.ts          # Notification management
│   ├── use-wallet-balance.ts         # Wallet data fetching
│   └── use-onboarding.ts             # Onboarding state
│
├── actions/                          # ← NEW: Server actions
│   ├── notification-actions.ts       # Notification CRUD
│   └── search-actions.ts             # Global search
│
types/
├── navigation.ts                     # ← NEW: Navigation types
└── notifications.ts                  # ← NEW: Notification types
```

### New Database Tables

```sql
-- Notifications table
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text,
  link text,
  read boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_notifications_user_id on notifications(user_id);
create index idx_notifications_read on notifications(read);
create index idx_notifications_created_at on notifications(created_at desc);

-- RLS policies
alter table notifications enable row level security;

create policy "Users can view their own notifications"
  on notifications for select
  using (auth.uid() = user_id);

create policy "Users can update their own notifications"
  on notifications for update
  using (auth.uid() = user_id);
```

```sql
-- Profiles table modification (add onboarding flag)
alter table profiles add column if not exists onboarding_completed boolean default false;
```

### Dependencies to Install

```bash
# Command palette
pnpm add cmdk

# Onboarding tours
pnpm add react-joyride
pnpm add @types/react-joyride -D

# Already installed (verify):
# - @radix-ui/* (for UI components)
# - lucide-react (for icons)
# - framer-motion (for animations)
```

### CSS Variables (Add to globals.css)

```css
/* Role-based accent colors */
:root {
  --role-accent-requester: #7ac8b5;
  --role-accent-contributor: #60a5fa;
  --role-accent-admin: #a855f7;
}

/* App header */
:root {
  --header-height: 4rem; /* 64px */
}

/* Page header */
:root {
  --page-header-height: 5rem; /* 80px */
}
```

### TypeScript Types

```typescript
// types/navigation.ts

export type RouteDefinition = {
  path: string;
  label: string;
  icon?: React.ComponentType;
  roles?: UserRole[];
  children?: RouteDefinition[];
};

export type BreadcrumbItem = {
  label: string;
  href?: string;
  current?: boolean;
};

export type NavigationItem = {
  title: string;
  href: string;
  icon: React.ComponentType;
  badge?: number | string;
  shortcut?: string;
  roles: UserRole[];
  group?: string;
};
```

```typescript
// types/notifications.ts

export type NotificationType =
  | "submission_approved"
  | "submission_rejected"
  | "request_approved"
  | "request_rejected"
  | "payment_processed"
  | "payout_processed"
  | "new_submission"
  | "milestone_reached"
  | "system_alert";

export type Notification = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message?: string;
  link?: string;
  read: boolean;
  created_at: string;
  updated_at: string;
};
```

---

## 12. Design Mockups (Detailed Descriptions)

Since we can't show actual images, here are detailed text descriptions of the visual design:

### Desktop - Requester View - Expanded Sidebar

```
┌─────────────────────┬───────────────────────────────────────────────────────────┐
│ SIDEBAR (16rem)     │ MAIN CONTENT                                              │
├─────────────────────┼───────────────────────────────────────────────────────────┤
│ [Header]            │ [App Header - 64px height]                                │
│ ┌─────────────────┐ │ ┌─────────────────────────────────────────────────────┐   │
│ │ [C] Caudals     │ │ │ [☰] Dashboard / Requests / #123    [🔍⌘K] [🔔] [👤] │   │
│ │ Requester Dash  │ │ └─────────────────────────────────────────────────────┘   │
│ └─────────────────┘ │                                                            │
│                     │ [Page Header - 80px]                                       │
│ [Quick Actions]     │ ┌──────────────────────────────────────────────────────┐   │
│ ┌─────────────────┐ │ │ Machine Learning Dataset #123                        │   │
│ │ + New Request   │ │ │ Review and approve submissions                       │   │
│ └─────────────────┘ │ │                               [Export] [Approve All] │   │
│                     │ └──────────────────────────────────────────────────────┘   │
│ [Navigation]        │                                                            │
│ ▸ Dashboard         │ [Tabs]                                                     │
│ MY REQUESTS         │ ● All  ○ Pending  ○ Approved                               │
│ • All Requests   ②  │                                                            │
│ • Active            │ [Content Area]                                             │
│ • Completed         │ ┌────────────────────────────────────────────────────┐     │
│ CONTRIBUTORS        │ │ Submissions Table                                  │     │
│ • All Contributors  │ │ ┌──────┬──────────┬────────┬────────┬─────────┐   │     │
│ • Top Performers    │ │ │  ☐   │ File     │ User   │ Status │ Actions │   │     │
│ ANALYTICS           │ │ ├──────┼──────────┼────────┼────────┼─────────┤   │     │
│ • Dashboard         │ │ │  ☐   │ img.jpg  │ Alice  │ Pend.  │ [✓][✗]  │   │     │
│ • Reports           │ │ │  ☐   │ vid.mp4  │ Bob    │ Appr.  │ [View]  │   │     │
│ ACCOUNT             │ │ └──────┴──────────┴────────┴────────┴─────────┘   │     │
│ • Billing & Wallet  │ │                                                    │     │
│ • Settings          │ │                                                    │     │
│                     │ └────────────────────────────────────────────────────┘     │
│ [Help & Support]    │                                                            │
│ • Documentation     │                                                            │
│ • Keyboard ⌘        │                                                            │
│                     │                                                            │
│ [Footer]            │                                                            │
│ ┌─────────────────┐ │                                                            │
│ │ 💰 Wallet       │ │                                                            │
│ │ $1,250.00 USD   │ │                                                            │
│ │ [+ Add Funds]   │ │                                                            │
│ └─────────────────┘ │                                                            │
│ ┌─────────────────┐ │                                                            │
│ │ 🔔 (2 unread)   │ │                                                            │
│ └─────────────────┘ │                                                            │
│ ┌─────────────────┐ │                                                            │
│ │ [👤] John Doe   │ │                                                            │
│ │ john@email.com  │ │                                                            │
│ │ [Settings ▾]    │ │                                                            │
│ └─────────────────┘ │                                                            │
└─────────────────────┴───────────────────────────────────────────────────────────┘
```

### Desktop - Requester View - Collapsed Sidebar (Icon Mode)

```
┌───┬──────────────────────────────────────────────────────────────────────────┐
│   │ [App Header]                                                              │
├───┼──────────────────────────────────────────────────────────────────────────┤
│   │ [☰] Dashboard / Requests / #123        [🔍 Search...] [🔔²] [👤 John]   │
│ C │                                                                            │
│   │ [Page Content - Wider due to collapsed sidebar]                          │
│ ☰ │ ┌────────────────────────────────────────────────────────────────────┐   │
│ + │ │ Machine Learning Dataset #123                                      │   │
│   │ │ Review and approve submissions                   [Export] [Approve]│   │
│ 🏠│ └────────────────────────────────────────────────────────────────────┘   │
│ 📄│                                                                            │
│ 👥│ [More content space available]                                            │
│ 📊│                                                                            │
│ 💳│                                                                            │
│ ⚙️│                                                                            │
│   │                                                                            │
│ 💰│                                                                            │
│ 🔔│                                                                            │
│ 👤│                                                                            │
└───┴──────────────────────────────────────────────────────────────────────────┘
```

### Mobile - Requester View

```
┌─────────────────────────────────────┐
│ [☰]  Caudals           [🔍] [👤]   │ ← Header (simplified)
├─────────────────────────────────────┤
│                                     │
│ Machine Learning #123               │ ← Page title only
│                                     │
│ [Export ▾]                          │ ← Actions in dropdown
│                                     │
│ ● All  ○ Pending  ○ Approved        │ ← Tabs
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Submission #1                   │ │
│ │ Alice - Pending                 │ │
│ │ [✓ Approve] [✗ Reject]          │ │
│ ├─────────────────────────────────┤ │
│ │ Submission #2                   │ │
│ │ Bob - Approved                  │ │
│ │ [View Details]                  │ │
│ └─────────────────────────────────┘ │
│                                     │
│                                     │
│                                     │
└─────────────────────────────────────┘

[Sidebar Sheet - Opens when ☰ clicked]
┌─────────────────────────────────────┐
│ ✕ Close                             │
│                                     │
│ [C] Caudals                         │
│ Requester Dashboard                 │
│                                     │
│ [+ New Request]                     │
│                                     │
│ Dashboard                           │
│ My Requests                      ②  │
│ Contributors                        │
│ Analytics                           │
│ Billing                             │
│ Settings                            │
│                                     │
│ ────────────────────────────────    │
│                                     │
│ 💰 Balance: $1,250.00               │
│ [+ Add Funds]                       │
│                                     │
│ 🔔 2 notifications                  │
│                                     │
│ [👤] John Doe                       │
│ john@email.com                      │
│ [Sign Out]                          │
└─────────────────────────────────────┘
```

### Admin View - Different Navigation

```
┌─────────────────────┬─────────────────────────────────────────┐
│ SIDEBAR             │ CONTENT                                 │
├─────────────────────┼─────────────────────────────────────────┤
│ [C] Caudals         │ [☰] Admin / Pending Requests [🔍] [🔔] │
│ Admin Console       │                                         │
│                     │ Pending Requests                        │
│ [Role Switcher ▾]   │ Review and approve new datasets         │
│ • Admin      ←      │ [Approve All] [Bulk Actions ▾]          │
│ • Requester         │                                         │
│ • Contributor       │ [Filters: All | Today | This Week]      │
│                     │                                         │
│ [Quick Actions]     │ ┌─────────────────────────────────────┐ │
│ [Pending Reviews ⑧] │ │ Request #123                        │ │
│                     │ │ ML Dataset - Computer Vision        │ │
│ 🏠 Admin Console    │ │ Submitted by: john@email.com        │ │
│ MODERATION          │ │ [Approve] [Reject] [View Details]   │ │
│ • Pending Reqs   ⑧  │ ├─────────────────────────────────────┤ │
│ • Pending Subs   ⑤  │ │ Request #124                        │ │
│ • Flagged        ②  │ │ Text Dataset - NLP                  │ │
│ MANAGEMENT          │ │ ...                                 │ │
│ • All Datasets      │ └─────────────────────────────────────┘ │
│ • All Users         │                                         │
│ • Featured Ads      │                                         │
│ FINANCIAL           │                                         │
│ • Payment Overview  │                                         │
│ • Invoices          │                                         │
│ ANALYTICS           │                                         │
│ • User Analytics    │                                         │
│ • Dataset Analytics │                                         │
│ • Revenue           │                                         │
│ SYSTEM              │                                         │
│ • Settings          │                                         │
│ • API & Webhooks    │                                         │
│                     │                                         │
│ [Footer]            │                                         │
│ 🟢 System Health    │                                         │
│ All services OK     │                                         │
│                     │                                         │
│ [👤] Admin User     │                                         │
└─────────────────────┴─────────────────────────────────────────┘
```

---

## 13. Success Criteria

### Functionality

- ✅ Sidebar collapses to icon mode on desktop
- ✅ Sidebar opens as sheet modal on mobile
- ✅ Role-based navigation works (contributor/requester/admin)
- ✅ Admin can switch between views seamlessly
- ✅ Breadcrumbs auto-generate from route
- ✅ Command palette (⌘K) searches all content
- ✅ Notifications display with real-time count
- ✅ Wallet widget shows live balance
- ✅ Keyboard shortcuts work globally
- ✅ Onboarding tour runs for first-time users
- ✅ All links navigate correctly
- ✅ Active states show current page

### Design Quality

- ✅ Professional, polished appearance
- ✅ Consistent spacing and typography
- ✅ Smooth animations (no jank)
- ✅ Brand identity throughout (logo, colors)
- ✅ Role-specific accents subtle but clear
- ✅ Visual hierarchy guides attention
- ✅ Looks production-ready, not prototype

### Performance

- ✅ Initial page load < 2s (LCP)
- ✅ Sidebar toggle instant (no lag)
- ✅ Navigation smooth (no flash of content)
- ✅ Search results < 500ms
- ✅ Lazy loading for heavy components
- ✅ No layout shift (CLS = 0)

### Accessibility

- ✅ All WCAG AA standards met
- ✅ Keyboard navigation works everywhere
- ✅ Screen reader announces changes
- ✅ Focus visible on all interactive elements
- ✅ Color contrast passes (4.5:1 minimum)
- ✅ Skip to content link present

### Responsive

- ✅ Works on 320px width (iPhone SE)
- ✅ Tablet layout optimized (768px+)
- ✅ Desktop layout polished (1024px+)
- ✅ No horizontal scroll at any size
- ✅ Touch targets minimum 44px

### Internationalization

- ✅ All text translatable (no hardcoded strings)
- ✅ Spanish translations complete
- ✅ Language switcher works
- ✅ RTL-ready structure (future)

---

## 14. Risks & Mitigations

### Risk: Complexity Overload

**Description:** Adding too many features at once may delay launch

**Mitigation:**
- Phase implementation (start with core, add features later)
- MVP first: sidebar + header + breadcrumbs
- Advanced features (notifications, onboarding) in Phase 3+

### Risk: Performance Impact

**Description:** Rich features may slow down app

**Mitigation:**
- Code splitting for heavy components
- Lazy load modals and overlays
- Measure bundle size continuously
- Use Lighthouse CI in testing

### Risk: Mobile UX Challenges

**Description:** Desktop-focused design may not translate well to mobile

**Mitigation:**
- Mobile-first design approach
- Test on real devices early
- Simplify mobile UI (hide non-essential)
- Bottom nav for mobile (future)

### Risk: Accessibility Gaps

**Description:** Missing accessibility features post-launch

**Mitigation:**
- Include accessibility in Phase 4 (before launch)
- Test with screen readers (VoiceOver, NVDA)
- Automated testing (axe-core)
- Manual keyboard-only navigation testing

### Risk: Translation Quality

**Description:** Spanish translations may be poor quality

**Mitigation:**
- Use natural, native Spanish (not Google Translate)
- Review by native speaker
- Context-aware translations (not word-for-word)
- Placeholder for missing strings (don't break app)

---

## 15. Future Enhancements (Post-Launch)

### Phase 7+: Advanced Features

1. **Bottom Navigation (Mobile)**
   - Fixed bottom tab bar on mobile
   - Quick access to: Dashboard, Browse, Upload, Notifications, Profile
   - Active state indicators

2. **Dark Mode Refinement**
   - Fine-tune dark mode colors
   - Test all components in dark mode
   - Add dark mode screenshots

3. **Presence Indicators**
   - Show online/offline status
   - Real-time collaboration indicators
   - "User is typing..." for admin notes

4. **Advanced Notifications**
   - Push notifications (via service worker)
   - Email digest preferences
   - Notification grouping by type
   - Snooze/mute options

5. **Personalization**
   - Customizable sidebar order
   - Pinned navigation items
   - Dashboard widget layout
   - Color theme preferences (beyond light/dark)

6. **Activity Feed**
   - Recent activity timeline
   - Audit log (admin)
   - Collaboration history

7. **Quick Switcher**
   - Switch between recent items (⌘J)
   - Jump to last viewed request/dataset
   - Frecency algorithm (frequency + recency)

8. **Sidebar Workspaces** (Future: Multi-tenant)
   - Workspace switcher in header
   - Different orgs/teams
   - Separate billing per workspace

9. **Improved Search**
   - Filters within search (by type, date)
   - Search within specific sections
   - Saved searches
   - Search history

10. **Guided Tours**
    - Feature announcements (changelog modal)
    - Contextual help (tooltips on demand)
    - Video tutorials embedded

---

## 16. Conclusion & Next Steps

### Summary

This plan outlines a **comprehensive redesign** of the Caudals app shell that will:

1. **Transform the generic dashboard** into a professional, polished SaaS platform
2. **Improve user experience** with intuitive navigation, quick access features, and contextual information
3. **Support three distinct roles** with tailored interfaces while maintaining consistency
4. **Provide modern features** like command palette, notifications, and onboarding
5. **Ensure accessibility** with keyboard shortcuts, ARIA labels, and screen reader support
6. **Maintain performance** through code splitting, lazy loading, and optimization
7. **Support internationalization** with complete Spanish translations

### Immediate Next Steps

**For User Approval:**
1. Review this plan thoroughly
2. Provide feedback on design decisions
3. Approve to proceed with implementation
4. Clarify any questions or concerns

**For Implementation (Phase 2):**
Once approved, we'll start with:
1. Creating the new layout structure (`app/(app)/layout.tsx`)
2. Building the enhanced sidebar component
3. Implementing the app header with breadcrumbs
4. Adding role-based navigation logic
5. Testing across roles and devices

### Questions for User

Before proceeding with implementation, please confirm:

1. **Design Direction:** Does the overall vision align with your expectations?
2. **Feature Priorities:** Are there any features to add/remove/prioritize?
3. **Timeline:** Any specific deadlines or milestones?
4. **Scope:** Start with Phase 2 (core shell) or include Phase 3 (advanced features)?
5. **Branding:** Any specific brand guidelines or assets to incorporate?

---

## Appendix: Design Inspirations

### Reference Platforms (for design quality level)

1. **Linear** - Clean, minimalist, fast
2. **Stripe Dashboard** - Professional, data-dense
3. **Vercel** - Modern, brand-forward
4. **Notion** - Flexible, well-organized
5. **GitHub** - Information-rich, accessible
6. **Figma** - Efficient workflows, keyboard-centric

### Design Principles Summary

- **Less is More** - Don't clutter, prioritize key info
- **Consistency** - Same patterns across all pages
- **Speed** - Optimize for quick actions
- **Context** - Show relevant info at the right time
- **Feedback** - Clear states (loading, success, error)
- **Delight** - Subtle animations, polished interactions

---

**End of Plan**

This plan is ready for user review and approval. Upon approval, implementation will begin with Phase 2: Core App Shell.
