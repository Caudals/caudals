# 2026-04-16 – Landing Hero Spline Ribbon

## Summary

- Removed the landing hero Mux video background mount and deleted the old video background component.
- Added the requested Spline scene as a non-interactive decorative hero ribbon while preserving the existing dashboard mock.
- Centered the Spline scene inside the full hero and removed CSS amplification/overscan so camera angle and zoom are controlled from the Spline export.
- Kept the Spline canvas fluid at 100% width/height with responsive minimum heights so slight camera or zoom changes in Spline remain stable on mobile.
- Removed the complementary hero video gradients and updated CSP media directives for Spline's data/blob media usage.
- Added `@splinetool/react-spline` and `@splinetool/runtime`; removed the unused `@mux/mux-video` dependency.

## Phase

- Phase 32 – Landing Page Aesthetic Refactor
- Task: `P32-T18`
