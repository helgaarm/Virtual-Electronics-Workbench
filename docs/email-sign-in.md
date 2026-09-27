# Email sign-in for Sites

The email-code flow is implemented and tested, but is inactive until Resend and the runtime
settings below are configured. The current Sites audience and gateway sign-in stay in place
during setup. Local SQLite remains independent and never requires an email, Resend, or internet.

## Configure Resend

1. Create a Resend account and verify a sending domain you control with its DNS records.
2. Create a sending-only API key limited to that domain.
3. Choose an address on the verified domain, such as `login@your-domain.example`.
4. Enter the key directly into the existing Site's environment settings as a secret. Do not
   paste it into chat, source code, a browser build, or a deployment archive.

Only email delivery uses Resend. The Worker, code verification, sessions, access list, project
authorization, and database remain in Sites. There is no external authentication database.

## Runtime settings

These are **server-side Sites settings**, not `VITE_` variables or local Express settings.

| Key | Purpose |
| --- | --- |
| `AUTH_MODE` | Leave unset or `sites` during setup; set `email` only for activation. Other values fail closed. |
| `RESEND_API_KEY` | Secret sending-only Resend key. |
| `AUTH_EMAIL_FROM` | Bare address on the verified sender domain. |
| `EMAIL_AUTH_SECRET` | Secret with at least 32 random bytes of entropy; generate with a cryptographic generator, encoded as hex or base64. Never reuse the Resend key. |
| `EMAIL_ALLOWED_ADDRESSES` | Comma-separated complete list of addresses that may sign in. Empty or invalid lists fail closed. |
| `LEGACY_PROJECT_OWNER_EMAIL` | Verified Site owner's email, used for the one-time copy of existing shared projects. Never assign this to the first visitor. |

Start the allowlist from the Site's actual owner and approved visitors, preserving their access.
Do not commit people's real addresses to example files. Only the owner should change the allowlist
or legacy owner setting. Removing an address denies its existing sessions on subsequent API requests.
Changing a Sites environment setting requires redeployment to take effect.

## Activate without exposing projects

Sites audience and application sign-in are separate controls. To use email codes without first
signing into ChatGPT, the login page must be reachable outside the current restricted audience.
That requires an explicit audience change through Sites; do not make that change merely to deploy.

1. Deploy the additive authentication migration and code with the current audience unchanged.
2. Configure all runtime settings, including the approved allowlist and original owner's email.
3. Set `AUTH_MODE=email` and redeploy while the Sites gateway still restricts the audience.
4. Verify actual Resend delivery to an approved address, code redemption, owner project recovery,
   and save/open. Codes are never returned by a debug API; use the delivered email.
5. With the owner's authorization, make the Sites login page publicly reachable. The application
   still requires an approved email and valid session for every project API operation.
6. Confirm an anonymous project request returns 401, a non-approved email sends no email, and two
   accounts cannot read, overwrite, list, or delete each other's projects.

No invitation email or real login code is sent automatically during development. Tests use
synthetic accounts and a mocked Resend transport; real delivery needs the configured domain/key.

## Behavior and protection

- Codes contain eight random digits, expire after ten minutes, allow at most five attempts,
  and are consumed with an atomic database update. Resending replaces the previous code.
- Only approved addresses receive mail. Request responses do not disclose allowlist membership.
- Persistent limits permit one message per address per minute, five per hour, twenty total per
  minute, and one thousand total per day. Limits are enforced before sending mail.
- Codes, rate-limit identities, and session tokens are stored as HMAC digests. Plain codes are
  sent only to Resend and the recipient; tokens exist only in secure cookies and responses.
- Sessions expire after seven days and use a `__Host-` cookie with `Secure`, `HttpOnly`,
  `SameSite=Strict`, and `Path=/`. Logout revokes the database session.
- Writes require a same-origin request. Project access uses the verified session email, never an
  email from project JSON or a client account header. The account header only prevents a stale
  tab from saving to a different account after another tab changes the cookie.
- Project documents keep the same schema and stable IDs. A compound database key isolates the
  same project ID in two different accounts. Optimistic concurrency remains enforced per account.
- Expired records are removed in bounded, indexed batches on subsequent allowed code requests.
- The workbench still uses explicit Save/Save as. Adding sign-in does not introduce autosave.

## Migration and recovery

`drizzle/0001_email_auth.sql` adds authentication tables and `account_projects` without modifying
the original `projects` table or its schema version. `auth_schema` independently guards version 1
of the authentication schema. Do not edit an applied migration.

At the configured owner's first successful email login, a transaction copies the original shared
collection into that owner's account without overwriting existing account projects, then records
completion. Guest accounts begin with their own collection. Repeated logins do not resurrect
deleted projects. Original shared rows remain available for deliberate recovery.

If activation fails, restore the restricted Sites audience **before** disabling email mode or
rolling back to a gateway-only version. Keep both sets of tables: account changes are not mirrored
back into the old shared collection. Export verified account documents before any later recovery
or ownership changes. Rotating `EMAIL_AUTH_SECRET` invalidates outstanding codes and sessions.

## Validation

Regression tests cover code expiry, incorrect attempts, resend, concurrent redemption, logout,
removed access, rate limits, CSRF, account isolation, stale tabs, failed delivery, invalid
configuration, additive migration and preservation of old documents. Browser smoke testing uses
the real Worker with a local SQLite D1 adapter and simulated delivery at desktop and narrow widths.

## References

- [Sites audience, identity and environment settings](https://learn.chatgpt.com/docs/sites)
- [Resend domains](https://resend.com/docs/dashboard/domains/introduction)
- [Resend API keys](https://resend.com/docs/dashboard/api-keys/introduction)
- [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email)
- [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
