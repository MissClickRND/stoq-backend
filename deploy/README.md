# Развёртывание STOQ

Основной адрес: https://lyaguh.site. Сервер: 136.234.74.121, Ubuntu 24.04.

Nginx раздаёт frontend из `/var/www/stoq/current`, проксирует `/api/` и Socket.IO в gateway `127.0.0.1:3000`. Шесть серверных NestJS-сервисов работают через systemd; PostgreSQL 16, Redis и RabbitMQ установлены на VPS. AI worker работает на компьютере владельца и подключается к тому же RabbitMQ через SSH. Exchanges, routing keys, очереди, CommandBusService и RPC-контракты приложения сохранены.

## CI/CD

Оба репозитория автоматически проверяются и публикуются после push в `main`. Pull request выполняет только проверки.

Backend workflow собирает семь сервисов, запускает auth/AI/business-тесты, проверяет всю историю миграций на пустых PostgreSQL-базах. Только после этого передаёт исходники по SSH пользователю `stoq-backend-deploy`. Ключ хранится в GitHub Secret `DEPLOY_SSH_KEY`; Variables: `DEPLOY_HOST`, `DEPLOY_USER`. Пароль root в CI не используется. Ключ хоста закреплён в `deploy/known_hosts`.

Сервер собирает релиз в `/opt/stoq-backend/releases/<commit>-<run>-<attempt>`, повторно использует зависимости из `/opt/stoq-backend/dependencies` только при совпадении package-lock и Prisma schema. Перед миграциями делает `pg_dump` всех баз. После переключения `current` перезапускает сервисы и проверяет gateway и настоящий auth RPC. Если проверка не проходит, возвращает предыдущий код. Миграции автоматически назад не откатываются; резервные копии сохраняются.

Рабочие env находятся только в `/etc/stoq/*.env`, доступны root и runtime-пользователю `stoq-backend`. Cookie Secure/HttpOnly используются через HTTPS. Базы и брокер не доступны извне: firewall разрешает только SSH, HTTP и HTTPS.

Миграции и приложения используют одну PostgreSQL-роль `stoq`. После миграций `check-db-access.cjs` проверяет права SELECT/INSERT/UPDATE/DELETE всех таблиц и права последовательностей от фактической роли приложения. Отсутствие прав блокирует переключение релиза. CI выполняет миграции непривилегированной ролью и отдельно проверяет отказ при неверном владельце `inventory.idempotency_keys`.

## Локальный AI

`deploy/local-ai-supervisor.cjs` поддерживает SSH-туннель `127.0.0.1:15673 → VPS:127.0.0.1:5672` и перезапускает AI worker при обрывах. SSH-пользователь `stoq-ai-tunnel` имеет доступ только к этому перенаправлению, без shell. AI продолжает использовать существующий `AI_PROXY_URL` локального прокси. Runtime-файлы и отдельный ключ находятся в игнорируемой `.tmp/ai-runtime`, с ограниченными Windows ACL.

Запуск вручную из backend checkout:

```powershell
./deploy/start-local-ai.ps1 -RuntimeDirectory "$PWD/.tmp/ai-runtime"
```

Автозапуск текущего пользователя Windows: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, значение `STOQLocalAI`. После перезагрузки нужен вход пользователя. Компьютер и локальный прокси должны работать для распознавания УПД; остальные функции не зависят от компьютера. Журнал: `.tmp/ai-runtime/supervisor.log`. После обновления AI-кода выполните его сборку и перезапустите supervisor.

Серверный AI отключён systemd condition. Для переноса worker обратно на сервер после настройки доступного прокси создайте `/etc/stoq/run-ai-on-server` и остановите локальный worker, чтобы не было конкурирующих потребителей. Затем запустите `stoq-backend@stoq-ai-service`.

## Проверки на VPS

```bash
systemctl status stoq-backend@stoq-gate
systemctl list-units 'stoq-backend@*'
journalctl -u stoq-backend@stoq-gate -n 50
redis-cli ping
rabbitmq-diagnostics -q ping
rabbitmqctl list_queues name consumers messages_ready messages_unacknowledged
set -a; source /etc/stoq/stoq-gate.env; set +a
CHECK_AI=true node /opt/stoq-backend/current/deploy/health.cjs
curl -fsS https://lyaguh.site/healthz
curl -fsS https://lyaguh.site/backend-version.txt
df -h /
```

`deploy/smoke.cjs` проверяет регистрацию, login, secure cookies, API всех сервисов, граф, AI RPC и Socket.IO через публичный HTTPS. Для запуска передайте `DATABASE_URL` auth-сервиса. Созданный им временный пользователь и ресторан удаляются в `finally`; другие записи не затрагиваются.

`deploy/smoke-order.cjs` проверяет настоящую поставку, блюдо и создание заказа через HTTPS, запись ключа идемпотентности, движение склада и остаток. Запускается root на VPS, читает подключения из `/etc/stoq` и удаляет только данные созданного им временного ресторана во всех пяти БД.

## HTTPS и резервные копии

Let's Encrypt установлен для `lyaguh.site`; HTTP домена перенаправляется на HTTPS. Продление: `certbot.timer`. Диагностика: `certbot renew --dry-run`.

`stoq-backup.timer` ежедневно после 03:15 по Москве сохраняет PostgreSQL, env, определения RabbitMQ и Redis в `/var/backups/stoq/daily`. Копии доступны только root. Перед каждым деплоем также сохраняются PostgreSQL dumps. Копии находятся на том же VPS: для защиты от потери всего сервера нужно отдельное внешнее хранилище. Старые копии и релизы автоматически не удаляются; следите за диском. Новый релиз не начинается при свободном месте меньше 2 ГБ.

## Первичная установка

`deploy/setup-server.sh` устанавливает зависимости, Node 22.20.0 с проверкой SHA256, пользователей, systemd units и firewall. При первоначальной настройке требуется создать пять БД, отдельные credentials брокера и env в `/etc/stoq`. Секреты и приватные ключи не входят в Git. История миграций дополнена отсутствовавшими полями блюд, таблицами движений склада и статусом RUNNINGOUT; конфигурация связи RabbitMQ не изменялась.

Старые локальные PostgreSQL-данные автоматически не переносились: источник был недоступен. Серверные базы созданы из миграций.
