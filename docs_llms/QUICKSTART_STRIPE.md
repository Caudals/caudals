# 🚀 Quick Start - Stripe Connect Setup

## What's Been Implemented

✅ **Payment Element** - Modern, customizable payment interface  
✅ **Stripe Connect** - Automatic bank transfers to contributors  
✅ **10% Platform Fee** - Via Stripe application fees  
✅ **Auto Payouts** - When submissions are approved  
✅ **Wallet Tracking** - Real-time balance updates  
✅ **Webhook Integration** - Payment & transfer event handling

## 📋 Immediate Next Steps

### Step 1: Run Database Migration (5 minutes)

**Option A: Using Supabase Dashboard**

1. Go to https://app.supabase.com
2. Select your project
3. Navigate to **SQL Editor**
4. Create new query
5. Copy contents from: `supabase/migrations/004_fix_wallet_trigger.sql`
6. Click **Run**

**Option B: Using Supabase CLI**

```bash
supabase db push
```

### Step 2: Configure Stripe (10 minutes)

1. **Enable Stripe Connect**

   - Go to https://dashboard.stripe.com/connect/settings
   - Enable Express accounts
   - Set platform name and support email

2. **Create Webhook**

   - Go to https://dashboard.stripe.com/webhooks
   - Click "Add endpoint"
   - URL: `https://yourdomain.com/api/webhooks/stripe`
   - Select events:
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `account.updated`
     - `transfer.created`
     - `transfer.failed`
   - Copy the signing secret (starts with `whsec_`)

3. **Get API Keys**
   - Go to https://dashboard.stripe.com/apikeys
   - Copy:
     - Publishable key (pk*test*...)
     - Secret key (sk*test*...)

### Step 3: Set Environment Variables (2 minutes)

Add to your `.env.local`:

```bash
STRIPE_SECRET_KEY=sk_test_...your_key_here
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...your_key_here
STRIPE_WEBHOOK_SECRET=whsec_...your_secret_here
```

### Step 4: Test the Flow (15 minutes)

#### Test 1: Fund a Dataset

1. Login as a requester
2. Create a dataset with reward (e.g., $10 per submission)
3. Click "Fund Dataset"
4. Enter amount: $100
5. Use test card: `4242 4242 4242 4242`
6. Verify dataset shows as "paid"

#### Test 2: Setup Connect Account

1. Login as a contributor
2. Go to Dashboard → Wallet
3. Click "Setup Stripe Connect Account"
4. Use test bank: `000123456789`, routing: `110000000`
5. Complete onboarding

#### Test 3: Complete Payout Flow

1. As contributor: Submit data to funded dataset
2. As admin: Approve the submission
3. Check console logs for payout confirmation
4. Verify in Stripe Dashboard → Connect → Transfers
5. Check contributor's transaction history

## 🔍 Verification Checklist

After setup, verify these work:

- [ ] Payment Element displays on funding page
- [ ] Test payment succeeds (use card 4242...)
- [ ] Dataset marked as "paid" after payment
- [ ] Contributor can create Connect account
- [ ] Submission approval triggers transfer
- [ ] Transfer visible in Stripe Dashboard
- [ ] Contributor sees payout in transactions
- [ ] Platform fee (10%) deducted correctly

## 🐛 Common Issues & Fixes

**Payment Element not showing?**

- Check `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set
- Verify key starts with `pk_test_` or `pk_live_`
- Check browser console for errors

**Webhook not receiving events?**

- Verify webhook URL is accessible
- Check signing secret matches
- For local dev, use Stripe CLI:
  ```bash
  stripe listen --forward-to localhost:3000/api/webhooks/stripe
  ```

**Payout not created?**

- Ensure contributor has `payouts_enabled: true`
- Check dataset is marked as "paid"
- Verify contributor completed Connect onboarding
- Review server logs for errors

**Wallet balance not updating?**

- Ensure migration was run successfully
- Check transaction status is 'completed'
- Verify trigger exists in database

## 📚 Full Documentation

- **Complete Setup Guide**: `STRIPE_CONNECT_SETUP.md`
- **Implementation Summary**: `STRIPE_IMPLEMENTATION_SUMMARY.md`
- **Stripe Docs**: https://stripe.com/docs/connect

## 🚀 Going Live

When ready for production:

1. Complete Stripe account verification
2. Switch to live API keys (pk*live*, sk*live*)
3. Update webhook endpoint to production URL
4. Create new webhook with live signing secret
5. Test with real bank account (small amount)

## 💡 Key Features

**For Requesters:**

- Modern payment interface (Payment Element)
- Secure card processing
- Automatic platform fee handling

**For Contributors:**

- Direct bank deposits
- Automatic payouts on approval
- 90% of reward (10% platform fee)

**For Platform:**

- 10% commission on all payments
- Automated transfer system
- Complete transaction tracking

## ⚡ Quick Links

- [Stripe Dashboard](https://dashboard.stripe.com)
- [Connect Settings](https://dashboard.stripe.com/connect/settings)
- [Webhooks](https://dashboard.stripe.com/webhooks)
- [API Keys](https://dashboard.stripe.com/apikeys)
- [Test Cards](https://stripe.com/docs/testing#cards)

---

**Status**: ✅ Ready to Configure  
**Estimated Setup Time**: ~30 minutes  
**Next Step**: Run the database migration →
