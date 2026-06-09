# Monitoring & Alerting

Metrics, dashboards and alerting are provided by the
[kube-prometheus-stack](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack)
(Prometheus + Grafana + Alertmanager + kube-state-metrics + node-exporter).

## Install

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm upgrade --install kube-prometheus-stack \
  prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  -f monitoring/values.yaml

kubectl apply -f monitoring/alert-rules.yaml
```

## Access

```bash
# Grafana (admin / value from values.yaml)
kubectl -n monitoring port-forward svc/kube-prometheus-stack-grafana 3001:80

# Prometheus
kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090:9090

# Alertmanager
kubectl -n monitoring port-forward svc/kube-prometheus-stack-alertmanager 9093:9093
```

## What is covered

- **Application logs** – backend and ETL write structured logs to stdout, collected by
  Kubernetes (`kubectl logs`). On AWS this is shipped to CloudWatch / Loki via Fluent Bit.
- **Health probes** – liveness and readiness probes on every workload; the backend
  readiness probe (`/healthcheck/ready`) verifies the MongoDB connection.
- **Metrics** – Prometheus scrapes kube-state-metrics and node-exporter.
- **Alerts** – `alert-rules.yaml` defines alerts for crash loops, unavailable replicas,
  MongoDB outage, failed ETL jobs, missed ETL schedules and memory pressure.
- **Notifications** – Alertmanager routes `critical` alerts to Slack (replace the webhook
  URL in `values.yaml`).
