# Architecture

## Overview

The solution runs two independent workloads on Kubernetes, each in its own
namespace, with a shared monitoring stack.

| Namespace | Workloads |
|---|---|
| `mern` | frontend, backend, mongodb |
| `etl` | hourly ETL CronJob |
| `monitoring` | Prometheus, Grafana, Alertmanager, exporters |

## MERN stack

### Frontend
- React app built with `react-scripts` and served as a static bundle by nginx.
- The same nginx instance reverse-proxies `/record` and `/healthcheck` to the
  backend Service. This keeps the browser on a single origin and removes the
  hard-coded `http://localhost:5050` URLs that the original code shipped with.
- Built on `nginxinc/nginx-unprivileged`, so it listens on `8080` and runs as
  UID `101` — no root, no privileged ports.
- An init container waits for the backend to accept connections before nginx
  starts, which avoids the "host not found in upstream" failure on a cold start.

### Backend
- Express API exposing `/record` (CRUD) and `/healthcheck`.
- `/healthcheck` is used as the liveness probe; `/healthcheck/ready` pings
  MongoDB and is used as the readiness probe, so a pod only receives traffic once
  the database is reachable.
- The MongoDB connection retries with backoff instead of crashing on startup if
  the database is not yet available.
- Connection string is injected from a Secret; the port and database name come
  from a ConfigMap.

### MongoDB
- Deployed as a StatefulSet with a `PersistentVolumeClaim` so data survives pod
  restarts.
- Credentials come from the same Secret used by the backend.
- A ConfigMap seeds a few sample records on first start.

### Request flow
```
Browser
  -> Ingress (nginx)            host: mern.local
    -> frontend Service :80
      -> frontend pod (nginx :8080)
        - static files: served directly
        - /record, /healthcheck: proxied to backend Service :5050
          -> backend pod (Express :5050)
            -> mongodb Service :27017 (headless)
              -> mongodb-0 pod
```

## Python ETL

- `ETL.py` follows a clear extract / transform / load structure with logging,
  timeouts and error handling.
- Packaged as a small non-root image.
- Scheduled with a Kubernetes CronJob (`0 * * * *`). `concurrencyPolicy: Forbid`
  prevents overlapping runs and history limits keep old Jobs from piling up.
- A scheduled GitHub Actions workflow runs the same script hourly as a
  cluster-free alternative.

## Scaling & resilience

- **HorizontalPodAutoscaler** on frontend and backend (CPU/memory targets),
  backed by metrics-server.
- **PodDisruptionBudget** keeps at least one replica of each app available
  during voluntary disruptions (node drains, upgrades).
- **Rolling updates** with `maxUnavailable: 0` for zero-downtime deploys.
- **Resource requests/limits** on every container for predictable scheduling.

## Networking & security

- **NetworkPolicies**: default-deny ingress, then explicit allows
  (browser → frontend, frontend → backend, backend → mongodb).
- **Non-root** containers with `readOnlyRootFilesystem`, dropped capabilities and
  `seccompProfile: RuntimeDefault`.
- **Secrets** for database credentials; **ConfigMaps** for non-sensitive config.
- **Ingress** terminates a single hostname and routes everything to the frontend.

## Cloud topology (AWS)

```
VPC (10.0.0.0/16)
├── public subnets  (3 AZs)  -> NAT gateway, load balancers
└── private subnets (3 AZs)  -> EKS managed node group
EKS control plane (managed)
ECR: mern-server, mern-client, etl
```

Terraform provisions the VPC, the EKS cluster + node group, and the ECR
repositories. Images are pushed to ECR by CI and pulled by the nodes.

## Technology choices

| Concern | Choice | Why |
|---|---|---|
| Orchestration | Kubernetes | Required; the de-facto standard for this kind of workload |
| Local cluster | kind | Fast, disposable, runs the exact same manifests as EKS |
| CI/CD | GitHub Actions | Native to the submission repo, no extra infra |
| IaC | Terraform | Declarative, widely adopted, reuses well-maintained AWS modules |
| Cloud | AWS (EKS + ECR) | Mature managed Kubernetes and registry |
| Monitoring | kube-prometheus-stack | Batteries-included metrics, dashboards and alerting |
| Frontend serving | nginx (unprivileged) | Tiny, fast, doubles as the API reverse proxy |
