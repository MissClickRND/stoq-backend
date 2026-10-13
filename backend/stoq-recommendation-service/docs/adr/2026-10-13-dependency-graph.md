# Расчёт графа в recommendation-service

Контекст: HTTP API аналитики находится в gateway, но построение связей и расчёт доступности относятся к recommendation-service. Пользователь требует сохранять прежний механизм RabbitMQ.

Решение: GET /analytics/graph в gateway проксирует GET_DEPENDENCY_GRAPH в существующую recommendation.commands. Тот же RecommendationsRPCController использует RabbitRPC и executeRpc. Расчёт находится в recommendation-service, который обращается к каталогу через прежнюю GET_DISHES. Порог low_stock (по умолчанию 5 порций) принадлежит recommendation-service.

Последствия: правила больше не находятся в gateway; frontend получает прежний nodes/edges контракт по новому API-пути. Требуется запущенный recommendation-service. Конфигурация брокера, очереди, exchanges и RPC-обёртка не изменены; добавлен только routing key для отдельной операции графа. Existing GET_RECOMMENDATION продолжает возвращать стоп-лист.
