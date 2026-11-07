# Local monitoring

Enable metrics in the root `.env` (copy `.env.example` if needed), then run the
API and monitoring stack:

```sh
bun run --filter @fluently/api dev
docker compose -f docker-compose.monitoring.yml up -d
```

- Grafana: http://localhost:8001 (default local login: `admin` / `admin`)
- Prometheus: http://localhost:9090
- API metrics: http://localhost:3000/metrics

Grafana provisions Prometheus and the Fluently API dashboard automatically.
The monitoring ports bind to localhost. Set `GRAFANA_ADMIN_PASSWORD` before
starting Grafana to change its local password. Prometheus scrapes the API at
`host.docker.internal:3000`; change `infra/monitoring/prometheus.yml` if the API
uses another port.

Metrics collection is disabled unless `METRICS_ENABLED=true`. Production should
use a private scrape network and authentication before enabling the endpoint.

Prometheus loads `billing-alerts.yml` and shows `FluentlyBillingFailure` at
http://localhost:9090/alerts when the API has observed a billing failure. See
`docs/billing.md` for reconciliation steps and the process-lifetime alert semantics.
External notifications require an operator-configured Alertmanager receiver.
After updating this configuration, recreate Prometheus to load the new mount:

```sh
docker compose -f docker-compose.monitoring.yml up -d --force-recreate prometheus
```

Validate the alert's firing and healthy states without starting the stack:

```sh
docker run --rm --entrypoint /bin/promtool -v "$PWD/infra/monitoring:/etc/prometheus:ro" -w /etc/prometheus prom/prometheus:v3.4.1 test rules billing-alerts.test.yml
```
