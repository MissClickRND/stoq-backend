# Local AI and Telegram workers

Run from the backend checkout with the user's VPN enabled:

```powershell
./deploy/start-local-services.ps1
./deploy/stop-local-services.ps1
```

The launcher uses `.tmp/local-services-runtime/settings.json`, `ai.env`, and `telegram.env`. These files and the restricted SSH key are ignored by Git and have private Windows ACLs. Do not copy their contents into logs or commit them. `STOQLocalServices` in the current user's Windows Run key starts the supervisor after Windows login. VPN may connect later: the supervisor retries the connection.

The one SSH connection forwards localhost15674 to the VPS RabbitMQ5672 and localhost15432 to PostgreSQL5432. Both forwards bind only to127.0.0.1. Telegram uses the production `telegram_db`; AI currently has no database queries and uses the existing production RPC workflow. Existing RabbitMQ queues, RPC response envelopes and other services are unchanged. The new Telegram subscriptions receive their own event copies.

Local health endpoints: `http://127.0.0.1:3006/ai/health` and `http://127.0.0.1:3007/health`. Telegram health distinguishes API polling from degraded connectivity. The supervisor retries crashed workers and the SSH tunnel. State and bounded operational logs are in the runtime directory; worker output is discarded to avoid persisting credentials or chat input.

Server AI/Telegram systemd instances have conditions requiring `/etc/stoq/run-ai-on-server` or `/etc/stoq/run-telegram-on-server`; those marker files remain absent. Do not start a competing Telegram poller or AI consumer during local operation. Server CI/CD still validates builds and applies database migrations; local code updates require rebuilding the respective workers and restarting the common launcher.

Bot: https://t.me/stoqhelperbot. Use `/start` or `/login` in a private chat, enter STOQ email and password. Only ADMIN and MANAGER can bind accounts. Password messages are deleted before authentication. `/summary` requests today's Moscow statistics and current warehouse state. `/settings` changes notification categories. `/daily` enables/disables the daily summary; `/daily 09:00` enables it at09:00 Moscow, covering the previous complete Moscow day. `/logout` revokes only the Telegram session. The PC, VPN and Internet connection must remain available for both local workers.
