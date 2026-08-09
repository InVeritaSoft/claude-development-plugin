# Deploying to your own hardware from a self-hosted runner

Push-to-deploy onto the machine that also hosts the shared database. The pattern is a **dedicated
branch as the trigger**, a runner on that machine, and credentials read from the host rather than
from CI secrets.

```bash
git push origin main:deploy
```

## The safety properties, before the YAML

**Never trigger on `pull_request`.** A self-hosted runner executing a fork's pull request is
arbitrary code execution on your network by anyone who can open a PR. A branch push is safe as a
trigger precisely because fork PRs cannot push to your branches. This is the one mistake in this
document that ends badly rather than annoyingly.

**Serialize deploys.** A `concurrency` group with `cancel-in-progress: false` stops a second commit
from interleaving with a deploy already swapping containers.

**Do not put database passwords in CI secrets** when the runner is on the same machine as the
database. It can read the credential store directly. A secret stored in two systems leaks from
whichever you forgot to rotate.

**Keep a rollback target.** Tag the previously-good image and retag it if the new containers do not
settle. A deploy that can only go forward is an outage waiting for a bad Tuesday.

## Annotated workflow

Replace `PROJECT`, the runner labels, and the paths. Everything else is the pattern.

```yaml
name: deploy

on:
  push:
    branches: [deploy]          # the branch IS the trigger
  workflow_dispatch:
  # NEVER pull_request — see above.

concurrency:
  group: deploy-${{ github.repository }}
  cancel-in-progress: false     # never trample a deploy in flight

env:
  PROJECT: my-project           # <-- compose project + directory name
  STACKS_ROOT: /srv/stacks      # <-- where deployed projects live on the host

jobs:
  # Reuse the repo's existing test gate so a deploy never ships untested code.
  # Delete this job if there is no ci.yml.
  test:
    uses: ./.github/workflows/ci.yml

  deploy:
    needs: test
    runs-on: [self-hosted, Linux, X64]   # <-- your runner's labels
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4

      - name: Compute image tag
        id: tag
        run: echo "tag=$(git rev-parse --short=12 HEAD)" >> "$GITHUB_OUTPUT"

      - name: Build
        run: |
          docker build -t "$PROJECT:${{ steps.tag.outputs.tag }}" -t "$PROJECT:current" .

      - name: Prepare the stack directory
        run: |
          STACK="$STACKS_ROOT/$PROJECT"
          mkdir -p "$STACK"
          cp compose.yml "$STACK/compose.yml" 2>/dev/null || cp docker-compose.yml "$STACK/compose.yml"

      # Credentials come from the host's own store, never from GitHub Secrets.
      - name: Materialise .env from the host credential store
        run: |
          STACK="$STACKS_ROOT/$PROJECT"
          if <your-db-cli> show "$PROJECT" >/dev/null 2>&1; then
            <your-db-cli> env "$PROJECT" > "$STACK/.env"
            chmod 600 "$STACK/.env"
          else
            echo "::notice::no database provisioned for $PROJECT"
            : > "$STACK/.env"
          fi

      - name: Deploy
        run: |
          STACK="$STACKS_ROOT/$PROJECT"
          docker compose -p "$PROJECT" -f "$STACK/compose.yml" --env-file "$STACK/.env" \
            up -d --remove-orphans

      - name: Health check, roll back on failure
        run: |
          for i in $(seq 1 20); do
            if docker compose -p "$PROJECT" ps --format '{{.State}}' | grep -qv running; then
              sleep 3
            else
              echo "all containers running"; exit 0
            fi
          done
          echo "::error::containers did not settle — rolling back"
          docker tag "$PROJECT:previous" "$PROJECT:current" 2>/dev/null || true
          docker compose -p "$PROJECT" -f "$STACKS_ROOT/$PROJECT/compose.yml" up -d
          exit 1

      - name: Tag this build as the rollback target
        if: success()
        run: docker tag "$PROJECT:${{ steps.tag.outputs.tag }}" "$PROJECT:previous"

      - name: Prune dangling images
        if: always()
        run: docker image prune -f --filter "until=168h" >/dev/null || true
```

## The runner is a container, and it is not the host

If the runner itself runs in Docker, a workflow step executes *inside* that container while
`docker compose` talks to the **host** daemon. Build-time and run-time see different worlds, and
every item below is a deploy that went green while being wrong.

**Host tools are not on the runner's PATH.** A provisioning CLI installed on the host does not exist
inside the runner. Give it a thin shim that implements only what CI needs — printing one project's
`.env` — and keep provisioning, rotation and drops host-only. If the shim is bind-mounted, editing it
is not enough: recreate the container, because a bind-mounted file keeps its old inode.

**`curl 127.0.0.1:<port>` hits the runner's loopback, not the host's.** Ports published to
`127.0.0.1` are invisible to it, so a health check written that way passes or fails for reasons
unrelated to your service. Probe from a container on the host network instead:

```bash
docker run --rm --network host curlimages/curl -fsS http://127.0.0.1:<port>/healthz
```

**A bridge-networked container may not reach the database.** If the engine listens on the host and
the firewall admits only your LAN ranges, a container's `172.17.x.x` source address is rejected.
Anything holding a database connection needs `network_mode: host` — or an explicit firewall rule for
the bridge subnet, chosen deliberately.

**Paths in the compose file are resolved by the host daemon, not the runner.** Bind-mount secrets
straight from the host path rather than copying them through CI; the runner never needs to read them.
When a value genuinely must enter the environment, mount that one project's subtree, not the whole
credential store.

**Match uid *and* gid.** If credential files are `0640 root:<group>`, a container whose gid differs
gets `EACCES` — with a stack trace that blames the database, not the permissions.

**Override healthchecks baked into an upstream image** when you change the port, or the container
sits in `health: starting` forever and the deploy waits out its timeout for nothing.

## The failure mode to design against

A deploy that goes green while the application logs a warning and carries on degraded is worse than
a deploy that fails, because nobody looks again. Assert the thing itself — an endpoint that only
answers correctly when the database is reachable and migrations have run — not that a command
exited `0`.
