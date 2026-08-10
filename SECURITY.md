# Security Policy

## Supported versions

Security fixes are made on the latest `main` branch. Older commits, local modifications, and unofficial deployments are not separately supported.

This project is an educational electronics simulator. It is not a safety tool and must not be used to validate circuits for mains voltage, medical, automotive, industrial, or other safety-critical use.

## Report a vulnerability privately

Do not open a public issue or pull request for a suspected vulnerability.

Use GitHub's private vulnerability reporting form:

<https://github.com/helgaarm/Virtual-Electronics-Workbench/security/advisories/new>

Include, when possible:

- the affected commit or version;
- the vulnerable component and impact;
- minimal reproduction steps or a proof of concept;
- whether credentials or user data may have been exposed; and
- a suggested mitigation, if you have one.

Remove real secrets and personal data from the report. If the private form is unavailable, contact the repository owner privately through the contact method on the owner's GitHub profile and share only enough information to establish a secure reporting channel.

The maintainer will acknowledge a usable report, investigate it, coordinate a fix and disclosure where appropriate, and credit reporters who want public recognition. Please allow time for a safe fix before publishing details.

## If a secret is exposed

Treat a committed credential as compromised even if the commit is later removed. Revoke or rotate it at its provider first, review access logs and dependent systems, then coordinate repository cleanup privately. Never paste the replacement credential into GitHub, chat, logs, or an issue.
