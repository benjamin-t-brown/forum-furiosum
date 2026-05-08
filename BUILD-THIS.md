# forum-furiosum

I'd like to develop a simple web forum called Forum Furiosum, hosted on a VPS.
This document is the implementation-ready v1 spec.

# Goals

- Build a simple, old-school forum with modern responsive behavior.
- Keep stack simple: Node.js + TypeScript + Express + EJS + SQLite.
- Use secure defaults for auth and sessions.
- Keep v1 scope small and easy to deploy.

# Data Model

All primary keys should be random UUIDs.
All timestamps should be UTC ISO strings in API responses.
Use soft delete unless otherwise stated.

## Category

Represents forum grouping and home page sections.

- `id` (uuid)
- `slug` (string, unique, lowercase, `a-z0-9-`)
- `name` (string, unique)
- `description` (string, optional)
- `sortOrder` (integer)
- `isHidden` (boolean)
- `createdAt`, `updatedAt`

## Thread

A thread is a top-level discussion starter with many posts.

- `id` (uuid)
- `categoryId` (fk -> Category)
- `authorUserId` (fk -> User)
- `title` (string, required, 3-120 chars)
- `body` (text, required, 1-10000 chars)
- `approvalStatus` (enum: `new`, `approved`, `unapproved`, `unknown`)
- `isHidden` (boolean)
- `isDeleted` (boolean)
- `createdAt`, `updatedAt`
- `lastEditedAt` (nullable)
- `lastEditedByUserId` (nullable fk -> User)
- `lastEditedReason` (nullable string, max 280)

Notes:
- Thread list ordering defaults to newest activity.
- New post in thread updates thread `updatedAt`.
- Edit thread body/title updates `updatedAt` and `lastEdited*`.

## Post

A post is a reply inside a thread.

- `id` (uuid)
- `threadId` (fk -> Thread)
- `authorUserId` (fk -> User)
- `body` (text, required, 1-10000 chars)
- `approvalStatus` (enum: `new`, `approved`, `unapproved`, `unknown`)
- `isHidden` (boolean)
- `isDeleted` (boolean)
- `createdAt`, `updatedAt`
- `lastEditedAt` (nullable)
- `lastEditedByUserId` (nullable fk -> User)
- `lastEditedReason` (nullable string, max 280)

Notes:
- Body is plain text input; render escaped HTML.
- URL-like text can be linkified on render, but output must be sanitized.

## User

Represents a forum account.

- `id` (uuid)
- `username` (string, unique, `[A-Za-z0-9]`, length 3-24)
- `email` (string, unique, normalized lowercase)
- `passwordHash` (string)
- `passwordSalt` (string or encoded parameters if algorithm includes salt)
- `role` (enum: `admin`, `moderator`, `user`)
- `trust` (enum: `new`, `unknown`, `trusted`, `verified`, `banned`)
- `isDeleted` (boolean)
- `createdAt`, `updatedAt`
- `lastLoginAt` (nullable)

Avatar:
- 16x16 generated avatar from first letter of username.
- No custom uploads in v1.

## User Session / Auth Model

Use secure password hashing (Argon2id preferred; bcrypt acceptable fallback).
Use server-side session records.

- `sessionId` random opaque value
- `userId`
- `createdAt`, `expiresAt`, `lastSeenAt`
- optional `ipHash` / `userAgentHash` for abuse detection

Cookie requirements:
- `HttpOnly`, `SameSite=Lax`
- `Secure=true` in production
- explicit max age (example: 14 days)

## Moderation Audit Log

Track admin/mod actions.

- `id` (uuid)
- `actorUserId`
- `targetType` (`user|thread|post`)
- `targetId`
- `action` (e.g., `approve`, `hide`, `delete`, `role_change`, `trust_change`)
- `reason` (optional, max 500)
- `createdAt`

# Permissions and State Rules

## Role Matrix (v1)

- `user`
  - Can create/edit/delete own thread/post.
  - Can edit own profile basics.
  - Cannot see hidden/deleted/unapproved content from others.
- `moderator`
  - Can edit/hide/unhide/delete/approve any thread/post.
  - Can view hidden/unapproved content.
  - Can update user trust, but cannot promote to admin.
- `admin`
  - Full access to all moderator actions.
  - Can update any user role/trust.
  - Can access admin dashboard and customization settings.

## Content Visibility

For normal users:
- Show only `approvalStatus=approved`, `isHidden=false`, `isDeleted=false`.

For moderators/admins:
- Show all content with status badges.

## State Transitions

Allowed for thread/post `approvalStatus`:
- `new -> approved|unapproved|unknown`
- `unknown -> approved|unapproved`
- `unapproved -> approved|unknown`
- `approved -> unapproved` (mod/admin only)

`isDeleted=true` is soft-delete; content not visible to normal users.
`isHidden=true` keeps content for moderation but hidden from normal users.

# Tech

## Backend

- Node.js runtime
- npm package manager
- TypeScript codebase
- `tsx` for development runtime
- `tsc` build output for production, then run with `node`

## Database

- SQLite database file
- Migration tool required (any TS-friendly migration workflow)
- Enable WAL mode for better concurrent read/write behavior

## Routing Structure

Split server into API routes and web routes.

### API

- REST API using Express
- Version prefix: `/api/v1`
- Route groups: `public`, `auth-required`, `admin/mod`
- JSON response format:
  - success: `{ ok: true, data: ... }`
  - error: `{ ok: false, error: { code, message, details? } }`
- API docs required (OpenAPI preferred)

### Web

- EJS-rendered pages
- Server-rendered forms for create/update actions
- CSRF token on all state-changing form submissions

# Frontend (Server-rendered EJS)

## Web Interface

Visual style:
- Old-school early 2000s forum look.
- Minimal CSS and simple layouts.
- Responsive behavior for mobile breakpoints.

Behavior:
- Prefer normal HTML forms and full page reloads.
- Minimal JavaScript only where needed.

## Required Routes/Pages (v1)

- `/` home
- `/threads/:threadId` thread view
- `/register`
- `/login`
- `/logout` (POST)
- `/users/:userId` profile view
- `/users/:userId/edit` profile edit
- `/threads/new`
- `/threads/:threadId/edit`
- `/threads/:threadId/posts/new`
- `/posts/:postId/edit`
- `/admin`
- `/admin/posts/:postId/edit`
- `/admin/threads/:threadId/edit`
- `/admin/users/:userId/edit`

## Layout

- Main content centered with max width 1400px
- Top bar includes:
  - forum name
  - home link
  - login/signup or profile/logout depending on auth state
  - light/dark toggle
  - configurable custom links

## JavaScript

- Any client JS loaded as module scripts from this site.
- Use JSDoc comments on non-trivial client JS modules/functions.

## Theme

Light palette:
- `#8eb1c7`, `#b02e0c`, `#eb4511`, `#c1bfb5`, `#fefdff`
- text: `#000`, `#113`

Dark palette:
- `#223744`, `#5f1807`, `#722108`, `#434138`, `#c285ff`
- text: `#fff`, `#aab`

Additional rules:
- Support light/dark mode toggle.
- Persist preference in user profile if logged in, else cookie.
- Tile background image `tile.png`.

# Customizations

Per-deployment editable settings:
- forum display name
- top bar links
- featured categories on home page
- theme colors (within valid hex format)

Store customization in database or config file (implementation choice), but expose one unified service in code.

# Security

## Authentication

- Login with username or email + password.
- Signup requires username, email, password, and honeypot field.
- Hash passwords securely (Argon2id preferred).
- Never store raw passwords.
- Rate limit login and signup by IP and account identifier.

## Input and Output Safety

- Validate all incoming fields and enforce max lengths.
- Escape user-generated content by default on render.
- Linkified anchors must be sanitized.
- Add `rel="noopener noreferrer"` for external links.

## CSRF and Session Security

- CSRF protection required for all POST/PUT/PATCH/DELETE form actions.
- Session cookie flags as defined in auth model section.
- Regenerate session on login.

## Default Admin Bootstrap

On first startup, ensure an admin account exists.

- Production:
  - Admin credentials must come from env vars at startup.
  - Refuse to start with unsafe default credentials.
- Development only:
  - Allow `admin@admin.com` / `test12345`.
  - Must be gated by explicit development environment check.

# API and Validation Rules

- Pagination required for thread list and post list.
  - default page size: 20
  - max page size: 100
- Sort defaults:
  - thread lists: newest activity desc
  - posts in thread: createdAt asc
- Return 404 for missing resources, 403 for forbidden, 401 for unauthenticated.
- Consistent error codes for validation failures.

# Non-Functional Requirements

- v1 target: responsive page load under ~500ms on small VPS for cached/simple routes.
- Basic structured logging with request id.
- Health endpoint: `/healthz`.
- Backup strategy for SQLite required.  Lets implement this as a manual backup where I can just scp the db to my machine.

# Deployment

- Dockerized for VPS deployment.
- App port: `9827`.
- Database mount path example:
  - `/home/admin/forum-furiosum/db.sqlite`
- Development workflow must run without Docker.

Required environment variables (minimum):
- `NODE_ENV`
- `PORT` (default `9827`)
- `DB_PATH`
- `SESSION_SECRET`
- `ADMIN_BOOTSTRAP_EMAIL` (prod first-run only)
- `ADMIN_BOOTSTRAP_PASSWORD` (prod first-run only)

# Out of Scope for v1

- Real-time updates/websockets
- OAuth/social login
- Email verification flow
- Full-text search UI
- File uploads/custom avatars