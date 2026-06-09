# Challenges & engineering decisions

Notable problems encountered while making the two projects production-ready, and
how each was solved.

## 1. Hard-coded API URL in the frontend
The React components called `http://localhost:5050` directly. That works when
everything runs on the developer's laptop, but breaks the moment the app is
containerised — the browser's `localhost` is not the backend container.

**Fix:** switched all calls to relative paths (`/record`, `/healthcheck`) and let
nginx reverse-proxy them to the backend Service. For `npm start` the same paths
are proxied via the `proxy` field in `package.json`. One build, works everywhere.

## 2. Backend crashed when MongoDB was not ready
`conn.mjs` did a top-level `await client.connect()` and then `conn.db(...)`. If
Mongo was not up yet, `conn` was `undefined` and the whole process crashed —
exactly the kind of ordering problem you hit on a fresh cluster.

**Fix:** connect with exponential backoff and never throw on startup. The
readiness probe (`/healthcheck/ready`) actively pings Mongo, so Kubernetes only
sends traffic once the database is truly reachable.

## 3. Frontend nginx failed on a cold start
nginx resolves `proxy_pass` upstreams at startup. On the very first deploy the
backend Service had no endpoints yet, so nginx exited with
`host not found in upstream "backend"` and the pod restarted once before settling.

**Fix:** an init container (`busybox: nc -z backend 5050`) blocks until the
backend is accepting connections, so nginx starts cleanly. Result: zero restarts.

## 4. Running nginx as non-root
The stock `nginx` image runs its master as root and binds port 80, which clashes
with `runAsNonRoot`.

**Fix:** use `nginxinc/nginx-unprivileged`, which listens on `8080` as UID `101`.
Combined with `readOnlyRootFilesystem`, this needed writable `emptyDir` mounts for
`/tmp` and `/var/cache/nginx`.

## 5. `/record` vs `/records` path collision
The API path `/record` and the SPA route `/records` share a prefix. A naive
`location /record` in nginx would have hijacked the Record List page.

**Fix:** exact (`location = /record`) plus sub-path (`location /record/`) matching
for the API, with everything else falling through to `try_files ... /index.html`
for client-side routing.

## 6. Seeding MongoDB inside Kubernetes
Compose can mount a seed script easily; in Kubernetes the data lives on a PVC and
the official image only runs init scripts on an empty data directory.

**Fix:** ship the seed as a ConfigMap mounted at
`/docker-entrypoint-initdb.d`, guarded by a `countDocuments() === 0` check so it
is idempotent.

## 7. HPA needs a metrics source
`kind` does not ship metrics-server, so the HorizontalPodAutoscalers reported
`<unknown>` targets.

**Fix:** install metrics-server and add `--kubelet-insecure-tls` (kind's kubelet
certs are self-signed). The HPAs then report real CPU/memory utilisation.

## 8. Slow, fragile image builds
The client lists Cypress as a dependency; `npm ci` would download the Cypress
binary on every image build for no benefit.

**Fix:** `CYPRESS_INSTALL_BINARY=0` in the build stage. Multi-stage builds keep
the final images small (the React build tooling never reaches the runtime image).

## 9. NetworkPolicies and the local CNI
NetworkPolicies are written for least-privilege traffic, but kind's default CNI
(kindnet) does not enforce them, so they are effectively no-ops locally.

**Decision:** keep them — they are correct and enforced on EKS (VPC CNI with
network policy, or Calico). They are documented as local no-ops so nobody assumes
false isolation in kind.

## 10. Getting images into kind
kind nodes have their own containerd; they cannot see the host's Docker images.

**Fix:** `kind load docker-image` pushes the locally built images into the
cluster, mirroring how CI pushes to ECR for the real deployment.

## 12. The provided E2E test asserted against the wrong page
Wiring the shipped Cypress suite into CI surfaced a real bug in the test: after
creating "Employee1" it navigated to `/` and expected the record to appear there.
But `/` is the API status page — the record list lives at `/records` (as
`result.png` confirms). The test passed its first case and failed the second.

**Fix:** pointed the assertion at `/records`, where the list actually renders.
The suite now passes (2/2) and runs in CI against a Compose stack, gating image
builds — so "build, test, deploy" is genuinely automated rather than build-only.

## 11. Scheduling the ETL two ways
The requirement is simply "run every hour". Rather than pick one mechanism, the
repo provides both: a Kubernetes CronJob (the production path, co-located with the
rest of the platform) and a scheduled GitHub Actions workflow (a zero-infra
fallback that needs no cluster at all).
