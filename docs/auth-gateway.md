# Auth через gateway

Frontend обращается к `stoq-gate:3000`. Gate передаёт команды в `app.commands`
с routing key `command.auth.*`; auth принимает их в durable-очереди `auth.commands`.
Пароли, подпись JWT, refresh-токены и проверка пользователя в PostgreSQL остаются в auth.
JWT-секреты нужны только auth. Gate выставляет cookies на своём адресе.

## Запуск

1. Установить зависимости в `backend/stoq-auth-service` и `backend/stoq-gate` через `npm ci`.
2. Скопировать `.env.example` каждого сервиса в `.env`. У обоих должен совпадать
   `RABBITMQ_URL`. В auth указать `DATABASE_URL` и два разных JWT-секрета.
3. Для auth выполнить `npx prisma generate` и применить существующие миграции
   через `npx prisma migrate deploy`. Новых миграций для подключения нет.
4. Из корня запустить в двух терминалах `npm run auth:dev` и `npm run gate:dev`.
   Auth по умолчанию слушает `127.0.0.1:3001`, gate — `3000`. Для контейнера auth
   задать `HOST=0.0.0.0`. Swagger gateway доступен по `/api`.

В gate: `AUTH_RPC_TIMEOUT_MS=10000`, `COOKIE_SECURE=false`, `COOKIE_SAMESITE=lax`.
Для HTTPS включить `COOKIE_SECURE=true`; при cookies между разными сайтами также
задать `COOKIE_SAMESITE=none`. В браузере использовать `credentials: 'include'`:

```js
await fetch('http://localhost:3000/auth/login', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
```

## Роли

| Действие | ADMIN | MANAGER | WAITER | STOREKEEPER | Гость |
| --- | --- | --- | --- | --- | --- |
| Создать ресторан (`POST /auth/register-restaurant`) | Да | Да | Да | Да | Да |
| Подтвердить/удалить сотрудника, изменить свой ресторан | Да | — | — | — | — |
| Аналитика и статистика | Да | Да | — | — | — |
| Блюда, склад, рекомендации, управление заказами | Да | Да | Да | — | — |
| Поставки и приёмка, распознавание УПД | Да | Да | Да | Да | — |
| Просмотр товаров и единиц для приёмки | Да | Да | Да | Да | — |
| Создание/удаление товаров и создание единиц | Да | Да | — | — | — |
| Меню (`GET /menu`) и создание заказа (`POST /orders`) | Да | Да | Да | Только как гость | Да |
| Тестовый сброс (`POST /test/reset`) | Да | — | — | — | — |

Гость — запрос без авторизации; отдельной записи или роли `GUEST` в БД нет.
Публичное меню возвращает только `id`, `name`, `category`, `salePrice`, `available`.
Для `POST /orders` с переданной сессией права проверяются; гостевой заказ не даёт
доступа к списку, чтению, редактированию или завершению чужих заказов.
`WAIT_CONFIRM` не может войти или обратиться к защищённым разделам.
Маршруты без явно указанной политики по умолчанию доступны только ADMIN/MANAGER.

Создание нового ресторана и регистрация сотрудника остаются публичными, как в auth
до подключения. Существующий процесс добавления сотрудника:

1. `POST /auth/register-restaurant` создаёт ресторан и ADMIN.
2. `POST /auth/register-user` с `fullName`, `email`, `password`, `restaurantId`
   создаёт сотрудника с `WAIT_CONFIRM`.
3. ADMIN видит заявки через `GET /auth/admin/users/pending` и подтверждает
   `PATCH /auth/admin/users/:id/approve` с `{ "role": "WAITER" }`.
   Доступны также MANAGER и STOREKEEPER.
4. `DELETE /auth/admin/users/:id` удаляет сотрудника;
   `PATCH /auth/admin/restaurant` меняет сведения ресторана.

Auth повторно проверяет токен для административных команд и определяет ID админа
из сессии. Заявки, подтверждение, удаление и изменение ресторана ограничены рестораном
этого админа. REST-маршруты `/users`, ранее отключённые в auth, не публикуются через gate.

## Сессии и WebSocket

`POST /auth/login` и `POST /auth/refresh` возвращают `{ user }`, где есть роль,
имя и `restaurantId`; токены передаются только в HttpOnly cookies:
`accessToken` с `Path=/`, `refreshToken` с `Path=/auth`.
Срок cookies берётся из настроек JWT в auth. Для HTTP также поддержан Bearer access token.
Вход, регистрация и refresh ограничены 10 запросами в минуту на IP и маршрут.

`GET /auth/status` проверяет подпись и срок токена, существование пользователя,
актуальную роль и `tokenVersion` в auth. Те же проверки выполняются для каждого
защищённого HTTP-запроса; нет локального кэша разрешений. `POST /auth/logout`
отзывает сессию и удаляет cookies. Refresh-токены ротируются; повторное применение
старого токена отклоняется. После обновления сервиса ранее выпущенные refresh-токены
потребуют повторного входа из-за исправленного хеширования полного JWT.

Socket.IO `/inventory` и `/recommendations` допускают ADMIN, MANAGER и WAITER.
С браузера подключаться с `withCredentials: true`. Дополнительно поддержан
`auth: { accessToken }` для клиента, у которого уже есть токен, либо Bearer header.
Сессия проверяется до подключения, перед каждым сообщением и каждые 15 секунд
для уже подключённых клиентов. После отзыва сессии клиент отключается.

401 означает отсутствие/недействительность сессии, 403 — недостаток прав,
503 — недоступность auth или RabbitMQ. Ошибки подключения не содержат секреты.

## Проверки

`npm run build:auth` собирает оба сервиса; `npm run test:auth` запускает тесты auth
и HTTP/Socket.IO проверки авторизации gate.

`npm run test:auth-integration` проверяет реальный путь HTTP → RabbitMQ → auth →
PostgreSQL: создание ресторана, подтверждение сотрудников всех ролей, cookies,
refresh/logout, удаление сотрудника и ограничения административных действий
между ресторанами. Бизнес-сервисы в этом тесте заменены RabbitMQ-обработчиками
с фиксированными ответами. Тест создаёт собственные временную БД и vhost и удаляет
их после завершения. Для локального PostgreSQL использует `docker/postgres/.env`,
если он существует; можно явно задать `AUTH_TEST_DATABASE_URL`,
`AUTH_TEST_RABBITMQ_URL`, `AUTH_TEST_RABBITMQ_MANAGEMENT_URL`.

Подключение вводит авторизацию по ролям. Каталог, склад и заказы пока используют
существующие общие таблицы без `restaurantId`; изоляция бизнес-данных разных
ресторанов требует отдельного изменения их моделей и RPC-контрактов.
