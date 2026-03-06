# 2026-03-06 - Validation: Settings Route View Parity

## Scope
- Ensure profile-dropdown "Settings" and sidebar "Settings" use the same route resolution logic.
- Ensure admin users in switched views route to that view's settings page.

## Commands
- `npm run typecheck`
- `npx eslint components/app/nav-user.tsx components/app/user-menu.tsx components/app/app-sidebar.tsx lib/navigation/role-view.ts`
- `npm test -- --run lib/navigation/role-view.test.ts`

## Results
- `typecheck`: pass
- targeted `eslint`: pass
- `vitest` targeted suite: pass (`6` tests)

## Notes
- This fix is logic-only route parity; it does not modify settings-page data loading behavior.
