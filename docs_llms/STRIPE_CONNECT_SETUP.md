# Stripe Connect Payment System - Setup Instructions

This document provides step-by-step instructions for setting up and configuring the Stripe Connect payment system for your crowdsourced dataset platform.

## Overview

The platform uses Stripe Connect to handle payments with the following flow:

1. **Requesters** fund datasets using Stripe Payment Element
2. **Platform** collects 10% application fee automatically
3. **Contributors** receive automatic payouts to their bank accounts when submissions are approved
4. All payments are processed through Stripe Connect transfers

## Prerequisites

- Active Stripe account
- Access to Stripe Dashboard
- Supabase project with database access
- Environment variables configured

## Part 1: Stripe Dashboard Configuration

### 1.1 Enable Stripe Connect

1. Log into your [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Connect** → **Settings**
3. Enable **Express accounts** for contributors
4. Configure the following settings:
   - Platform name: Your platform name
   - Support email: Your support email
   - Brand color: Your brand color (optional)

### 1.2 Configure Webhook Endpoints

1. Go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Enter your webhook URL:

   ```
   https://yourdomain.com/api/webhooks/stripe
   ```

   For local development:

   ```
   Use Stripe CLI: stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

4. Select the following events:

   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `account.updated`
   - `transfer.created`
   - `transfer.failed`
   - `checkout.session.completed`

5. Click **Add endpoint**
6. Copy the **Signing secret** (starts with `whsec_...`)

### 1.3 Get API Keys

1. Go to **Developers** → **API keys**
2. Copy your keys:
   - **Publishable key** (starts with `pk_test_...` or `pk_live_...`)
   - **Secret key** (starts with `sk_test_...` or `sk_live_...`)

### 1.4 Application Fee Settings

The platform automatically collects a 10% application fee on all dataset funding payments. This is configured in the code and doesn't require additional Stripe dashboard configuration.

## Part 2: Environment Variables

Add the following to your `.env.local` file:

```bash
# Stripe Keys
STRIPE_SECRET_KEY=sk_test_...                    # Your secret key from Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...  # Your publishable key from Stripe
STRIPE_WEBHOOK_SECRET=whsec_...                  # Webhook signing secret

# Optional: For OAuth flow (advanced)
# STRIPE_CONNECT_CLIENT_ID=ca_...                # Only if using OAuth for Connect
```

## Part 3: Database Migration

Run the database migration to fix wallet balance triggers:

### Option 1: Using Supabase CLI

```bash
supabase db push
```

### Option 2: Manual SQL Execution

1. Log into your [Supabase Dashboard](https://app.supabase.com)
2. Go to **SQL Editor**
3. Create a new query
4. Copy and paste the contents of `supabase/migrations/004_fix_wallet_trigger.sql`
5. Execute the query

The migration does the following:

- Updates the wallet balance trigger to fire on both INSERT and UPDATE
- Ensures wallets are created automatically if they don't exist
- Prevents duplicate wallet balance updates

## Part 4: Testing the Payment Flow

### 4.1 Test Cards

Use these test card numbers in test mode:

**Successful Payment:**

- Card: `4242 4242 4242 4242`
- Expiry: Any future date
- CVC: Any 3 digits
- ZIP: Any 5 digits

**Payment Requires Authentication:**

- Card: `4000 0025 0000 3155`

**Declined Payment:**

- Card: `4000 0000 0000 9995`

### 4.2 Test Connect Account

1. As a contributor, go to **Dashboard** → **Wallet**
2. Click **Setup Stripe Connect Account**
3. Fill in test information:
   - Use test bank account: `000123456789`
   - Routing number: `110000000`
   - Any valid test address

### 4.3 Complete Payment Flow Test

Follow this end-to-end test:

1. **As Requester:**

   - Create a new dataset request with reward amount (e.g., $10)
   - Click "Fund Dataset"
   - Enter amount (e.g., $100)
   - Complete payment with test card `4242 4242 4242 4242`
   - Verify dataset status changes to "paid"

2. **As Contributor:**

   - Setup Stripe Connect account
   - Submit data to the funded dataset
   - Wait for approval

3. **As Admin:**

   - Go to **Admin** → **Submissions**
   - Approve the contributor's submission
   - Verify console logs show payout creation

4. **Verify Results:**
   - Check Stripe Dashboard → **Connect** → **Transfers**
   - Contributor should see transaction in their wallet dashboard
   - Platform fee (10%) should be recorded
   - Contributor receives 90% of reward amount

## Part 5: Going Live

### 5.1 Activate Your Account

1. Complete Stripe account verification
2. Provide business information
3. Add bank account for platform payouts

### 5.2 Switch to Live Mode

1. Get live API keys from Stripe Dashboard
2. Update environment variables:

   ```bash
   STRIPE_SECRET_KEY=sk_live_...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...  # Live webhook secret
   ```

3. Update webhook endpoint to production URL

### 5.3 Compliance

Ensure you comply with:

- Stripe's Terms of Service
- Connect Platform Agreement
- Local payment processing regulations
- Tax reporting requirements (1099-K for US contributors)

## Part 6: Monitoring & Troubleshooting

### 6.1 Monitor Payments

- **Stripe Dashboard** → **Payments**: View all payment intents
- **Stripe Dashboard** → **Connect** → **Transfers**: View payouts to contributors
- **Application Logs**: Check server logs for payment processing

### 6.2 Common Issues

**Issue: Payment Element not showing**

- Verify `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set correctly
- Check browser console for errors
- Ensure you're creating a payment intent before showing the element

**Issue: Webhook not receiving events**

- Verify webhook URL is accessible
- Check webhook signing secret matches
- Use Stripe CLI to test: `stripe trigger payment_intent.succeeded`

**Issue: Payout not created on approval**

- Verify contributor has active Stripe Connect account (`payouts_enabled: true`)
- Check dataset is marked as "paid"
- Review server logs for payout errors
- Ensure contributor account is fully verified

**Issue: Wallet balance not updating**

- Run the migration `004_fix_wallet_trigger.sql`
- Check transaction status is 'completed'
- Verify trigger is active: `SELECT * FROM pg_trigger WHERE tgname = 'on_transaction_completed'`

### 6.3 Webhook Debugging

View webhook attempts in Stripe Dashboard:

1. Go to **Developers** → **Webhooks**
2. Click on your endpoint
3. View **Attempted events** tab
4. Check for failed deliveries and error messages

## Part 7: Security Best Practices

1. **Never expose secret keys** in client-side code
2. **Validate webhook signatures** (already implemented)
3. **Use HTTPS** for all webhook endpoints in production
4. **Store API keys** in environment variables, never in code
5. **Rotate keys** periodically
6. **Enable Stripe Radar** for fraud prevention
7. **Set up alerts** for failed payments and transfers

## Support & Resources

- [Stripe Connect Documentation](https://stripe.com/docs/connect)
- [Stripe Payment Element Guide](https://stripe.com/docs/payments/payment-element)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [Platform Support](mailto:your-support@email.com)

## Quick Reference

### Payment Flow

```
Requester → Payment Element → PaymentIntent (with 10% app fee)
→ Webhook confirms → Dataset marked "paid"
```

### Payout Flow

```
Contributor → Submit Data → Admin Approves
→ Auto-create Stripe Transfer → Contributor Bank Account
→ Webhook logs transfer → Update wallet balance
```

### Fee Structure

- **Platform Fee**: 10% of dataset funding
- **Stripe Processing Fee**: ~2.9% + 30¢ (varies by region)
- **Contributor Receives**: 90% of reward amount (net of platform fee)

---

**Last Updated**: [Date]
**Version**: 1.0
