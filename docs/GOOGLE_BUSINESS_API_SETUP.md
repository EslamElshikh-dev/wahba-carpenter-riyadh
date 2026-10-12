# Google Business Profile verification monitor

Prepared on 12 October 2026 for Wahba Carpenter, Riyadh.

## Observed readiness

- The existing website Vercel project was inspected: Node 24, static site with a Node API function. Internal hosting identifiers are intentionally omitted.
- No Google integration environment variables were present when inspected.
- Google Cloud returned **Site Unavailable** in the cloud browser. Reloading once and following Google's official credentials link did not restore access.
- Google Cloud project ID, project number, API approval and quota are **not verified**.
- No OAuth client was created, no account permissions were granted, and no verification request was initiated.

## Complete Google prerequisites

Use a project belonging to the owner. API access applications require managing a verified, active Business Profile for at least 60 days and a website representing that business listed on the profile. The qualifying profile can be the applicant's own business or a managed client. Do not claim an unknown verification date or infer uninterrupted activity from one completed verification record.

Check the selected Google Cloud project's API quota. Google's prerequisites page distinguishes 0 QPM (not approved) from 300 QPM (approved). Record the project number and observed quota before submitting a new application. Do not submit duplicate applications or silently replace an existing project.

For this monitor, enable My Business Account Management, My Business Business Information, and My Business Verifications APIs after access approval. Review Google's Basic Setup guidance for other API requirements applicable to the approved project.

Create or use a **Web application** OAuth client and register this exact redirect URI:

`https://wahba-carpenter-riyadh.vercel.app/api/gbp?action=callback`

Configure Google Auth Platform branding, audience and any required app review/test-user access. The site requests `openid`, `email`, and `https://www.googleapis.com/auth/business.manage`. Google does not provide a separate read-only scope for these calls; the application itself restricts operations to reading and fetching available options. Obtain the account owner's informed consent before granting the scope.

## Server-only Vercel configuration

Set these in the **Production** environment using the Vercel dashboard's secret/config controls. Do not send secrets in chat, add them to repository files, or put them in browser JavaScript. No production secrets are needed by Preview deployments.

| Variable | Purpose |
| --- | --- |
| `GBP_GOOGLE_CLIENT_ID` | Approved project's OAuth client ID |
| `GBP_GOOGLE_CLIENT_SECRET` | OAuth client secret; store as Secret |
| `GBP_SESSION_SECRET` | At least 32 cryptographically random bytes encoded as base64url (43+ characters); store as Secret |
| `GBP_ADMIN_EMAILS` | Comma-separated allowlist of confirmed, authorized administrator email addresses; configure privately in the server environment |
| `GBP_APP_ORIGIN` | `https://wahba-carpenter-riyadh.vercel.app` |
| `GBP_OAUTH_ENABLED` | `true` only after configuration and approval have been checked |

Deploy after setting configuration. Login verifies Google's RS256-signed ID token, issuer, audience, nonce, expiry, verified email and administrator allowlist. OAuth uses browser-bound state and PKCE. Access tokens are kept in encrypted, Secure, HttpOnly, host-only session cookies and never returned in JSON. There are no refresh tokens or unattended access; sessions last no more than one hour. Ending the monitor session clears its cookie; it does **not** revoke the Google account's existing app grant.

## Available operations

- List accounts from Account Management v1.
- List locations from Business Information v1 with a required readMask.
- Get VoiceOfMerchantState and verification history separately. A completed verification attempt does not itself prove that quality review has finished.
- Fetch the options Google currently returns. This POST retrieves options; it does not initiate a verification attempt.

The tool does not expose endpoints to create profiles, edit business details, initiate verification, submit PINs, transfer ownership, or delete data. Location resources come from the API response and must not be inferred from the Business Profile manager identifier or store code.

The target's observed Business Profile manager ID is `1310426400263731431`; match the location by the actual name **وهبة النجار**, phone **+966595080326**, and website before using its API resource name.

## Validation and limits

Run `node --test tests/gbp-api.test.mjs`, `npm run build`, and `npm run check`. Security tests use explicitly synthetic fixtures and do not authenticate with Google. A live Google OAuth/API test remains required after credentials and project approval are available. The interface never presents fixture data or the previous manual audit as a current API result.

## Official references

- https://developers.google.com/my-business/content/prereqs
- https://developers.google.com/my-business/content/basic-setup
- https://developers.google.com/my-business/content/implement-oauth
- https://developers.google.com/my-business/reference/verifications/rest/v1/locations/getVoiceOfMerchantState
- https://developers.google.com/my-business/reference/verifications/rest/v1/locations/fetchVerificationOptions
- https://developers.google.com/identity/openid-connect/openid-connect
- https://vercel.com/docs/functions/functions-api-reference
