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
