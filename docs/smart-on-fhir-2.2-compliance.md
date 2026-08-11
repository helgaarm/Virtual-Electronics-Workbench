# SMART on FHIR 2.2 and Norwegian/Helsenorge compliance assessment

**Assessment date:** 11 August 2026  
**Assessment target:** the current Virtual Electronics Workbench repository  
**Claimed status:** **not implemented and not compliant**

## Purpose and scope

This document records the repository's current position against the [SMART App Launch 2.2.0
Implementation Guide](https://hl7.org/fhir/smart-app-launch/STU2.2/). It also identifies the
additional decisions and work expected for a Norwegian deployment involving Helsenorge and
HelseID. It is an engineering gap analysis, not a certification, security assessment, legal
opinion, or statement of approval by HL7, Norsk helsenett, or Helsenorge.

The application is currently an educational electronics workbench. Its domain model contains
physical circuit projects, instruments, simulation, and PCB data; its server persists those
projects through a loopback HTTP API. It has no healthcare use case, FHIR endpoint, OAuth/OIDC
client, identity integration, patient context, or health data model. SMART conformance is therefore
not presently applicable to a released feature, and the project **must not advertise SMART on FHIR
or Helsenorge compliance**.

## Assessment method and interpretation

The assessment maps externally visible protocol behavior to the current codebase. The terms
**SHALL**, **SHOULD**, and **MAY** below retain their standards meaning only when summarizing a
normative source. A row marked “gap” means no implementation or conformance evidence exists in
this repository; it does not mean the requirement can be met by documentation alone.

Before implementation, the team must confirm the exact Helsenorge integration product, current
environment-specific documentation, applicable Norwegian FHIR implementation guides, and
onboarding agreement with the relevant service owner. Those requirements can change independently
of this dated assessment.

## SMART App Launch 2.2 baseline

| Area | SMART 2.2 expectation | Repository evidence | Status / work required |
| --- | --- | --- | --- |
| FHIR API | A compatible FHIR server exposes the resources and interactions granted to the app and reports a FHIR version. | The server exposes only project CRUD endpoints and stores electronics project JSON. | **Gap:** select the supported FHIR release and profiles; implement or integrate a conformant FHIR server, including capability and error behavior. |
| Discovery | The authorization server publishes `/.well-known/smart-configuration` with authorization, token, registration (when offered), capability, scope, and key metadata. | No SMART discovery document or metadata endpoint exists. | **Gap:** publish and validate environment-specific metadata over TLS. Do not hard-code production endpoints in the client. |
| Authorization | Apps use OAuth 2.0 authorization-code flow and request only registered redirect URIs and necessary scopes. The app validates `state`; public clients use PKCE with `S256`. | There is no OAuth client, redirect handler, state binding, PKCE, or scope processing. | **Gap:** implement a maintained OAuth/OIDC client boundary, exact redirect matching, cryptographically random state and verifier values, callback error handling, and least-privilege scopes. |
| Launch context | EHR launch uses `iss` and `launch`; standalone launch obtains context through authorized scopes. Returned context such as `patient`, `encounter`, and `fhirContext` is treated as server-provided input. | No launch endpoint or clinical context model exists. | **Gap:** define the supported launch modes and strictly validate issuer, launch parameters, returned context, and cross-issuer mix-ups. |
| SMART scopes | SMART v2 scopes describe context, resource types, interactions, and search constraints; identity and refresh access use distinct scopes such as `openid`, `fhirUser`, and `offline_access`. | No scope parser, scope allow-list, or authorization policy exists. | **Gap:** define a minimum scope matrix per use case and enforce the granted, not merely requested, scope set. Reject unsupported syntax. |
| Client authentication | Confidential clients authenticate at the token endpoint; SMART 2.2 supports asymmetric client authentication and published client keys. Public clients do not embed a secret. | No client registration, key set, assertion validation, or secret handling exists. | **Gap:** choose the client type with the service owner. Prefer asymmetric credentials where required; implement key rotation, audience and replay checks, and secret storage outside the repository. |
| Token use | Bearer access tokens are sent only to the authorized FHIR base URL; clients honor expiry, granted scopes, refresh-token policy, and authorization errors. | No token acquisition, storage, refresh, revocation, or FHIR request layer exists. | **Gap:** keep tokens out of URLs, logs, browser persistence, project files, and telemetry; bind tokens to the correct issuer/resource server and handle expiry or revocation safely. |
| User identity | When identity is requested, OIDC discovery and ID-token validation cover issuer, audience, signature, time, and nonce; `fhirUser` identifies a FHIR resource and is not itself an authorization decision. | No OIDC validation or user model exists. | **Gap:** use a proven OIDC library and keep authentication, person matching, launch context, and authorization as separate decisions. |
| Security and transport | Production endpoints use TLS and normal web protections; untrusted launch parameters, metadata, FHIR content, and OAuth errors are validated. | The current API is deliberately loopback-only and has no production health-data security boundary. | **Gap:** perform threat modelling, security testing, dependency review, audit design, and production TLS configuration before processing health data. |
| Conformance evidence | A deployable app documents supported launch modes/capabilities and is tested against the target authorization and FHIR servers, including negative paths. | There are no SMART fixtures, tests, capability declaration, or test results. | **Gap:** add automated protocol, interoperability, negative, and target-environment acceptance tests. Archive versioned evidence. |

## Norwegian and Helsenorge-specific changes

SMART App Launch defines a general authorization and launch protocol. It does not replace national
identity, authorization, consent, privacy, terminology, or service-onboarding rules. For a
Helsenorge integration, the following are additional constraints or open decisions, not deviations
that may silently weaken SMART controls.

### 1. HelseID and trust framework

The integration is expected to use the identity and access mechanism designated by the Helsenorge
service owner, commonly HelseID for Norwegian health-sector APIs. Registration, approved grant and
client-authentication method, issuer, audience/resource indicators, scopes, key material, and test
and production endpoints must come from current official onboarding material. SMART metadata and
HelseID metadata must be reconciled explicitly; a successful HelseID login alone does not prove
SMART, FHIR, or application authorization compliance.

**Known gap:** the repository has no HelseID client, organization/user identity handling, token
validation, key rotation, or environment configuration. Do not invent Norwegian claims, scopes,
audiences, or person identifiers from examples.

### 2. Helsenorge onboarding and deployment

Helsenorge publication or API access may require service-owner approval, client registration,
security and privacy documentation, accepted redirect/logout URIs, branding and accessibility
review, operational contacts, and separate test/production approval. Exact obligations depend on
whether the product is an embedded app, a citizen-facing service, or a system-to-system client.

**Known gap:** no integration type, data controller/processor roles, agreement, owner, environment,
or approval evidence has been selected. These are release gates, not future cleanup tasks.

### 3. Norwegian FHIR profiles, identifiers, and terminology

Base FHIR resources are insufficient when the target API mandates Norwegian profiles, extensions,
code systems, value sets, identifier systems, search parameters, or reference rules. The exact
package and version must be pinned per API. Validation must include profile, cardinality, slicing,
reference, terminology, and `OperationOutcome` handling.

**Known gap:** there is no FHIR release selection, package dependency, profile validator,
terminology service, identifier policy, or compatibility/migration strategy. The electronics
project schema must never be repurposed as a clinical record format.

### 4. Norwegian identity and representation

A citizen, healthcare professional, organization, dependent, guardian, or authorized representative
may have different rights and context. National identifiers and professional or organizational
claims are sensitive inputs; they must be validated and used only under the documented purpose.
Authentication must not be treated as proof of treatment relationship, consent, representation, or
permission to access a resource.

**Known gap:** the application has no model or policy for actor, organization, representation,
consent, reservation, or access decision. The product owner must define these with Helsenorge before
any UI or data access is implemented.

### 5. Privacy, patient safety, accessibility, and language

A Norwegian health service needs a documented lawful purpose, data minimization, retention and
deletion rules, data-subject handling, incident response, and a decision on whether a data
protection impact assessment is required. Logs and support tooling must avoid tokens, national
identifiers, and clinical content unless specifically justified and protected. User-facing errors
must not leak health data. The applicable Helsenorge experience, accessibility, Norwegian-language,
and clinical-safety requirements must be confirmed and tested.

**Known gap:** existing project persistence, logs, backup/recovery, UI, and threat model were not
designed for health data. They are not approved storage or presentation mechanisms for such data.

### 6. Norwegian operations and assurance

Production design must establish data residency and subprocessors, encryption and key management,
least privilege, tamper-resistant audit events, monitoring, incident notification, continuity,
backup/recovery, vulnerability management, and retention. Audit data must distinguish the acting
user, represented person (if any), organization, client, purpose/context, target resource, decision,
and time without copying unnecessary clinical content.

**Known gap:** no health-sector risk assessment, operational agreement, audit event model,
penetration test, recovery exercise, or production assurance evidence exists.

## Required implementation and release gates

1. **Define the use case and owner.** Document user group, launch mode, integration product, data
   purpose, controller/processor roles, resource operations, and why each item of data is needed.
2. **Obtain authoritative requirements.** Record dated links or supplied documents from HL7,
   Helsenorge, Norsk helsenett/HelseID, the target FHIR API owner, and the applicable Norwegian FHIR
   profile publisher. Resolve conflicts with the service owner in writing.
3. **Create a versioned conformance statement.** Pin SMART, FHIR, profile/package, terminology, OAuth
   metadata, and API versions. List supported capabilities and explicitly unsupported optional
   behavior.
4. **Design trust boundaries.** Threat-model browser/server responsibilities, issuer selection,
   redirects, token and key custody, FHIR base URL binding, authorization, representation, logging,
   storage, and logout/revocation. Health data must not enter current project persistence by default.
5. **Implement standards behind dedicated boundaries.** Keep OAuth/OIDC, FHIR transport and
   validation, authorization policy, clinical domain data, and UI separate. Use maintained protocol
   libraries rather than hand-written cryptography or token parsing.
6. **Test positive and negative behavior.** Cover discovery, PKCE, state/nonce, issuer/audience,
   signatures and rotation, replay, expiry, granted-scope reduction, malformed content, profile
   validation, authorization denial, representative context, logout/revocation, and audit behavior.
7. **Complete external acceptance.** Pass the target providers' conformance/onboarding process,
   privacy and security reviews, accessibility and language review, penetration testing, incident
   and recovery exercises, and production-readiness approval.
8. **Maintain evidence.** Assign owners and review dates. Reassess on any SMART, HelseID, FHIR,
   profile, authorization policy, dependency, deployment, or Helsenorge requirement change.

No production release handling Norwegian health data should pass while any mandatory gate is open.

## Evidence register

| Evidence | Current value | Owner | Review trigger |
| --- | --- | --- | --- |
| SMART version | Target proposed: 2.2.0; not implemented | Unassigned | Standards or target-server change |
| FHIR release and national profile package | Not selected | Unassigned | API/product selection |
| Helsenorge integration type and onboarding terms | Not selected or obtained | Unassigned | Product definition |
| HelseID registration and metadata | Not present | Unassigned | Environment onboarding |
| Scope/resource-operation matrix | Not present | Unassigned | Use-case or API change |
| Privacy, risk, and threat assessments | Not present | Unassigned | Data-flow or deployment change |
| Interoperability and acceptance results | Not present | Unassigned | Every release/environment change |
| External approval/certification | None claimed | Unassigned | Approval status change |

## Authoritative references to verify during implementation

- [HL7 SMART App Launch 2.2.0](https://hl7.org/fhir/smart-app-launch/STU2.2/)
- [HL7 FHIR R4 specification](https://hl7.org/fhir/R4/)
- [HelseID documentation](https://utviklerportal.nhn.no/informasjonstjenester/helseid/)
- [Helsenorge](https://www.helsenorge.no/)
- [Norwegian FHIR implementation guides](https://simplifier.net/organization/hl7norway)

External references are starting points. The implementation team must preserve the precise version
and onboarding documents actually supplied for the selected Helsenorge service and environment.
