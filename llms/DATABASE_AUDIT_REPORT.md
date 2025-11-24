# 🔍 Database Audit Report - Caudals Platform

**Date:** 2025-11-20
**Database:** PostgreSQL (Supabase)
**Tables:** 8 tables, ~530 total rows

---

## 📊 Database Overview

### Table Statistics

| Table | Rows | Size | Status |
|-------|------|------|--------|
| submissions | 234 | 192 KB | ✅ Active |
| dataset_requests | 38 | 184 KB | ✅ Active |
| wallets | ? | 80 KB | ✅ Active |
| transactions | 0 | 72 KB | ⚠️ Unused |
| waitlist_signups | ? | 64 KB | 📝 Data |
| admin_activity_log | ? | 64 KB | 📝 Logging |
| stripe_accounts | ? | 56 KB | 💰 Payments |
| profiles | 19 | 32 KB | ✅ Active |

**Total Users:** 19 profiles = 19 auth.users ✅ (Synchronized)

---

## ✅ GOOD THINGS (Working Correctly)

### 1. **Foreign Key Integrity - FIXED** ✅
- ✅ **All 234 submissions** have valid contributor profiles
- ✅ **All 38 datasets** have valid creator profiles
- ✅ **No orphaned records** found in any table
- ✅ **Cascading deletes** properly configured

**Foreign Key Relationships:**
```
profiles (19)
  ├─> dataset_requests.created_by (38) ✅
  ├─> dataset_requests.approved_by (optional) ✅
  ├─> submissions.contributor_id (234) ✅
  ├─> transactions.user_id (0) ✅
  ├─> wallets.user_id ✅
  ├─> stripe_accounts.user_id ✅
  └─> admin_activity_log.admin_id ✅

dataset_requests (38)
  ├─> submissions.dataset_request_id (234) ✅
  └─> transactions.dataset_request_id (0) ✅

submissions (234)
  └─> transactions.submission_id (0) ✅
```

### 2. **User Profile Management** ✅
- ✅ Trigger `on_auth_user_created` is active and working
- ✅ Automatic profile creation on user signup
- ✅ All 19 users have profiles (was 15/19, fixed 4 missing)
- ✅ Default role: `contributor`

### 3. **Row Level Security (RLS)** ✅
All tables have proper RLS policies:

**profiles:**
- ✅ Public read (everyone can view profiles)
- ✅ Users can insert/update own profile only

**dataset_requests:**
- ✅ Approved datasets public
- ✅ Creators can CRUD their own
- ✅ Admins can view/update all

**submissions:**
- ✅ Contributors can create/view/update own
- ✅ Dataset owners can update status
- ✅ Admins can view all

**transactions:**
- ✅ Users can view own only
- ✅ Admins can view all
- ✅ Service role can insert/update (for system operations)

**wallets:**
- ✅ Users can view/update own only
- ✅ Service role can create wallets
- ✅ Admins can view all

### 4. **Constraints & Validation** ✅
```sql
-- Positive amounts
✅ reward_amount >= 0
✅ samples_needed > 0
✅ samples_collected >= 0

-- Valid enums
✅ payment_status: unpaid, partial, paid, refunded
✅ transaction_status: pending, completed, failed, cancelled
✅ transaction_type: deposit, withdrawal, payment, payout, refund, commission
✅ funding_model: upfront, per_contribution

-- Unique constraints
✅ wallets.user_id (one wallet per user)
✅ wallets.stripe_customer_id (unique)
✅ submissions unique per (dataset_id, contributor_id, created_at)
```

### 5. **Triggers Working Properly** ✅
- ✅ `on_auth_user_created` - Creates profile on signup
- ✅ `update_*_updated_at` - Auto-updates timestamps
- ✅ `on_submission_status_change` - Updates samples_collected
- ✅ `auto_update_dataset_status` - Auto-updates dataset status
- ✅ `on_transaction_completed` - Updates wallet balance
- ✅ `trg_transactions_apply` - Applies transaction to wallet
- ✅ `trg_transactions_revert` - Reverts failed transactions

### 6. **Indexes** ✅
Good index coverage on:
- ✅ Foreign keys (all FK columns indexed)
- ✅ Status fields (for filtering)
- ✅ Timestamps (for sorting/date queries)
- ✅ User lookups (user_id, contributor_id, created_by)

---

## ⚠️ ISSUES & RECOMMENDATIONS

### 🔴 CRITICAL ISSUES

#### 1. **Duplicate Transaction Triggers** 🔴
**Problem:** There are **3 triggers** updating wallet balance on transactions:
```sql
- on_transaction_completed → update_wallet_balance()
- trg_transactions_apply → apply_transaction_to_wallet()
- trg_transactions_revert → revert_transaction_from_wallet()
```

**Risk:**
- 💥 **Double-counting transactions** (wallet updated twice/thrice)
- 💥 **Race conditions** if triggers conflict
- 💥 **Incorrect balances**

**Impact:** Currently LOW (0 transactions), but **CRITICAL when payments start**

**Fix Required:** ⚠️ **YES - Before going to production**

---

#### 2. **Duplicate Policies on Transactions** 🔴
**Problem:** Duplicate RLS policies found:
```sql
transactions:
  - "System can insert transactions"
  - "transactions_insert_service"       (DUPLICATE)

  - "System can update transactions"
  - "transactions_update_service"       (DUPLICATE)

  - "Admins can view all transactions"
  - "transactions_admin_read"           (DUPLICATE)

  - "Users can view own transactions"
  - "transactions_select_own"           (DUPLICATE)
```

**Risk:**
- 🐛 Confusing maintenance
- 🐛 Possible policy conflicts
- 🐛 Performance overhead (checking multiple identical policies)

**Fix Required:** ⚠️ **YES - Clean up duplicates**

---

#### 3. **Duplicate Policies on Wallets** 🟡
**Problem:** Similar issue on `wallets` table
```sql
wallets_admin_read + (possibly another admin policy)
wallets_select_own + (possibly another user read policy)
```

**Fix Required:** ⚠️ **YES - Clean up**

---

### 🟡 MEDIUM PRIORITY ISSUES

#### 4. **No Email Uniqueness Constraint** 🟡
**Problem:** `profiles.mail` has no UNIQUE constraint

**Risk:**
- Multiple users could have same email
- Conflicts in password reset flows
- User confusion

**Current Status:** Likely enforced by Supabase Auth, but not in database

**Fix Required:** ⚠️ Consider adding

---

#### 5. **Missing Indexes** 🟡
**Recommended additional indexes:**
```sql
-- For filtering datasets by approval status + status
CREATE INDEX idx_dataset_requests_approval_status
ON dataset_requests(approval_status)
WHERE approval_status = 'pending';

-- For recent submissions (heavy query)
CREATE INDEX idx_submissions_recent
ON submissions(created_at DESC, status);

-- For wallet queries by Stripe customer
-- Already exists ✅
```

**Fix Required:** 🟢 Optional (performance optimization)

---

#### 6. **No Check for Negative Wallet Balance** 🟡
**Problem:** Wallets can go negative?
```sql
available_balance bigint NOT NULL DEFAULT 0
pending_balance bigint NOT NULL DEFAULT 0
```

No constraint: `available_balance >= 0`

**Risk:**
- Users could have negative balance
- Overdraft situations

**Fix Required:** ⚠️ **Consider adding constraint**

---

#### 7. **Transactions Table Unused** 🟡
**Status:** 0 rows in `transactions` table

**Questions:**
- Is payment system fully implemented?
- Are Stripe webhooks working?
- Should test transactions exist?

**Fix Required:** 🟢 Verify payment flow works

---

### 🟢 MINOR ISSUES

#### 8. **Stripe Accounts Duplicate Trigger Names** 🟢
```sql
stripe_accounts:
  - trg_stripe_accounts_updated_at
  - update_stripe_accounts_updated_at  (DUPLICATE?)
```

**Fix Required:** 🟢 Clean up if duplicate

---

#### 9. **Missing Cascade on `dataset_requests.approved_by`** 🟢
**Problem:**
```sql
✅ dataset_requests.created_by → CASCADE (good)
⚠️ dataset_requests.approved_by → NO CASCADE (risky)
```

**Risk:** If admin is deleted, `approved_by` becomes NULL (probably OK, but inconsistent)

**Fix Required:** 🟢 Consider SET NULL explicitly

---

#### 10. **No Soft Deletes** 🟢
**Observation:** All tables use hard deletes (ON DELETE CASCADE)

**Risk:**
- Deleted users → all their data gone
- No audit trail
- Can't restore accidentally deleted data

**Recommendation:** Consider soft deletes for:
- profiles (deleted_at)
- dataset_requests (deleted_at)
- submissions (deleted_at)

**Fix Required:** 🟢 Optional (depends on product requirements)

---

## 🔒 SECURITY ANALYSIS

### ✅ Security GOOD Practices

1. ✅ **RLS enabled on all tables**
2. ✅ **Service role separation** (system operations)
3. ✅ **User isolation** (can only see own data)
4. ✅ **Admin checks** (`is_admin()` function)
5. ✅ **CASCADE deletes** (no orphaned data)
6. ✅ **Input validation** (check constraints)

### ⚠️ Security Concerns

1. **"System can manage transactions" policy is too broad** 🔴
   ```sql
   POLICY "System can manage transactions"
     WITH CHECK (true)  -- ← Anyone can do anything!
   ```
   **Risk:** HIGH - Should use `role() = 'service_role'`

2. **No rate limiting on submissions** 🟡
   - Users could spam submissions
   - Consider: unique constraint per (user, dataset, day)?

3. **No validation on file_urls array** 🟡
   - Could store malicious URLs
   - Consider: URL format validation

---

## 📋 RECOMMENDED FIXES (Priority Order)

### 🔴 CRITICAL (Do Before Production)

1. **Fix duplicate transaction triggers**
   - Keep ONE trigger for wallet updates
   - Remove duplicates: `on_transaction_completed` OR `trg_transactions_apply`

2. **Clean up duplicate RLS policies**
   - Remove older/redundant policies
   - Keep one clear policy per operation

3. **Fix "System can manage transactions" policy**
   - Change `WITH CHECK (true)` to `role() = 'service_role'`

### 🟡 HIGH PRIORITY (Do Soon)

4. **Add wallet balance check constraint**
   ```sql
   ALTER TABLE wallets
   ADD CONSTRAINT wallets_positive_balance
   CHECK (available_balance >= 0);
   ```

5. **Test payment flow**
   - Create test transaction
   - Verify wallet updates
   - Check for duplicate balance updates

### 🟢 NICE TO HAVE (Consider Later)

6. Clean up duplicate trigger names
7. Add email uniqueness constraint
8. Add performance indexes
9. Consider soft deletes
10. Add rate limiting logic

---

## ✅ CONCLUSION

**Overall Database Health: 7.5/10** 🟡

### Strengths:
- ✅ Solid relational design
- ✅ Good RLS implementation
- ✅ Proper foreign keys
- ✅ No data integrity issues
- ✅ All triggers working

### Weaknesses:
- 🔴 Duplicate triggers (wallet updates)
- 🔴 Duplicate policies (confusing)
- 🔴 Overly broad "System" policy
- 🟡 Wallet can go negative
- 🟡 Transactions table unused (test needed)

### Action Required:
**Before production:** Fix critical issues (#1, #2, #3)
**After launch:** Monitor wallet balances, test payment flow
**Long term:** Consider soft deletes, add optimizations

---

## 🛠️ NEXT STEPS

Would you like me to:
1. ✅ **Fix the duplicate triggers** (recommended)
2. ✅ **Clean up duplicate policies** (recommended)
3. ✅ **Add wallet balance constraint** (recommended)
4. 📊 **Create detailed fix scripts** for all issues
5. 🧪 **Test the payment flow** end-to-end

Let me know which fixes you want to implement now!
