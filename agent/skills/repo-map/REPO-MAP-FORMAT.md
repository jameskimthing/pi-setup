# REPO-MAP.md Format

## Structure

```md
# Repo Map

{One or two sentences: what this system is at a glance, for an agent that
has never seen it.}

## Areas

- **`src/auth/`** — issues and validates session tokens. Entry: `session.ts`.
  Depends on `src/users/`, `src/crypto/`.
- **`src/billing/`** — invoice generation + payment capture. Entry:
  `invoice.ts`. Depends on `src/orders/` (reads), emits `ShipmentDispatched`
  to `src/fulfillment/`.

## Conventions

- **All HTTP handlers wrap in `withAuth`.** Even unauthenticated ones —
  pass `{ requireAuth: false }`. Not in the README.
- **No side effects in `utils/`.** Pure functions only. Side-effecting
  helpers go in `services/`.

## Boundaries

- **`src/billing/` owns `Money` mutation.** Other modules reference it
  read-only; never construct or mutate `Money` outside billing.
- **`src/notifications/` does not call `src/billing/`.** Notifications are
  downstream-only; billing has no knowledge of notification channels.

## Known dead ends

- **Don't put webhook handlers in `src/routes/`.** They bypass the auth
  middleware contract. Put them in `src/webhooks/` and wire the signature
  check explicitly. (Tried in `src/routes/stripe.ts`, reverted in #412.)
```

## Section rules

### `## Areas`

One bullet per subsystem or cohesive area. Each bullet:

- **Path** (bold, backticked).
- One-line **purpose** — what it *is*, not what it does.
- **Entry** file — where an unfamiliar agent should land first.
- **Depends on** — the areas it reads from or calls. Omit if it's a leaf.

Don't list every file. Don't list trivial areas (`utils/` unless it carries
a rule — then that rule goes in `## Conventions` instead). If an area has
sub-areas worth knowing, nest one level; otherwise stay flat.

### `## Conventions`

Cross-cutting patterns the codebase enforces but the README doesn't state.
These are the "implicit conventions" that parallel subagents keep
re-deriving on their own — writing them down once is the highest-value part
of this file.

Each entry: the convention in one sentence, plus the one detail a newcomer
would get wrong without it. Skip conventions that are just "we use X
library" — those belong in a tech stack note, not here.

### `## Boundaries`

What lives where, and what *doesn't* belong where. The explicit no-s are
as valuable as the yes-s. "Module X owns Y; others reference by ID only."
"Module A must not call module B." These stop an agent from putting the
right code in the wrong place and having to move it.

### `## Known dead ends`

Approaches tried and rejected, with the structural reason. Append-only —
never edit a dead-end entry to reverse it; if a dead end becomes viable
again, add a new bullet noting the reversal and why. Include a pointer
(commit, PR, file) when you have one, so a future agent can verify rather
than trust the claim.

This is the most-ignored and highest-leverage section. Every dead end
recorded here is a re-discovery prevented.

## Update discipline

- **Edit the section you touched, nothing else.** A scout that mapped
  `auth/` updates the `## Areas` bullet for `auth/` and any
  `## Conventions` / `## Boundaries` it had to learn to do so. It does not
  touch the `## Areas` bullet for `billing/`.
- **Append dead ends; never rewrite them.** Reversals get a new bullet.
- **Create the file lazily.** No file until there's a first real entry. An
  empty `REPO-MAP.md` with section headers and no content is worse than no
  file — it signals "nothing to know here."
- **Don't batch.** Update inline as areas/conventions/boundaries/dead-ends
  crystallise. The cost of a stale entry is higher than the cost of a small
  edit.
