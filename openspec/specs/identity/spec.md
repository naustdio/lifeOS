# Identity Specification

## Purpose

Defines Google-OAuth-only sign-in, profile creation, the zero-ceremony auto-created single-member personal space, and the sharing-ready-but-hidden RLS tenancy model that every other module's rows depend on.

## Requirements

### Requirement: Google OAuth Only
The system MUST authenticate users exclusively via Google OAuth through Supabase Auth. No other sign-in method (email/password, magic link, other OAuth providers) MUST be offered.

#### Scenario: Only Google sign-in is offered
- GIVEN a user visits the sign-in screen
- WHEN the available sign-in options are inspected
- THEN only "Sign in with Google" is presented

### Requirement: Auto-Created Personal Space on First Sign-In
On a user's first successful Google sign-in, the system MUST automatically create a `core.profiles` row, a `core.households` row, and a `core.household_members` row linking the user to that household with role `owner`, without presenting any setup screen, space-naming prompt, or "who will use this" question.

#### Scenario: First sign-in creates profile and personal space silently
- GIVEN a user completes Google OAuth for the first time
- WHEN sign-in completes
- THEN a profile, a household, and a household_members row (role=owner) exist for that user, and the user lands directly on the dashboard with no intermediate setup screen

#### Scenario: Returning user does not get a duplicate space
- GIVEN a user who already has a profile and household signs in again
- WHEN sign-in completes
- THEN no new household or household_members row is created; the existing ones are reused

### Requirement: Household Terminology Hidden From UI
No screen MUST display the words "household" or "hogar," ask the user to select or switch between spaces, or ask "who paid" for an expense, even though the underlying schema is multi-tenant-ready.

#### Scenario: No household language anywhere in the UI
- GIVEN any authenticated screen in the app
- WHEN its rendered text is inspected
- THEN neither "household" nor "hogar" appears, and no space-selection control is present

### Requirement: Roles Are Owner or Member Only
The system MUST support exactly two membership roles, `owner` and `member`, with no read-only `viewer` role.

#### Scenario: Household member role is constrained
- GIVEN a `core.household_members` row is created
- WHEN its `role` value is inspected
- THEN it is either `owner` or `member`; any other value is rejected

### Requirement: RLS Enforced by Household Membership
Row-Level Security policies on every tenant-scoped table (`core.*` and `finance.*`) MUST grant access based on the querying user's membership in the row's `household_id` via `core.household_members`, never by comparing directly against a `user_id` column, and MUST deny by default.

#### Scenario: Member can read own household's rows
- GIVEN a user is a member of household A
- WHEN the user queries a tenant-scoped table
- THEN only rows where `household_id` matches a household the user belongs to are returned

#### Scenario: Non-member is denied access
- GIVEN a user is not a member of household B
- WHEN the user attempts to read or write a row with `household_id = B`
- THEN RLS denies the operation and no row is returned or modified
