# App redesign

## Intro
I want you to plan, redesign and rebuild the app part of my startup web platform, which will go under [app.caudals.com](http://app.caudals.com) and the (app) folder in this repo. This is the area where contributors, requesters and administrartors will use the main flows of the platform, and where they will change their billing methods, settings, profile, etc.

## Context
- There will be 3 different views, depending on the user role (admin/requester/contributor). 
- My landing page and browse section is under caudals.com. All the auth screens and the app itself is under app.caudals.com
- My db and auth is in a self-hosted supabase instance in a Digital Ocean vps. The storage is in DO object storage.

## Requirements
- First, I want you to elaborate a complete, detailed, extensive plan for this big refactoring. To dot it, first analyze how my platform works, what are the requirements and features, and what can be added to improve functionality and new features. Then write down the entire plan as text before implementing it.
  - I want you to think about and decide what is the best layout for the app shell and design.
  - For each one of the views, plan what sections, menus and features it should have. They should be intuitive, well structured and organized, and they should offer the workflows needed for our platform. You can also implement new features that are particularly useful and that could enrich our platform.
  - Apart from other sections, include Billing/Earnings, analytics and settings pages in the 3 views. In the admin view, Billing/earnings will serve to manage payments and payouts, percentages, comissions, generate invoices for custom pricing plans, etc. Also in the admin view add a page to create and manage featured ads.
  - Plan and implement fully functional and useful features that integrate with both the frontend, the background logic, the db, etc. The goal is to have a final, production-ready, polished product that can be launched to the market and used by a lot of users. For example, the settings page should work, the user should be able to change its account settings in the db, the billing should work, etc.
- The design can change across views in order to make it more suitable for the specific type of user/role. Each account is associated with only one role, except the admin which will have access to the 3 views for testing and administration purposes.
- Discard the current app and dashboard code. It was just for testing and sketching purposes. Do not just reuse what's in (app), this is not useful. I want a complete refactoring and redesign of the app part for my platform.
- Do not include fake data and information that is not being extracted from the API. This is a final app, not only a design. Remove all these sections and components. The app should be real and the data should be extracted from the database.
- Use shadcn ui components (tables, charts, blocks, sidebars, topbars, menus or whatever you need). You can check docs using internet at [https://ui.shadcn.com/docs/](https://ui.shadcn.com/docs/). 
- Use shadcn ui charts and graphs where needed. You can check the docs at [https://ui.shadcn.com/charts/area](https://ui.shadcn.com/charts/area)
- Use shadcn ui tables with multi select, bult actions, sort, filtering, search, etc when needed
- Let requesters preview files and download datasets. Handle big datasets downloads (even TBs)
- Implement onboarding and walkthrough for both users and requesters so that they know how to use the app and what are the features.
- Make sure to add translations to spanish for all the texts in the dictionary es.json. Do not forget any text. The entire app should be in english with spanish translation available. Use a natural, spanish language for the translations.
- Make sure the app is responsive and works well on both desktop and mobile devices.
- Take as much time as you need to plan and design the app, and to implement it. Do not rush it. The result should be a final, polished, production-ready product.

## Task
We will start building just the new layout. Your plan should focus on how to design and implent the new app shell, do not plan the admin/contributor/requester views yet. In future messages we will plan and build the rest of the views, but right now focus on planning and implementing just the new layout based on my requrements. Think about the best and most professional design, structure and distribution for the app shell. It should feel like a real production ready app, not just a generic dashboard.