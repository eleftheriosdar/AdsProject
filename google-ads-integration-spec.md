# Google Ads API Integration Specification

**Version:** 1.0  
**Status:** Draft  
**Date:** March 2026  
**Audience:** Engineering Team

---

## 1. Overview

This document specifies the technical integration between the PPC AI Agent and the Google Ads API. It covers OAuth 2.0 authentication, API client setup, data models, report queries, error handling, and rate limit management.

The integration is server-side only. No Google Ads credentials or tokens are ever exposed to the client browser.

---

## 2. Prerequisites

Before implementation, the following must be in place:

1. **Google Cloud Project** with the Google Ads API enabled.
2. **OAuth 2.0 Client ID and Secret** (Web Application type) from Google Cloud Console.
3. **Developer Token** — applied for via Google Ads API Centre. Basic access (10,000 operations/day) is sufficient for MVP. Standard access should be applied for at launch.
4. **Test Account** — a Google Ads test account (sandbox) for development and CI/CD pipelines.

---

## 3. Authentication Flow

The app uses OAuth 2.0 with the Authorization Code flow. All token operations are handled server-side.

### 3.1 Scopes

```
https://www.googleapis.com/auth/adwords
```

This single scope grants access to all Google Ads API resources the user's account can access.

### 3.2 Redirect URI

```
https://app.ppcagent.com/api/auth/google-ads/callback
```

Register all environments (production, staging, localhost) in Google Cloud Console.

### 3.3 Authorization Flow

**Step 1 — Generate authorization URL (server)**

```javascript
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_ADS_CLIENT_ID,
  process.env.GOOGLE_ADS_CLIENT_SECRET,
  process.env.GOOGLE_ADS_REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',       // Required for refresh token
  prompt: 'consent',            // Always show consent; forces refresh token issuance
  scope: ['https://www.googleapis.com/auth/adwords'],
  state: encodeURIComponent(JSON.stringify({ userId, csrfToken }))
});
```

**Step 2 — Exchange code for tokens (callback handler)**

```javascript
async function handleCallback(req, res) {
  const { code, state } = req.query;
  const { userId, csrfToken } = JSON.parse(decodeURIComponent(state));

  // Validate CSRF token
  if (!validateCsrf(csrfToken, req.session)) {
    return res.status(400).json({ error: 'Invalid state parameter' });
  }

  const { tokens } = await oauth2Client.getToken(code);
  // tokens = { access_token, refresh_token, expiry_date, token_type, scope }

  // Encrypt and persist
  await db.googleAdsConnections.upsert({
    where: { userId },
    create: {
      userId,
      accessToken: encrypt(tokens.access_token),
      refreshToken: encrypt(tokens.refresh_token),
      tokenExpiry: new Date(tokens.expiry_date),
    },
    update: { ... }
  });

  // Trigger initial sync
  await queue.add('initialSync', { userId });
}
```

**Step 3 — Token refresh (automatic)**

```javascript
async function getValidAccessToken(userId) {
  const conn = await db.googleAdsConnections.findUnique({ where: { userId } });
  
  const expiryBuffer = 5 * 60 * 1000; // Refresh 5 min before expiry
  if (conn.tokenExpiry.getTime() - Date.now() < expiryBuffer) {
    oauth2Client.setCredentials({
      refresh_token: decrypt(conn.refreshToken)
    });
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    await db.googleAdsConnections.update({
      where: { userId },
      data: {
        accessToken: encrypt(credentials.access_token),
        tokenExpiry: new Date(credentials.expiry_date)
      }
    });
    
    return credentials.access_token;
  }
  
  return decrypt(conn.accessToken);
}
```

### 3.4 Token Security

- Tokens are encrypted using AES-256-GCM before database storage.
- Encryption key is stored in environment variables (never in code or database).
- Refresh tokens are long-lived; access tokens expire after 1 hour.
- On user disconnection, tokens are deleted from the database immediately and the app calls the Google token revocation endpoint.

```javascript
async function revokeAccess(userId) {
  const conn = await db.googleAdsConnections.findUnique({ where: { userId } });
  const accessToken = decrypt(conn.accessToken);
  
  // Revoke with Google
  await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
    method: 'POST'
  });
  
  // Delete from database
  await db.googleAdsConnections.delete({ where: { userId } });
}
```

---

## 4. Google Ads API Client Setup

Use the official `google-ads-api` Node.js library.

```bash
npm install google-ads-api
```

### 4.1 Client Initialisation

```javascript
import { GoogleAdsApi } from 'google-ads-api';

const client = new GoogleAdsApi({
  client_id: process.env.GOOGLE_ADS_CLIENT_ID,
  client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
});

// Create a customer instance per API call
function getCustomer(customerId, accessToken) {
  return client.Customer({
    customer_id: customerId,
    refresh_token: null,         // We manage tokens manually
    access_token: accessToken,   // Pass pre-refreshed token
  });
}
```

### 4.2 MCC (Manager Account) Support

If the user authenticates via a Manager Account (MCC), enumerate child accounts:

```javascript
async function listAccessibleAccounts(accessToken) {
  const customer = getCustomer('', accessToken); // Empty for MCC enumeration
  
  const response = await customer.query(`
    SELECT
      customer_client.id,
      customer_client.descriptive_name,
      customer_client.currency_code,
      customer_client.time_zone,
      customer_client.manager
    FROM customer_client
    WHERE customer_client.level = 1
      AND customer_client.status = 'ENABLED'
    ORDER BY customer_client.descriptive_name ASC
  `);
  
  return response.map(r => ({
    id: r.customer_client.id,
    name: r.customer_client.descriptive_name,
    currency: r.customer_client.currency_code,
    timezone: r.customer_client.time_zone,
    isManager: r.customer_client.manager,
  }));
}
```

---

## 5. Data Sync

### 5.1 Sync Architecture

Data is pulled on a schedule and cached in the application database. This ensures the AI has data available without latency and protects against API rate limits.

- **Initial sync:** Full 90-day history pulled on first connection.
- **Daily sync:** Runs at 06:00 UTC. Pulls prior day's data for all active accounts.
- **Manual sync:** Available to users via a "Refresh" button (rate-limited to once per hour).

### 5.2 Campaign Performance Report

Pulls daily aggregated metrics per campaign.

```javascript
async function syncCampaignMetrics(customerId, accessToken, dateRange) {
  const customer = getCustomer(customerId, accessToken);
  
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign.bidding_strategy_type,
      campaign_budget.amount_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.average_cpc,
      metrics.ctr,
      metrics.average_cpm,
      metrics.search_impression_share,
      segments.date
    FROM campaign
    WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      AND campaign.status != 'REMOVED'
    ORDER BY segments.date DESC, metrics.cost_micros DESC
  `;
  
  const rows = await customer.query(query);
  
  // Transform and upsert to database
  const metrics = rows.map(row => ({
    googleCampaignId: String(row.campaign.id),
    customerId,
    name: row.campaign.name,
    status: row.campaign.status,
    date: row.segments.date,
    budgetMicros: row.campaign_budget.amount_micros,
    impressions: row.metrics.impressions,
    clicks: row.metrics.clicks,
    costMicros: row.metrics.cost_micros,
    conversions: row.metrics.conversions,
    conversionsValue: row.metrics.conversions_value,
    averageCpcMicros: row.metrics.average_cpc,
    ctr: row.metrics.ctr,
    searchImpressionShare: row.metrics.search_impression_share,
  }));
  
  await db.campaignMetrics.createMany({ data: metrics, skipDuplicates: true });
}
```

### 5.3 Keyword Performance Report

Includes quality score components — critical for the AI's QS recommendations.

```javascript
async function syncKeywordMetrics(customerId, accessToken, dateRange) {
  const customer = getCustomer(customerId, accessToken);
  
  const query = `
    SELECT
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      ad_group_criterion.quality_info.quality_score,
      ad_group_criterion.quality_info.creative_quality_score,
      ad_group_criterion.quality_info.post_click_quality_score,
      ad_group_criterion.quality_info.search_predicted_ctr,
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.average_cpc,
      metrics.average_position,
      segments.date
    FROM keyword_view
    WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      AND ad_group_criterion.status != 'REMOVED'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 1000
  `;
  
  return await customer.query(query);
}
```

### 5.4 Search Term Report

Used by the AI to identify negative keyword opportunities.

```javascript
async function syncSearchTerms(customerId, accessToken, dateRange) {
  const customer = getCustomer(customerId, accessToken);
  
  const query = `
    SELECT
      search_term_view.search_term,
      search_term_view.status,
      campaign.id,
      campaign.name,
      ad_group.id,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.ctr,
      segments.date
    FROM search_term_view
    WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      AND metrics.impressions > 0
    ORDER BY metrics.cost_micros DESC
    LIMIT 2000
  `;
  
  return await customer.query(query);
}
```

### 5.5 Ad Performance Report

```javascript
async function syncAdMetrics(customerId, accessToken, dateRange) {
  const customer = getCustomer(customerId, accessToken);
  
  const query = `
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.type,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions,
      ad_group_ad.status,
      ad_group_ad.policy_summary.approval_status,
      ad_group_ad.ad_strength,
      campaign.id,
      ad_group.id,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.ctr,
      segments.date
    FROM ad_group_ad
    WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      AND ad_group_ad.status != 'REMOVED'
    ORDER BY metrics.impressions DESC
  `;
  
  return await customer.query(query);
}
```

---

## 6. Write Operations (Phase 2)

Write operations are not part of the MVP. When implemented, they must follow these rules:

1. **User confirmation required** for every write operation — no autonomous changes without explicit approval.
2. **Audit log** — every write is recorded with user_id, timestamp, entity affected, old value, and new value.
3. **Reversible** — the system must be able to undo any change within 24 hours.
4. **Rate limiting** — no more than 50 write operations per day per account (configurable).

Planned write operations for Phase 2:

- Update keyword bids (`ad_group_criterion.cpc_bid_micros`)
- Update campaign budgets (`campaign_budget.amount_micros`)
- Add negative keywords (`shared_criterion` or `ad_group_criterion` with `negative: true`)
- Pause/enable keywords (`ad_group_criterion.status`)
- Update ad group bid adjustments

---

## 7. Error Handling

### 7.1 Error Categories

| Error Type | HTTP Code | Handling |
|---|---|---|
| `AUTHENTICATION_ERROR` | 401 | Refresh token; if refresh fails, notify user to reconnect |
| `AUTHORIZATION_ERROR` | 403 | Check user has sufficient permissions |
| `RATE_LIMIT_EXCEEDED` | 429 | Exponential backoff (see §7.2) |
| `INVALID_ARGUMENT` | 400 | Log and surface to developer; never surface raw to user |
| `RESOURCE_NOT_FOUND` | 404 | Mark entity as removed in local DB |
| `QUOTA_EXCEEDED` | 429 | Queue for next day; notify user of delay |
| `INTERNAL_ERROR` | 500 | Retry up to 3 times; then alert engineering |

### 7.2 Retry Strategy

```javascript
async function withRetry(fn, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      const isRetryable = [
        'RATE_LIMIT_EXCEEDED',
        'INTERNAL_ERROR',
        'TRANSIENT_ERROR',
      ].includes(error.code);
      
      if (!isRetryable) throw error;
      
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      const jitter = Math.random() * 1000;
      await sleep(delay + jitter);
    }
  }
}
```

### 7.3 User-Facing Errors

Never expose raw API errors to users. Map to friendly messages:

- Auth error → "Your Google Ads connection has expired. Please reconnect your account."
- Rate limit → "We're processing a lot of data right now. Your report will be ready within the hour."
- General API error → "We couldn't fetch your latest data. We'll retry automatically and notify you when it's available."

---

## 8. Rate Limits

Google Ads API enforces the following limits (as of API v17):

| Limit | Value |
|---|---|
| Operations per day (basic access) | 10,000 |
| Operations per day (standard access) | 15,000 |
| Max results per page | 10,000 rows |
| Concurrent requests | 5 per developer token |

### 8.1 Optimisation Strategies

All queries must use `LIMIT` and date range filters to minimise row counts. Pagination must be implemented for queries that may exceed 10,000 rows.

Queries are batched per account and queued via BullMQ. Non-urgent syncs (historical data) are rate-limited to 2 requests per second. Urgent syncs (user-triggered) are given priority queue position.

A usage tracker logs operations per day per developer token. If daily usage exceeds 80% of the quota, the scheduler reduces sync frequency and alerts engineering.

---

## 9. Data Model (Canonical)

Micros to standard currency conversion: all Google Ads monetary values are returned in micros (1,000,000 = £1). Convert on ingest before storing.

```javascript
// Conversion helper
const microsToCurrency = (micros) => micros / 1_000_000;

// ROAS calculation
const calculateRoas = (conversionsValue, costMicros) => {
  const cost = microsToCurrency(costMicros);
  if (cost === 0) return 0;
  return (conversionsValue / cost) * 100; // As percentage
};
```

---

## 10. Testing

### 10.1 Unit Tests

Test data transformation functions in isolation. Mock all Google Ads API calls.

### 10.2 Integration Tests

Use a Google Ads test account (sandbox). Test accounts do not incur charges and return realistic API responses. Required tests:

- OAuth flow (authorization URL generation, token exchange, refresh)
- Campaign report query returns expected shape
- Keyword report includes quality score fields
- Error handling for 401, 429, 500
- MCC account enumeration

### 10.3 End-to-End Tests

Automated Playwright tests covering the full onboarding flow using a test Google account. Run on every PR targeting main.

---

## 11. Environment Variables

```bash
# Google OAuth
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REDIRECT_URI=https://app.ppcagent.com/api/auth/google-ads/callback
GOOGLE_ADS_DEVELOPER_TOKEN=

# Encryption
TOKEN_ENCRYPTION_KEY=   # 32-byte random key, base64-encoded

# API
NEXT_PUBLIC_API_URL=https://api.ppcagent.com

# AI
ANTHROPIC_API_KEY=

# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
```

All secrets must be stored in the deployment platform's secret manager (Vercel Environment Variables for frontend; Railway Secrets for backend). Never commit secrets to version control.

---

## 12. API Version Policy

This specification targets **Google Ads API v17**. Google deprecates API versions on a rolling ~12-month cycle. Engineering must monitor the Google Ads API release notes and plan upgrades at least 3 months before a version's sunset date.

Subscribe to: https://ads-developers.googleblog.com/

---

*End of Integration Specification v1.0*
