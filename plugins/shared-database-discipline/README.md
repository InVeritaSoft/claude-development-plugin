# shared-database-discipline

Rules for the setup where **one** Postgres and **one** MongoDB serve every project on a host or
network, instead of each repository shipping its own database container. The common shape for
homelabs, small teams and single-server deployments — and one that fails in specific, repeatable
ways.

The skill triggers before a database is added to a project, before a compose file grows a
`postgres:` service, when `DATABASE_URL` / `MONGO_URI` / `ConnectionStrings` are wired up, and when
a deploy runs on a self-hosted runner.

## What it enforces

- **No database container per project.** Three copies of Postgres on one box is three versions to
  patch, three backup stories and three ways local diverges from production. A project that wants a
  dev database gets a dev *environment* on the shared instance.
- **One database per project per environment**, isolated with `REVOKE CONNECT` rather than by
  agreement — so pointing a dev app at production credentials fails loudly instead of quietly
  reading live data.
- **Three roles per database.** `_owner` for migrations, `_app` for the running application, `_ro`
  for debugging. Applications use the middle one, so an injection cannot `DROP TABLE` and a stray
  migration fails on privileges rather than succeeding.
- **Connection strings that silently break.** Npgsql cannot parse the `postgresql://` URI form and
  throws a message that names neither the URI nor the driver; values containing `;` are destroyed by
  `source` and must be loaded with compose's `env_file:`. Both cost an afternoon the first time.
- **Self-hosted-runner safety.** Never trigger on `pull_request` — a fork's PR would be arbitrary
  code execution on your network. Plus the traps that come from the runner being a container while
  `docker compose` talks to the host daemon.
- **Backups you can actually restore.** On another medium, and not encrypted with a passphrase whose
  only copy lives on the machine the backup exists to survive.

## Layout

```
skills/shared-database-discipline/
  SKILL.md                      the discipline: environments, roles, credentials, connection strings
  references/
    self-hosted-deploy.md       annotated push-to-deploy workflow + runner-vs-host traps
```

## Not tied to any tool

Nothing here depends on a particular provisioning CLI. `<your-db-cli>` stands for whatever prints a
project's credentials — a script, a Makefile target, or manual `psql`. Host names, ports and paths
are placeholders you substitute once; the skill lists them in a table at the top.
