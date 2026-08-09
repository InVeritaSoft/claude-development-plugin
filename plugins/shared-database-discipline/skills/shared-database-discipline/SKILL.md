---
name: shared-database-discipline
description: Rules for teams that run ONE shared Postgres/MongoDB instance behind many projects instead of a database container per repo. ALWAYS consult before adding a database to a project, writing a docker-compose file that includes postgres/mysql/mongo/redis, wiring DATABASE_URL / MONGO_URI / ConnectionStrings, creating a dev or staging database, running migrations, or deploying to a self-hosted runner. Trigger on "add a database", "postgres", "mongo", "DATABASE_URL", "connection string", "dev database", "staging database", "docker-compose with a db", "prisma/typeorm/EF migrations", "self-hosted runner", "deploy to the server". Covers per-environment isolation, the three-role credential model, connection-string formats that silently break, and self-hosted-runner safety.
---

# Shared database discipline

For setups where **one** Postgres and **one** MongoDB serve every project on a host or network,
rather than each repository shipping its own database container. This is the common shape for
homelabs, small teams and single-server deployments, and it fails in specific, repeatable ways.

Everything below is engine behaviour and convention — nothing here depends on a particular
provisioning tool. Where a command is needed, `<your-db-cli>` stands for whatever you use
(a script, a Makefile target, Terraform, or manual `psql`).

## Configure for your environment

The skill uses placeholders. Substitute once, wherever you keep project conventions:

| Placeholder | Meaning |
|---|---|
| `<db-host>` | host or address of the shared instance |
| `<pg-port>` / `<mongo-port>` | `5432` / `27017` unless you moved them |
| `<your-db-cli>` | the command that provisions and prints credentials |
| `<project>` | the repository/service name |

## The rule that matters

**Never add a `postgres:`, `mongo:`, `mysql:` or `redis:` service to a project's compose file.**
Not for production, not for dev, not "just locally".

Every project that ships its own database container gives you: N copies of the engine competing for
RAM on one box, N versions to patch, N backup stories, and N places where "it works on my machine"
diverges from production. A project that needs a development database gets a **dev environment on
the shared instance**, not a container of its own.

The exception worth naming: a throwaway container inside a **test** run (testcontainers and
friends), created and destroyed by the suite. That is not a deployment.

## Projects and environments

A project has environments. Each environment is a **separate database with its own roles** — not a
schema, not a table prefix.

| Environment | Database | Roles |
|---|---|---|
| `prod` | `<project>` | `<project>_owner` / `_app` / `_ro` |
| `dev` | `<project>_dev` | `<project>_dev_owner` / `_app` / `_ro` |
| anything else | `<project>_<env>` | `<project>_<env>_owner` / `_app` / `_ro` |

Production keeps the bare project name, so a project that never wanted more than one database looks
exactly as it always did.

**Isolate with the engine, not with convention.** Grant nothing across environments and revoke the
default:

```sql
REVOKE CONNECT ON DATABASE <project>      FROM <project>_dev_app;
REVOKE CONNECT ON DATABASE <project>_dev  FROM <project>_app;
-- and revoke PUBLIC, which can otherwise connect to anything
REVOKE CONNECT ON DATABASE <project> FROM PUBLIC;
```

Pointing a dev app at production credentials should fail as a **connection error**, loudly, rather
than quietly reading live data. "We just won't do that" is not isolation; a `REVOKE` is.

Because `<project>_<env>` must itself be a legal database name (Postgres allows 63 bytes; some
tooling is stricter), keep project names short enough to survive the longest suffix you will use.

## Three roles per database, and apps use the middle one

| Role | Used by | Privileges |
|---|---|---|
| `_owner` | migrations, DDL | owns the schema |
| `_app` | the running application | DML only |
| `_ro` | debugging, reporting, BI | `SELECT` |

Applications run as `_app` — never the owner, never `postgres`, never `root`. The payoff is that an
application-level SQL injection cannot `DROP TABLE`, and a migration that should not have run in
production fails on privileges instead of succeeding.

| Env var | Role |
|---|---|
| `DATABASE_URL` | `<project>_app` |
| `DATABASE_URL_MIGRATIONS` | `<project>_owner` |
| `MONGO_URI` / `MONGO_DB` | `<project>_app` |

MongoDB users are created **inside their own database**, so the connection string must carry
`?authSource=<db>` or authentication fails with a confusing "auth failed" against `admin`.

## Credentials

Generated, stored outside the repository, and never committed. A `.env` that reaches git history is
a rotation event, not a cleanup task — and rotating means updating every consumer, so the cheapest
version of this rule is to never let it happen.

- Keep the generated passwords in one place on the host, mode `0600`, owned by the operator.
- Do not put them in CI secrets **if the deploy runs on your own hardware** — the runner can read
  them from the host directly, and a secret that exists in two places has two chances to leak.
- Rotation must default to **production** rather than "whichever environment matched", so a bare
  rotate command can never surprise you by hitting the wrong one.

## Connection strings that silently break

Two failures cost more time than they should.

**`postgresql://` URIs are not universal.** Npgsql (.NET) cannot parse the URI form and throws
*"Format of the initialization string does not conform to specification"*. It wants ADO.NET keyword
pairs. Emit both forms and let each consumer take the one it understands:

```bash
# POSIX / Node / Python / Go
DATABASE_URL=postgresql://<project>_app:<password>@<db-host>:<pg-port>/<project>

# .NET
ConnectionStrings__Default=Host=<db-host>;Port=<pg-port>;Database=<project>;Username=<project>_app;Password=<password>
```

Read the .NET form as `Configuration.GetConnectionString("Default")`. The environment-variable
spelling of `ConnectionStrings:Default` is `ConnectionStrings__Default` — double underscore, every
platform. For local development prefer `dotnet user-secrets` over `appsettings.json`, which is
committed. The MongoDB C# driver, unlike Npgsql, accepts its `mongodb://` URI unchanged.

**Values containing `;` must not be shell-sourced.** The .NET form above is full of semicolons. Load
the file with Docker Compose's `env_file:`, which reads it literally. Never `source` it — the shell
splits on `;` and you get a truncated password and an authentication error that points nowhere near
the cause.

## Deploying from a self-hosted runner

If projects deploy onto the same machine that hosts the database, a self-hosted runner is the usual
answer. Three settings are not optional:

```yaml
on:
  push:
    branches: [deploy]      # a dedicated branch
  workflow_dispatch:
  # NEVER pull_request

concurrency:
  group: deploy-${{ github.repository }}
  cancel-in-progress: false   # never trampoline a deploy already in flight
```

**Never trigger on `pull_request`.** A self-hosted runner executing a fork's pull request is
arbitrary code execution on your network, from anyone who can open a PR. This is the single most
expensive mistake available in this setup.

Take deploy credentials from the host at deploy time rather than from CI secrets, and give each
project its own directory and compose project so one deploy cannot disturb another. See
`references/self-hosted-deploy.md` for a complete annotated workflow and the container-versus-host
traps that come with it.

## If you run an admin panel

A web panel over the shared instance is convenient and is also a credential-disclosure surface: it
typically renders full connection strings and offers destructive actions such as rotate-all or drop.

Decide its posture deliberately and write the decision down. If it is served without authentication
because it is bound to a trusted network, then that network boundary **is** the authentication —
which means it must never gain a public DNS name, a reverse-proxy route from outside, or a port
forward. Check what the proxy actually attaches, not what the documentation claims: a middleware
named `no-auth` and one named `basic-auth` differ by one line of config and by everything else.

## Backups

Dump every database on a schedule, keep the credential store in the same archive, and **verify by
restoring** — a backup that has never been restored is a hypothesis.

Two failure modes specific to this shape:

- **Backups on the same disk as the data protect against nothing but `rm`.** Get a copy onto another
  machine or another medium.
- **Encrypting the archive with a passphrase stored only on that machine** makes the backup
  unreadable in exactly the disaster it exists for. Keep the passphrase somewhere the machine's
  failure does not take with it.

When dropping a project, dump every environment first, not just production.
