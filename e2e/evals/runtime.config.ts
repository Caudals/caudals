import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'runtime.contract.ts',workers:1,fullyParallel:false,timeout:60000,outputDir:'/tmp/evals-runtime-results',reporter:'list',use:{baseURL:process.env.EVALS_E2E_URL??'http://127.0.0.1:4188',browserName:'chromium'}});
