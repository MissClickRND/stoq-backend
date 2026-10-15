# Разработка через Vite proxy

Готовые файлы в `examples/vite/`. Скопировать `stoq-proxy.mjs` рядом с существующим
`vite.config.ts` фронтенда и добавить `server.proxy` из `vite.config.example.ts`.
Существующие React/Vue plugins, aliases и остальные настройки сохранить.
В `.env.local` фронтенда указать `STOQ_BACKEND_URL=http://IP-БЭКЕНДА:3000`.
Перезапустить Vite после изменения конфигурации.

В `.env` **gateway** на компьютере бэкенда:

```env
COOKIE_SECURE=false
COOKIE_SAMESITE=lax
```

Браузер работает только с адресом фронтенда. Все HTTP-запросы делать по относительным
URL, включая login, refresh и logout:

```ts
await fetch('/api/auth/login', {
  method: 'POST', credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const restaurants = await fetch('/api/restaurants').then(r => r.json());
const menu = await fetch('/api/menu', {
  headers: { 'X-Restaurant-Id': String(selectedRestaurantId) },
}).then(r => r.json());
await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
```

Для Axios: `baseURL: '/api'`, `withCredentials: true`.
Не обращаться из браузера напрямую к IP бэкенда и не читать HttpOnly cookie через JS.

Socket.IO использует тот же origin и прокси для polling и WebSocket upgrade:

```ts
import { io } from 'socket.io-client';
const inventory = io(`${window.location.origin}/inventory`, {
  path: '/api/socket.io', withCredentials: true,
});
const recommendations = io(`${window.location.origin}/recommendations`, {
  path: '/api/socket.io', withCredentials: true,
});
```

`/inventory` и `/recommendations` здесь namespaces, `/api/socket.io` — транспортный
путь. При logout отключить сокеты; после повторного входа подключить заново.
Прокси удаляет префикс `/api` перед отправкой в gate и переписывает `Path=/auth`
в `Path=/api/auth` в Set-Cookie. Это необходимо и для refresh, и для очистки cookie
при logout. Access cookie с `Path=/` подходит также для WebSocket handshake.

Проверить в DevTools → Network: login выставляет две HttpOnly cookies; refresh
отправляет refreshToken; соединение `/api/socket.io` проходит с accessToken.
При переходе с прямого API на прокси очистить старые cookies фронтенда и войти заново.

HttpOnly работает по HTTP, а SameSite=None требует Secure. Правила Path определяют,
куда браузер отправит cookie: [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).
В разработке browser → Vite идёт на один origin, соединение Vite → удалённый gate
остаётся HTTP. Для постоянной работы использовать общий HTTPS-домен и
`COOKIE_SECURE=true`, `COOKIE_SAMESITE=lax`.

При HTTPS reverse proxy сохранить те же правила: `/api/` → gate `/`,
`Path=/auth` → `/api/auth`, WebSocket upgrade для `/api/socket.io/` → `/socket.io/`.
Сам gateway не получает префикс `/api`; `/api` у него уже занят Swagger.

Проверка конфига: `node --test examples/vite/stoq-proxy.test.mjs`.
