# Domain Monitor API

Domain Monitor API — это Node.js сервис для мониторинга доменов и проверки их доступности через различные прокси.

## Возможности
- Проверка SSL-сертификата домена
- Получение IP-адреса и NS-записей
- Пинг балансировщика
- Проверка доступности домена через список прокси (HTTP/SOCKS5)
- Гибкая настройка списка доменов и прокси

## Структура проекта
```
index.js                # Точка входа
package.json            # Зависимости и скрипты
controllers/
  cloudflareController.js
  domainController.js   # Основная логика мониторинга
models/
  domains.js            # Список доменов для мониторинга
  proxies.js            # Список прокси
routes/
  domainRoutes.js       # Маршруты API
```

## Быстрый старт
1. Клонируйте репозиторий:
   ```sh
   git clone <repo-url>
   cd domain-monitor-api
   ```
2. Установите зависимости:
   ```sh
   npm install
   ```
3. Скопируйте и настройте файлы доменов и прокси:
   ```sh
   cp models/domains.js
   cp models/proxies.example.js models/proxies.js
   # Отредактируйте domains.js и proxies.js под свои задачи
   ```
4. Запустите сервер:
   ```sh
   node index.js
   ```

## Формат файла proxies.js
```js
export const proxies = [
  {
    proxyType: "ROSTELECOM", // Название
    type: "http",            // http или socks5
    host: "host",            // IP или домен прокси
    port: 8080,               // Порт
    user: "login",           // (опционально) логин
    pass: "password",        // (опционально) пароль
  },
  // ...
];
```

## Формат файла domains.js
```js
export const domains = [
  {
    domain: "example.com",   // Домен
    balanser: "1.2.3.4",    // IP балансировщика
  },
  // ...
];
```

## API
- `GET /api/domains/check` — запустить проверку всех доменов

## Зависимости
- Node.js >= 18
- ping
- https-proxy-agent

## Лицензия
MIT
