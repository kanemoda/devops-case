#!/usr/bin/env bash
set -euo pipefail

CLUSTER=mern
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INGRESS_VERSION="controller-v1.11.2"

echo "==> Creating kind cluster"
if ! kind get clusters | grep -qx "$CLUSTER"; then
  kind create cluster --name "$CLUSTER" --config "$ROOT/local/kind-config.yaml"
fi

echo "==> Building images"
docker build -t mern-server:local "$ROOT/mern-project/server"
docker build -t mern-client:local "$ROOT/mern-project/client"
docker build -t etl:local "$ROOT/python-project"

echo "==> Loading images into kind"
kind load docker-image --name "$CLUSTER" mern-server:local mern-client:local etl:local

echo "==> Installing ingress-nginx"
kubectl apply -f "https://raw.githubusercontent.com/kubernetes/ingress-nginx/${INGRESS_VERSION}/deploy/static/provider/kind/deploy.yaml"
kubectl -n ingress-nginx wait --for=condition=ready pod \
  -l app.kubernetes.io/component=controller --timeout=180s

echo "==> Installing metrics-server (HPA support)"
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl -n kube-system patch deployment metrics-server --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'

echo "==> Deploying MERN stack"
kubectl apply -k "$ROOT/mern-project/k8s"

echo "==> Deploying ETL CronJob"
kubectl apply -k "$ROOT/python-project/k8s"

echo "==> Waiting for rollouts"
kubectl -n mern rollout status statefulset/mongodb --timeout=240s
kubectl -n mern rollout status deployment/backend --timeout=240s
kubectl -n mern rollout status deployment/frontend --timeout=240s

echo "==> Cluster state"
kubectl get pods -n mern -o wide
echo
echo "Access the app with:"
echo "  kubectl -n mern port-forward svc/frontend 3000:80"
echo "  curl -H 'Host: mern.local' http://localhost:8080/healthcheck/"
