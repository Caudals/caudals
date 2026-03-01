# Dashboard Usability Instrumentation and Acceptance Checks

Last updated: 2026-03-01  
Task: `S10-T07`

## Event Taxonomy

Tracked in `product_analytics_events`:

- `dashboard_view`
  - payload: `role`, `page`, `path`
- `dashboard_action_clicked`
  - payload: `role`, `page`, `action_id`, `time_to_action_ms`

Existing funnel events remain active:

- `funnel_visit`
- `funnel_signup`
- `funnel_dataset_created`
- `funnel_fund`

## Instrumented Dashboards

- Requester dashboard (`/requester`)
- Contributor dashboard (`/contributor`)
- Admin dashboard (`/admin`)

Primary actions emit `dashboard_action_clicked` via `data-dashboard-action` markers and `DashboardTelemetry` listener.

## Acceptance Queries

### 1) Dashboard visits by role (30d)

```sql
select
  coalesce(user_role, 'unknown') as role,
  count(*) as visits
from product_analytics_events
where event_name = 'dashboard_view'
  and occurred_at >= now() - interval '30 days'
group by 1
order by 2 desc;
```

### 2) Action CTR by role (action events / view events)

```sql
with visits as (
  select coalesce(user_role, 'unknown') as role, count(*) as views
  from product_analytics_events
  where event_name = 'dashboard_view'
    and occurred_at >= now() - interval '30 days'
  group by 1
),
actions as (
  select coalesce(user_role, 'unknown') as role, count(*) as actions
  from product_analytics_events
  where event_name = 'dashboard_action_clicked'
    and occurred_at >= now() - interval '30 days'
  group by 1
)
select
  v.role,
  v.views,
  coalesce(a.actions, 0) as actions,
  case when v.views = 0 then 0
       else round((coalesce(a.actions, 0)::numeric / v.views::numeric) * 100, 1)
  end as action_to_view_pct
from visits v
left join actions a on a.role = v.role
order by v.views desc;
```

### 3) Average time-to-action by role

```sql
select
  coalesce(user_role, 'unknown') as role,
  round(avg((metadata ->> 'time_to_action_ms')::numeric), 0) as avg_tta_ms
from product_analytics_events
where event_name = 'dashboard_action_clicked'
  and occurred_at >= now() - interval '30 days'
  and (metadata ->> 'time_to_action_ms') ~ '^[0-9]+$'
group by 1
order by 2 asc;
```

## Operational Use

- Admin analytics page now includes a "Dashboard Usability Telemetry" section with:
  - visits by role,
  - action counts by role,
  - average time-to-action,
  - action/view conversion.

Use these metrics as regression signals after dashboard UX changes.
