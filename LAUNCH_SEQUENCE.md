# Launch Command Sequence (Production)

## 1) Prepare runtime
```bash
nvm use 20
cp .env.example .env
# edit .env with production secrets and domains
```

## 2) Install + verify
```bash
npm ci
cd app && npm ci && cd ..
npm run typecheck
npm run build
cd app && npm run build && cd ..
```

## 3) Backup before deploy
```bash
npm run db:backup
```

## 4) Start services
```bash
./scripts/dev-up.sh
# (replace with your process manager in prod: systemd/pm2/k8s)
```

## 5) Verify gate
```bash
./scripts/dev-status.sh
curl -i http://localhost:8888/api/health
curl -i http://localhost:8888/api/tasks
curl -i http://localhost:8888/api/tasks -H 'X-API-Key: <OPERATOR_API_KEY>'
```

## 6) Rollback (if needed)
```bash
./scripts/rollback-last.sh
./scripts/dev-up.sh
```
