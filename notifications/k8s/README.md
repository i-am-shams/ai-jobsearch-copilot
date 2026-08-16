# Local Kubernetes demo

Real manifests, verified against a real cluster - not aspirational YAML.
Reproduces the roadmap's "learn K8s conceptually with kind/minikube before
touching managed K8s" step, card-free.

`mongo.yaml` and `rabbitmq.yaml` are demo-only stand-ins for what the real
deployment uses (MongoDB Atlas, the VPS's shared RabbitMQ) - self-contained
on purpose, so this whole set can be applied to an empty cluster and come up
on its own.

## Reproduce

```bash
kind create cluster --name jobcopilot-demo

# Build the real image (repo root is the build context, same as Docker
# Compose) and load it straight into the kind node - no registry round trip.
docker build -f notifications/Dockerfile -t ai-jobsearch-copilot-notifications:latest .
kind load docker-image ai-jobsearch-copilot-notifications:latest --name jobcopilot-demo

kubectl apply -f notifications/k8s/namespace.yaml
kubectl apply -f notifications/k8s/mongo.yaml -f notifications/k8s/rabbitmq.yaml
kubectl -n jobcopilot-notifications wait --for=condition=available --timeout=120s \
  deployment/mongo deployment/rabbitmq
kubectl apply -f notifications/k8s/notifications.yaml
kubectl -n jobcopilot-notifications get pods -w
```

## What was actually verified, not just applied

- All three pods reach `1/1 Ready` (`mongo`, `rabbitmq`, `notifications`) -
  `notifications`'s readiness probe hits the real `/health/ready` endpoint,
  which itself checks both the RabbitMQ connection and a live Mongo ping.
- **The exact cold-start race documented in Project 1 (Steps 23-26) showed up
  here too**: the `notifications` pod started before RabbitMQ's AMQP
  listener was accepting connections, logged 3-4 failed connection attempts
  with exponential backoff, then connected once RabbitMQ was actually ready.
  Confirmed by reading the pod's own logs, not assumed.
- A real message published directly to the `match-completed-fanout` exchange
  from inside the cluster (`rabbitmqadmin publish`, run from the `rabbitmq`
  pod) was consumed by the `notifications` pod and a real document appeared
  in the `mongo` pod's database (checked directly with `mongosh`).

## Teardown

```bash
kind delete cluster --name jobcopilot-demo
```
