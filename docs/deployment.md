# Deployment guide

Three ways to run the stack: Docker Compose (local dev), kind (local
Kubernetes), and AWS EKS (production). All Kubernetes paths apply the exact same
manifests.

## Prerequisites

| Tool | Used for |
|---|---|
| Docker | building and running images |
| kubectl | applying manifests |
| kind | local Kubernetes cluster |
| helm | installing the monitoring stack |
| terraform | provisioning AWS |
| aws CLI | authenticating to EKS/ECR |

---

## 1. Docker Compose (local dev)

```bash
cd mern-project
cp .env.example .env          # optional: change Mongo credentials
docker compose up -d --build
```

- Frontend: http://localhost:3000
- The backend and MongoDB are only reachable inside the compose network; the
  frontend proxies API calls to them.
- Seed data is loaded automatically on first start.

Run the end-to-end suite against it (the same test CI runs):

```bash
docker run --rm --network host \
  -v "$PWD/client:/e2e" -w /e2e cypress/included:4.12.1 --config video=false
```

Tear down (keep data): `docker compose down`
Tear down (wipe data): `docker compose down -v`

---

## 2. Local Kubernetes (kind)

### One command

```bash
./local/deploy-kind.sh
```

This will:
1. create the `mern` kind cluster (with ingress port mappings),
2. build `mern-server`, `mern-client` and `etl` images,
3. load them into the cluster,
4. install ingress-nginx and metrics-server,
5. apply the MERN and ETL manifests,
6. wait for all rollouts.

### Access the app

```bash
# via port-forward
kubectl -n mern port-forward svc/frontend 3000:80
# open http://localhost:3000

# via ingress (host header)
curl -H 'Host: mern.local' http://localhost:8080/healthcheck/
```

### Verify

```bash
kubectl get pods,svc,hpa -n mern
kubectl -n mern exec deploy/backend -- wget -qO- http://127.0.0.1:5050/healthcheck/ready

# trigger an ETL run immediately instead of waiting for the hour
kubectl -n etl create job etl-now --from=cronjob/etl
kubectl -n etl logs job/etl-now
```

### Tear down

```bash
kind delete cluster --name mern
```

---

## 3. AWS EKS (production)

### Provision infrastructure

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # adjust region, sizes
terraform init
terraform apply
```

Outputs include the cluster name, the `aws eks update-kubeconfig` command and the
ECR repository URLs.

> For shared state, copy `backend.tf.example` to `backend.tf` and point it at an
> S3 bucket + DynamoDB lock table before `terraform init`.

### Connect kubectl

```bash
aws eks update-kubeconfig --name mern-eks --region eu-central-1
```

### Push images

CI does this automatically, or manually:

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGION=eu-central-1
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.$REGION.amazonaws.com

docker build -t $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/mern-server:latest mern-project/server
docker push     $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/mern-server:latest
# repeat for mern-client and etl
```

### Deploy

Point the kustomize image references at ECR, then apply:

```bash
cd mern-project/k8s
kustomize edit set image mern-server=$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/mern-server:latest
kustomize edit set image mern-client=$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/mern-client:latest
kubectl apply -k .

kubectl apply -k ../../python-project/k8s
```

Expose the frontend with an ingress controller (e.g. AWS Load Balancer
Controller) or a `Service type: LoadBalancer`.

### TLS / HTTPS

The committed ingress runs plain HTTP for the local demo. For production,
terminate TLS at the ingress with cert-manager and Let's Encrypt:

```bash
helm repo add jetstack https://charts.jetstack.io
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace --set crds.enabled=true
```

Then add a ClusterIssuer and reference it from the ingress:

```yaml
metadata:
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    # remove the ssl-redirect=false annotation so HTTP redirects to HTTPS
spec:
  tls:
    - hosts: [app.example.com]
      secretName: mern-tls
  rules:
    - host: app.example.com
      # ...
```

cert-manager will provision and renew the certificate automatically.

---

## 4. Monitoring

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace -f monitoring/values.yaml
kubectl apply -f monitoring/alert-rules.yaml
```

Access:

```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090:9090   # Prometheus
kubectl -n monitoring port-forward svc/kube-prometheus-stack-grafana 3001:80        # Grafana
kubectl -n monitoring port-forward svc/kube-prometheus-stack-alertmanager 9093:9093 # Alertmanager
```

Set a real Slack webhook in `monitoring/values.yaml` to receive alert
notifications.

---

## CI/CD secrets and variables

Configure these in the GitHub repository settings to enable automated deploys:

| Name | Type | Purpose |
|---|---|---|
| `DEPLOY_ENABLED` | variable | set to `true` to enable the deploy jobs |
| `AWS_ACCESS_KEY_ID` | secret | AWS auth |
| `AWS_SECRET_ACCESS_KEY` | secret | AWS auth |
| `AWS_REGION` | secret | e.g. `eu-central-1` |
| `EKS_CLUSTER_NAME` | secret | e.g. `mern-eks` |

Images are published to GitHub Container Registry using the built-in
`GITHUB_TOKEN`; no extra secret is needed for that.

---

## Secrets management

The committed `k8s/01-secrets.yaml` contains demo values so the stack runs out of
the box. For real environments, replace it with one of:

- **AWS Secrets Manager** + the External Secrets Operator,
- **SOPS**-encrypted manifests, or
- **Sealed Secrets**.

Never commit production credentials to git.
