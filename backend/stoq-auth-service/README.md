Описание подключения к gateway, таблица ролей и проверки: [auth-gateway](../../docs/auth-gateway.md).

### Старт

```env
DATABASE_URL="postgresql://admin:admin@localhost:5432/backend_db"
PORT=3001
HOST=127.0.0.1
RABBITMQ_URL=amqp://admin:admin@localhost:5672

JWT_ACCESS_SECRET=access_secret_very_long
JWT_REFRESH_SECRET=refresh_secret_very_long

JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

COOKIE_SECURE=false
COOKIE_SAMESITE=lax
```

```
docker-compose up -d
npx prisma generate
npm run start:dev
```
