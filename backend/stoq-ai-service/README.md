# STOQ AI Service — распознавание УПД через OpenRouter

NestJS / TypeScript сервис: один файл в Swagger → товарные строки в JSON. Работает через OpenRouter Chat Completions, использует совместимый OpenAI SDK, Structured Outputs и Zod. Прямых запросов к API OpenAI нет.

## Место в экосистеме STOQ

Основной проект находится в `stoq-backend/backend/stoq-ai-service`, пакет называется `ai-service`. В экосистеме загружайте файл через **POST http://127.0.0.1:3000/ai** в Swagger gateway `/api`. Gateway отправляет команду `command.ai.recognize_upd` в exchange `app.commands`; worker принимает ее из `ai.commands`. Health использует отдельную очередь `ai.health`. Остальные сервисы могут вызвать AI через свой `CommandBusService` с отдельным timeout. Полный запуск и RPC-контракт описаны в корневом `stoq-backend/README.md`.

Для экосистемы нужны работающий RabbitMQ, одинаковый `RABBITMQ_URL` у gateway/worker и `RABBITMQ_ENABLED=true` у AI. Прямой `POST /ai` и `/docs` доступны на порту 3006. Для самостоятельного HTTP-запуска без брокера установите `RABBITMQ_ENABLED=false`.

## Запуск на вашем Windows-компьютере

Нужны Node.js 22.19+, npm, ключ OpenRouter и доступ к выбранной модели. Для текущего компьютера настроен HTTP-прокси Happ; TUN не нужен.

```powershell
cd C:\Users\Lyaguh\Desktop\stoq-backend\backend\stoq-ai-service
npm ci
# При первом запуске, только если .env отсутствует:
Copy-Item .env.example .env
notepad .env
```

В существующем `.env` уже подготовлены новые параметры. Вставьте ключ из [OpenRouter API Keys](https://openrouter.ai/settings/keys):

```dotenv
OPENROUTER_API_KEY=ваш-ключ-OpenRouter
OPENROUTER_MODEL=openai/gpt-4.1-mini
OPENROUTER_PDF_ENGINE=native
AI_PROXY_URL=http://127.0.0.1:10809
```

Оплата и баланс находятся в [OpenRouter Credits](https://openrouter.ai/settings/credits). Ключ OpenAI, подписка ChatGPT и баланс OpenAI Platform не оплачивают запросы OpenRouter. Старые переменные `OPENAI_*` игнорируются, автоматической подстановки старого ключа нет.

```powershell
npm run diagnose:openrouter
npm run start:dev
```

Откройте [Swagger](http://127.0.0.1:3006/docs): `POST /ai` → **Try it out** → выберите файл в поле **file** → **Execute**. Ответ `200` содержит объект `{ sellerName, items }`. Если задан `SERVICE_API_KEY`, сначала в **Authorize** введите этот ключ сервиса.

Для production:

```powershell
npm run build
npm start
```

Изменения `.env` требуют перезапуска процесса. Пустой ключ или незамененный пример блокирует запуск, секреты не печатаются.

## Какую модель выбрать

Рекомендация для начала: **`openai/gpt-4.1-mini`**. В текущем каталоге OpenRouter подтверждены изображения, файлы и Structured Outputs. Это экономичный вариант для первого замера качества на ваших УПД; точность на ваших сканах до реального теста не доказана.

| Модель                                 | Использование                                        | Настройка PDF                     | Тариф вход / выход за 1M токенов                  |
| -------------------------------------- | ---------------------------------------------------- | --------------------------------- | ------------------------------------------------- |
| `openai/gpt-4.1-mini`                  | Основной экономичный вариант                         | `native`                          | от $0.40 / $1.60                                  |
| `openai/gpt-4.1`                       | Вариант для сравнения качества на сложных документах | `native`                          | от $2 / $8                                        |
| `dots-studio/dots-3-note-preview:free` | Бесплатный эксперимент, preview, с лимитами          | `cloudflare-ai` или `mistral-ocr` | $0 / $0 за inference; OCR тарифицируется отдельно |

Цены и поддержка endpoint меняются. При выборе модели проверьте [каталог](https://openrouter.ai/models) и `npm run diagnose:openrouter`. Бесплатный Dots endpoint сейчас объявляет `structured_outputs` и изображения, но прямой прием PDF не заявлен. У бесплатных Gemma endpoints сейчас есть `response_format`, а `structured_outputs` не заявлен: одного умения выдавать JSON недостаточно для строгого контракта проекта.

Для бесплатного эксперимента:

```dotenv
OPENROUTER_MODEL=dots-studio/dots-3-note-preview:free
OPENROUTER_PDF_ENGINE=cloudflare-ai
```

`cloudflare-ai` указан как бесплатный PDF-парсер в документации OpenRouter. Его качество на плотных сканах и таблицах нужно проверить. `mistral-ocr` предназначен для сканов, но имеет отдельную плату за страницы даже при бесплатной модели. Режимы не переключаются автоматически: выбранный `native` не заменяется платным OCR при ошибке.

Ограничения бесплатных запросов зависят от аккаунта и текущей политики OpenRouter; их счетчик доступен через `GET /api/v1/key`. Preview и free маршруты могут быть перегружены или недоступны. Бесплатная модель не гарантирует такую же точность, как платная.

Источники моделей: [GPT-4.1 mini](https://openrouter.ai/openai/gpt-4.1-mini), [GPT-4.1](https://openrouter.ai/openai/gpt-4.1), [Dots3-Note Preview free](https://openrouter.ai/dots-studio/dots-3-note-preview:free).

## Полный путь файла до JSON

1. Клиент отправляет `multipart/form-data` с ровно одним полем `file`.
2. Multer принимает файл в память с лимитом размера. `SERVICE_API_KEY`, если задан, проверяется до приема файла.
3. Валидатор проверяет сигнатуру, расширение и MIME. PNG/JPEG/WEBP полностью декодируются; PDF разбирается, проверяются страницы и отсутствие шифрования.
4. `UpdService` ограничивает одновременное распознавание. При перегрузке возвращает `503 SERVICE_BUSY`.
5. Изображение кодируется в data URL и отправляется как `image_url` с `detail: high`. PDF передается целиком как `file.file_data`; используется `file-parser` с явно заданным engine.
6. Сервис вызывает `https://openrouter.ai/api/v1/chat/completions`. Системный промпт задает правила чтения УПД. Команды внутри документа считаются недоверенными данными.
7. `zodResponseFormat(ExtractionSchema)` формирует `response_format: json_schema`, `strict: true`. `provider.require_parameters: true` требует маршрутизацию на endpoint с нужными параметрами. Соблюдение схемы зависит и от выбранного провайдера, поэтому результат дополнительно валидируется локально.
8. Проверяются ошибки шлюза, отказ модели и `finish_reason`. При `length`, пустом или неоднозначном ответе частичный массив не возвращается.
9. JSON парсится и проверяется Zod. Ошибочные типы, лишние поля, отрицательные числа и полностью нечитаемые строки отклоняются. Исходные цены модели допускают дробную часть документа.
10. Модель возвращает внутреннее `quantityColumn3Text` — буквальный текст ячейки графы 3. Сервер преобразует его в числовое `quantity`: `1,000` → `1`, `2,500` → `2.5`. Смешанный текст соседних ячеек вроде `796 2,000` отклоняется как неоднозначный. При `null` количество остается `null`.
11. Сервер удаляет кавычки и лишние пробелы из `sellerName`, независимо округляет `price` и `totalPrice` до целого рубля через `Math.round` и повторно проверяет публичную `RecognitionSchema`. `null` и дробное `quantity` сохраняются.
12. Клиент получает объект `{ sellerName, items }`. В `items` находятся строки `{ name, quantity, price, totalPrice, unit }`; внутренние `documentType` и `quantityColumn3Text` не передаются.

Для загрузки изображения делается одна попытка inference, retries SDK отключены. Для PDF OpenRouter может дополнительно запускать выбранный OCR-парсер и маршрутизировать inference между подходящими endpoint. SDK остается пакетом `openai` только как совместимый HTTP-клиент.

## Правила извлечения

| Поле         | Источник в УПД                                                           | Тип                       |
| ------------ | ------------------------------------------------------------------------ | ------------------------- |
| `name`       | Наименование, графа 1а                                                   | `string` или `null`       |
| `quantity`   | Количество, графа 3                                                      | `number` или `null`       |
| `price`      | Цена за единицу, графа 4, округление до целого рубля                     | целое `number` или `null` |
| `totalPrice` | Стоимость товарной строки с налогом, графа 9, округление до целого рубля | целое `number` или `null` |
| `unit`       | Условное обозначение, графа 2а                                           | `string` или `null`       |

Сохраняются наименования, артикулы и размеры, соединяются переносы одной ячейки. Порядок строк и повторяющиеся товары сохраняются. Шапка, реквизиты, подписи, итоги, доставка и явно указанные услуги исключаются.

`price` читается из графы 4, `totalPrice` — независимо из графы 9. Это сумма конкретной товарной строки, а не итог документа «Всего к оплате». Сервис не вычисляет `totalPrice` как `quantity * price`, не восстанавливает `price` делением и не прибавляет НДС. Прочитанные значения затем независимо округляются до рубля: `611.88` → `612`, `611.49` → `611`, `611.50` → `612`. Поэтому округленная сумма строки может не совпадать с произведением округленной цены и количества — сумма не пересчитывается.

`quantity` берется только из графы с **номером 3** «Количество (объем)», расположенной правее единицы измерения и левее цены. Это не третий видимый столбец: у УПД есть графы A, 1, 1а, 1б, 2, 2а, 3 и т.д. Модель должна найти номер и заголовок графы 3 и вернуть только текст ячейки под ними во внутреннем поле `quantityColumn3Text`. Числовое поле `quantity` модель больше не формирует — оно разбирается сервером из этого текста.

Коды из графы 2 (ОКЕИ), коды товара и страны, номера строк полностью запрещены как источник количества; при неоднозначности модель должна вернуть `null`. Коды не входят в JSON и не подставляются вместо отсутствующего количества. Дробное количество не округляется. Если в самой графе 3 реально указано `123,000`, `quantity: 123` сохраняется, даже когда рядом тоже встречается код 123. Привязка ячейки к графе по-прежнему зависит от распознавания модели, поэтому возможные ошибки OCR проверяйте на ваших документах.

`sellerName` на корневом уровне — наименование из поля «Продавец», строка (2). Сохраняются полное название и организационно-правовая форма, а двойные кавычки, елочки и типографские двойные кавычки удаляются сервером: `ООО «Молочный двор»` → `ООО Молочный двор`. Переносы и лишние пробелы нормализуются. Апостроф внутри имени, например `О'Кей`, сохраняется. Покупатель, грузоотправитель и ИНН не подставляются. Нечитаемый или отсутствующий продавец — `null`, при этом читаемые товары возвращаются.

**Изменение контракта:** раньше endpoint возвращал массив, теперь возвращает объект. В клиентах используйте `response.items` для товаров и `response.sellerName` для продавца. Swagger отражает новый контракт.

Российские числа преобразуются в числа JSON: количество `1,000` → `1`, `123,000` → `123`; цены `1 440,00` → `1440`, `117,80` → `118`. `price` и `totalPrice` в публичном ответе всегда целые рубли либо `null`; это не целое число копеек.

Неизвестное или нечитаемое поле — `null`, в том числе `totalPrice` и `sellerName`. Читаемый ноль остается нулем. Если товарная строка видна, но название не читается, допускается `name: null` с читаемыми остальными полями. Нет читаемых товаров → `422`, строки с пятью `null` → ошибка ответа.

```json
{
  "sellerName": "ООО Поставщик",
  "items": [
    {
      "name": "Помидоры",
      "quantity": 1,
      "price": 1440,
      "totalPrice": 1440,
      "unit": "кг"
    },
    {
      "name": "Огурцы свежие",
      "quantity": 123,
      "price": 1440,
      "totalPrice": 177120,
      "unit": "кг"
    },
    {
      "name": "Товар",
      "quantity": null,
      "price": null,
      "totalPrice": null,
      "unit": "шт"
    }
  ]
}
```

`examples/upd-sample.png` — ваш пример. `examples/upd-sample.expected.json` — вручную прочитанный ориентир с пятью товарами, а не сохраненный ответ модели; «Доставка» исключена. Эти fixtures не отправляются как подсказка и не подставляются вместо inference.

Structured Outputs и Zod проверяют форму, а не правдивость распознавания. Промпт запрещает догадки, но не устраняет все ошибки модели. До автоматического учета сравните ответы с 10–20 размеченными УПД, включая многостраничные и плохо читаемые документы.

## Оплата и расчет стоимости

Списываются токены входа (инструкции, схема, изображение/текст PDF) и фактического ответа. `OPENROUTER_MAX_OUTPUT_TOKENS` — верхний предел, а не количество автоматически оплачиваемых токенов.

Пример арифметики для mini при 5000 входных и 500 выходных токенов: `5000 × $0.40 / 1M + 500 × $1.60 / 1M = $0.0028`. Это пример по заданному расходу, не измеренная цена вашего файла. 1000 таких запросов — $2.80, без комиссии покупки кредитов и отдельного OCR. Расход проверяйте в [Activity](https://openrouter.ai/activity).

PDF в `native` оплачивается входными токенами модели. `mistral-ocr` добавляет плату за страницы. Кэширование зависит от повторяющегося контекста и провайдера; разные УПД не гарантируют попадание в кэш.

Источники: [PDF Inputs](https://openrouter.ai/docs/guides/overview/multimodal/pdfs), [FAQ и биллинг](https://openrouter.ai/docs/faq), [Structured Outputs](https://openrouter.ai/docs/guides/features/structured-outputs).

## Все настройки `.env`

| Переменная                     | По умолчанию                 | Назначение                                         |
| ------------------------------ | ---------------------------- | -------------------------------------------------- |
| `OPENROUTER_API_KEY`           | обязательна                  | Ваш ключ OpenRouter                                |
| `OPENROUTER_MODEL`             | `openai/gpt-4.1-mini`        | Полный ID `author/model`, допустим суффикс `:free` |
| `OPENROUTER_PDF_ENGINE`        | `native`                     | `native`, `mistral-ocr`, `cloudflare-ai`           |
| `OPENROUTER_TIMEOUT_MS`        | 120000                       | 1000–600000 мс                                     |
| `OPENROUTER_MAX_OUTPUT_TOKENS` | 16000                        | 256–100000; в пределах лимита модели               |
| `AI_PROXY_URL`                 | пусто в коде, Happ в примере | HTTP/HTTPS-прокси только для клиента OpenRouter    |
| `HOST`                         | `127.0.0.1`                  | Для сети/контейнера `0.0.0.0`                      |
| `PORT`                         | 3006                         | Порт процесса                                      |
| `NODE_ENV`                     | `development`                | `development`, `test`, `production`                |
| `MAX_FILE_SIZE_MB`             | 20                           | 1–20 MiB                                           |
| `MAX_PDF_PAGES`                | 30                           | 1–100 страниц                                      |
| `MAX_IMAGE_PIXELS`             | 40000000                     | Лимит изображения, до 100 млн                      |
| `MAX_CONCURRENT_RECOGNITIONS`  | 2                            | 1–20 на процесс                                    |
| `SERVICE_API_KEY`              | пусто                        | Заголовок `X-Service-Key` для защиты endpoint      |

## Happ и доступ к backend

В `.env` на данном ПК используется `AI_PROXY_URL=http://127.0.0.1:10809`. Happ должен быть подключен в режиме Proxy, TUN не требуется. Через Undici `ProxyAgent` проксируется только клиент OpenRouter; глобальный dispatcher, Windows proxy и маршруты сервиса не меняются. TLS-проверка включена. При выключенном Happ будет ошибка соединения, прямого обхода нет.

Ваш backend `26.130.106.197` добавлен в исключения системного прокси Windows. Если Happ перепишет исключения после переподключения:

```powershell
./scripts/add-backend-proxy-bypass.ps1 -BackendUrl 'http://26.130.106.197:3000'
```

Скрипт сохраняет прежний список в `.proxy-bypass-backup.json`, исключенном из Git. Он добавляет только указанный хост и сохраняет другие исключения. После изменения обновите страницу или перезапустите браузер. Настройка действует для Proxy, а не для TUN.

Чтобы отключить прокси клиента, установите `AI_PROXY_URL=` и перезапустите процесс. На вашем соединении прямой публичный API OpenRouter ранее отвечал 403; через Happ отвечал 200. Поддержка региона и доступа зависит от самого провайдера, прокси не является гарантией.

Для удаленного HTTP/HTTPS-прокси допустим `https://user:password@host:port`; специальные символы логина/пароля нужно URL-кодировать. Путь, query и fragment не допускаются. Адреса и пароли прокси не выводятся в ошибки. SOCKS-порт Happ `10808` в этой настройке не используется.

## API и ошибки

- `POST /ai` — один файл `file` в multipart, без других полей.
- `GET /ai/health` — `{ "status": "ok" }`, не проверяет OpenRouter и баланс.
- `GET /docs` — Swagger UI.
- `GET /docs-json` — OpenAPI JSON.

```powershell
curl.exe --max-time 150 -X POST 'http://127.0.0.1:3006/ai' -F 'file=@examples/upd-sample.png'
# Если задан SERVICE_API_KEY, добавьте: -H 'X-Service-Key: ваш-ключ-сервиса'
```

Boundary multipart формирует клиент, `Content-Type` вручную не задавайте.

Ошибки: `{ statusCode, code, message, path, requestId, timestamp }`, `X-Request-Id` совпадает с идентификатором в JSON. Исходные сообщения провайдера, документ и ключи не логируются; сервер пишет безопасный код и статус.

| HTTP / код                            | Что проверить                                                     |
| ------------------------------------- | ----------------------------------------------------------------- |
| 400                                   | Отсутствующий/пустой/поврежденный/зашифрованный файл, лишние поля |
| 401 `UNAUTHORIZED`                    | `X-Service-Key`, если включен                                     |
| 413                                   | Размер, страницы, пиксели                                         |
| 415                                   | Формат, MIME, расширение                                          |
| 422                                   | Не УПД, нет товаров, отказ модели                                 |
| 502 `INCOMPLETE_MODEL_RESPONSE`       | Обрезанный ответ; меньший PDF или больший бюджет                  |
| 502 `INVALID_MODEL_RESPONSE`          | Ответ не соответствует Zod-схеме                                  |
| 503 `OPENROUTER_AUTHENTICATION_ERROR` | Ключ OpenRouter отклонен                                          |
| 503 `OPENROUTER_BILLING_ERROR`        | Баланс/лимит расходов, в том числе upstream 402                   |
| 503 `OPENROUTER_ACCESS_DENIED`        | Доступ, регион или политика провайдера, upstream 403              |
| 503 `OPENROUTER_MODEL_UNAVAILABLE`    | ID модели или доступ, upstream 404                                |
| 503 `OPENROUTER_RATE_LIMIT`           | Частота/дневной лимит, upstream 429                               |
| 503 `OPENROUTER_CONNECTION_ERROR`     | Happ, порт прокси или сеть                                        |
| 503 `SERVICE_BUSY`                    | Одновременные запросы процесса                                    |
| 504 `OPENROUTER_TIMEOUT`              | Превышен timeout провайдера                                       |

## Подключение к микросервисам

Backend пересылает файл этому HTTP-сервису и получает объект с продавцом и товарами. OpenRouter API-ключ хранится только здесь. Backend сохраняет результат после своей бизнес-валидации; фронтенд не получает ключ OpenRouter.

Пример Node.js 22:

```typescript
type Product = {
  name: string | null;
  quantity: number | null;
  price: number | null;
  totalPrice: number | null;
  unit: string | null;
};
type Recognition = { sellerName: string | null; items: Product[] };
async function recognizeUpd(file: Express.Multer.File): Promise<Recognition> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
    file.originalname,
  );
  const headers: Record<string, string> = {};
  if (process.env.STOQ_ML_SERVICE_KEY)
    headers["X-Service-Key"] = process.env.STOQ_ML_SERVICE_KEY;
  const result = await fetch(
    `${process.env.STOQ_ML_URL ?? "http://127.0.0.1:3006"}/ai`,
    {
      method: "POST",
      body: form,
      headers,
      signal: AbortSignal.timeout(150_000),
    },
  );
  const body: unknown = await result.json();
  if (!result.ok)
    throw new Error(`STOQ AI Service HTTP ${result.status}: ${JSON.stringify(body)}`);
  // Перед сохранением валидируйте body с помощью RecognitionSchema из этого проекта.
  return body as Recognition;
}
```

Для доступа по сети задайте `HOST=0.0.0.0` и `SERVICE_API_KEY`. На gateway ограничьте размер тела и конкурентные HTTP-загрузки: лимит распознавания применяется после приема multipart. Таймаут клиента и proxy должен превышать `OPENROUTER_TIMEOUT_MS` с запасом. Swagger и health размещайте во внутренней сети.

Основной вариант интеграции STOQ уже реализован через RabbitMQ и gateway `/ai`. Для встраивания в другое NestJS-приложение перенесите `src/upd`, `src/config` и `src/common/api-error.ts`, добавьте зависимости, импортируйте `UpdModule`, используйте экспортируемый `UpdService.recognize(file)`. Объедините настройки с существующим `ConfigModule`; prefix, фильтр и Swagger настраивает host-приложение. `main.ts` переносить и запускать второй раз не нужно.

## Docker

```powershell
docker compose up --build -d
docker compose logs -f ai-service
```

Для контейнера `127.0.0.1:10809` означает сам контейнер. Прокси Happ на Windows-хосте требует адреса `http://host.docker.internal:10809` и разрешенного доступа Happ с этой стороны. Этот путь отдельно не проверен. Если сервис запущен на сервере с прямым доступом к OpenRouter, оставьте `AI_PROXY_URL=`.

Локальный `compose.yaml` запускает самостоятельный HTTP-сервис с `RABBITMQ_ENABLED=false`. Для gateway + RabbitMQ + AI используйте корневой `compose.ai.yaml`.

Compose внутри контейнера задает `HOST=0.0.0.0`, `PORT=3006`, внешний порт читает из `.env`. Соседний backend в общей Docker-сети обращается к `http://ai-service:3006`. `.env` не включается в image, runtime содержит только production-зависимости и сборку.

## Проверки и устройство

```powershell
npm run typecheck
npm test
npm run test:smoke
npm run diagnose:openrouter
npm audit --omit=dev
```

`npm test` подменяет провайдера, не использует настоящие ключи и не делает inference. Проверяются контракт OpenRouter, Zod, ошибки и PDF engines, реальные файлы, Swagger, лимиты и изоляция прокси от обычного fetch. `test:smoke` запускает сборку на свободном порту и проверяет health/Swagger без inference. `diagnose:openrouter` использует ваш ключ только для чтения metadata, подтверждает авторизацию и объявленные возможности модели, не распознает документы и не подтверждает остаток баланса.

Основные файлы:

- `src/upd/document-validator.ts` — файлы и лимиты.
- `src/upd/openrouter-transport.ts` — SDK, официальный endpoint OpenRouter, опциональный CONNECT-прокси.
- `src/upd/openrouter-extractor.ts` — сообщения, файл, strict schema, проверка ответа.
- `src/upd/quantity-column.ts` — разбор буквального содержимого графы 3 без использования соседних кодов или арифметики.
- `src/upd/provider-error.ts` — безопасные ошибки провайдера.
- `src/upd/product.schema.ts` и `upd.prompt.ts` — контракт и правила чтения.
- `src/upd/upd.service.ts` и `upd.controller.ts` — обработка и HTTP/Swagger.

Файлы держатся в памяти, не сохраняются сервисом на диск, не создаются объекты OpenRouter Files. Данные отправляются OpenRouter и выбранному upstream-провайдеру; обработка/хранение зависит от их правил и настроек аккаунта. Локальная проверка PDF не является полной антивирусной проверкой.

Поддерживаются PNG/JPEG/WEBP и PDF. Зашифрованные PDF, анимированные изображения, SVG/TIFF/BMP/HEIC отклоняются. Большой допустимый PDF все равно может превысить контекст модели — тогда разделите документ. Для Swagger закреплен исправленный `js-yaml` через npm overrides; полный npm audit также проверяет dev-инструменты, не входящие в runtime.

## RPC и ограничения транспорта

Gateway отправляет `{ file: { originalname, mimetype, base64 }, deadlineAt }`. Worker возвращает `{ success: true, data: Recognition }` либо `{ success: false, error: { status, code, message } }`. Файл декодируется и проверяется повторно. Просроченные команды не вызывают inference. Предварительная и нормализованная схема, целые цены, продавец и текст графы 3 сохраняются в обоих транспортных вариантах.

Брокер должен разрешать сообщение не меньше 32 MiB при файлах до 20 MiB. В `stoq-backend/docker/rabbitmq/rabbitmq.conf` задан соответствующий лимит. Gateway по умолчанию ждет 150 секунд, SDK OpenRouter — 120 секунд. Остальные RPC-вызовы сохраняют свои прежние 5 секунд.
