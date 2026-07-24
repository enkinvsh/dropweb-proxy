# Dropweb Proxy, approved MVP design

**Дата:** 2026-07-23  
**Статус:** approved design, implementation plan follows review

## 1. Product scope

Dropweb Proxy - браузерное расширение для ручного применения одной локальной proxy-конфигурации. Пользователь редактирует тип, host, port и bypass на options page, затем явными кнопками в popup включает или отключает управление proxy-настройками.

MVP ограничен следующими решениями:

- WXT и strict TypeScript.
- Один shared source tree и отдельные MV3 artifacts для Chrome и Firefox.
- Background-owned browser adapters.
- Chrome применяет `fixed_servers`. Firefox применяет `proxy.settings`.
- После первой установки состояние `off`.
- Значения по умолчанию: HTTP, `127.0.0.1`, `7890`; bypass: `localhost`, `127.0.0.1`, `::1`.
- Options page редактирует HTTP или SOCKS5, host, port и bypass.
- Proxy auth отсутствует.
- RU/EN через нативную локализацию расширения.
- Popup содержит явные `Enable` и `Disable` и ссылку в настройки.
- Disable очищает или освобождает extension control над browser proxy settings.
- Конфигурация и нужное состояние сохраняются в extension storage.
- Permissions: только `proxy` и `storage`; нет host permissions и `proxy.onRequest`.

Не входят в MVP: profiles, PAC, routing rules, proxy reachability, traffic counters, analytics, accounts, themes, host permissions, `proxy.onRequest` и SwitchyOmega assets.

## 2. Architecture

### Shared layer

Общий код содержит доменную модель конфигурации, storage repository, сообщения между popup/options и background, локализованные ключи и UI. Конфигурация не содержит credentials, потому что proxy auth не поддерживается.

### Background layer

Только background владеет browser-specific adapter и вызывает proxy API. Popup и options page не вызывают Chrome или Firefox proxy API напрямую. Это даёт один UI и один доменный поток при разных API браузеров.

Adapter contract должен покрывать:

1. Применение сохранённой конфигурации.
2. Снятие extension control.
3. Чтение ownership или conflict-сигнала, если API его предоставляет.
4. Нормализацию browser API errors в доменное состояние `conflict` или `error`.

### Browser targets

Chrome target строит MV3 artifact с Chrome proxy API и режимом `fixed_servers`. Firefox target строит отдельный MV3 artifact и использует `browser.proxy.settings`. Поддерживаются ровно HTTP и SOCKS5 в обоих targets. В Firefox статический `proxy.settings.ssl` является слотом маршрутизации запросов к HTTPS destination URLs, а не HTTPS-to-proxy transport. Поддержка HTTPS-to-proxy transport потребовала бы `proxy.onRequest` и более широкого URL access, чего MVP намеренно избегает. Различия изолированы в adapters и target-specific manifest/configuration. Не следует переносить Chrome-specific field shapes в Firefox adapter или наоборот.

## 3. Data flow

1. On first install background сохраняет default configuration и `off`.
2. Options page читает конфигурацию из storage и валидирует локальные поля. При валидном save в `off` она только сохраняет конфигурацию. При save в `on` она отправляет typed background command; background сохраняет новую конфигурацию, ставит `applying`, вызывает adapter apply и сохраняет `on` при успехе или `conflict`/`error` при неуспехе. Options page никогда не вызывает proxy API напрямую.
3. Popup читает сохранённую конфигурацию и текущий доменный статус.
4. `Enable` отправляет команду background. Background ставит `applying`, вызывает adapter apply, сохраняет `on` при успехе или `conflict`/`error` при неуспехе.
5. `Disable` отправляет команду background. Background ставит `applying`, очищает или снимает extension control через adapter и сохраняет `off` при успехе или `error` при неуспехе.
6. UI получает состояние из background/storage и показывает его через status badge и текстовое сообщение.

Сохранённый `on` означает, что расширение успешно применило настройку. Он не означает, что proxy process доступен, что remote host отвечает или что browser traffic проходит через proxy.

## 4. State and error semantics

| Состояние | Смысл | UI |
| --- | --- | --- |
| `off` | Расширение не управляет proxy-настройкой | Enable доступна |
| `applying` | Background выполняет apply или release | Обе кнопки disabled, видимый loading text |
| `on` | Adapter успешно применил конфигурацию | Disable доступна |
| `conflict` | Настройкой управляет другое расширение или browser policy, когда это можно определить | Warning с объяснением, обе явные команды доступны |
| `error` | API или storage operation завершилась ошибкой | Error text, обе явные команды доступны |

`conflict` не маскируется как `on`. Error message сообщает, что действие не удалось, но не выдумывает причину, если API её не даёт. Reachability не измеряется и не отображается.

## 5. UI contract

Полный визуальный контракт находится в `DESIGN.md`. Popup остаётся компактным, 320 px шириной, с заголовком, status badge, конфигурацией, explicit Enable/Disable и settings link. Options page содержит одну форму и действия save/cancel. Все статусы имеют текстовую подпись, keyboard navigation, `aria-live` для обновлений и RU/EN строки.

## 6. Testing and verification

- Vitest: domain model, validation только HTTP и SOCKS5, storage mapping, background command handling и adapter contract tests.
- Chrome Playwright E2E: first install `off`, edit/save в `off` только сохраняет конфигурацию, edit/save в `on` повторно применяет её через background и проходит `applying` с `on`/`conflict`/`error` semantics, enable, disable, persisted settings и surface of conflict/error where controllable.
- Firefox smoke: build, install/load, popup opens, options page opens, save works, enable/disable command is dispatched.
- Dual build verification: Chrome MV3 artifact и Firefox MV3 artifact строятся отдельно в CI.
- Manual screenshot QA: все пять status states popup и options field error по `DESIGN.md`.

## 7. Acceptance criteria

1. После первой установки popup показывает `off`, HTTP `127.0.0.1:7890` и bypass `localhost`, `127.0.0.1`, `::1`.
2. Пользователь может сохранить HTTP или SOCKS5, host, port и bypass на options page, затем увидеть конфигурацию в popup после reopen. В `off` save только сохраняет конфигурацию; в `on` save отправляет typed background command для немедленного reapply, проходящего `applying` и те же `on`/`conflict`/`error` semantics, что и Enable.
3. Enable и Disable - отдельные явные действия. Disable снимает extension control, а не оставляет сохранённую proxy-конфигурацию активной.
4. Browser APIs вызываются только background-owned adapters.
5. Chrome artifact применяет `fixed_servers`; Firefox artifact применяет `proxy.settings`.
6. UI показывает только `off`, `applying`, `on`, `conflict` или `error`, с понятным текстом и без proxy reachability claim.
7. RU и EN UI доступны через нативную browser localization.
8. Vitest, Chrome Playwright E2E, Firefox smoke и обе сборки проходят перед выпуском.

## 8. Official references

- Chrome proxy API: https://developer.chrome.com/docs/extensions/reference/api/proxy
- Chrome ProxyServer objects: https://developer.chrome.com/docs/extensions/reference/api/proxy#proxy-server-objects
- MDN ProxyInfo type: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/proxy/ProxyInfo#type
- Firefox proxy schema: https://github.com/mozilla-firefox/firefox/blob/91d6cd2d1476bca635bb96f82ca34eda283b5460/toolkit/components/extensions/schemas/proxy.json#L32-L62
- MDN proxy API: https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/proxy
- MDN proxy settings: https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/proxy/settings
- WXT project structure: https://wxt.dev/guide/essentials/project-structure.html
- WXT manifest: https://wxt.dev/guide/essentials/config/manifest.html
- WXT targets: https://wxt.dev/guide/essentials/target-different-browsers.html
- WXT i18n: https://wxt.dev/guide/essentials/i18n.html
- WXT testing: https://wxt.dev/guide/essentials/unit-testing.html
- WXT E2E testing: https://wxt.dev/guide/essentials/e2e-testing.html
