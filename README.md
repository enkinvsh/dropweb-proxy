<div align="right">
  <a href="README_EN.md">English</a>
</div>

<img src="assets/brand/header.png" alt="dropweb proxy — переключатель прокси для Chrome и Firefox" width="720" />

<a href="https://github.com/enkinvsh/dropweb-proxy/releases">
  <img src="https://img.shields.io/github/v/release/enkinvsh/dropweb-proxy?include_prereleases&style=for-the-badge&color=15803D&labelColor=0D1117&label=release" alt="Последний релиз">
</a>
<a href="https://github.com/enkinvsh/dropweb-proxy/stargazers">
  <img src="https://img.shields.io/github/stars/enkinvsh/dropweb-proxy?style=for-the-badge&color=15803D&labelColor=0D1117" alt="GitHub Stars">
</a>

<br>

<a href="https://github.com/enkinvsh/dropweb-proxy/releases">
  <img src="https://img.shields.io/badge/Chrome-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Chrome">
</a>
<a href="https://github.com/enkinvsh/dropweb-proxy/releases">
  <img src="https://img.shields.io/badge/Firefox-FF7139?style=for-the-badge&logo=firefoxbrowser&logoColor=white" alt="Firefox">
</a>

---

**dropweb proxy** — минимальное расширение для Chrome и Firefox (Manifest V3), которое включает и выключает браузерный прокси одной кнопкой. Один локальный профиль (HTTP или SOCKS5), никакого сбора данных, никаких серверов — только чистый переключатель.

<table>
  <tr>
    <td><img src="docs/screenshots/popup-off.png" alt="Попап: прокси выключен" width="200" /></td>
    <td><img src="docs/screenshots/popup-on.png" alt="Попап: прокси включён" width="200" /></td>
    <td><img src="docs/screenshots/options.png" alt="Страница настроек прокси" width="236" /></td>
  </tr>
</table>

---

## <img src="docs/icons/toggle.svg" width="24" alt="" /> Возможности

- Один профиль прокси: тип (**HTTP** или **SOCKS5**), хост, порт и список исключений
- По умолчанию — HTTP `127.0.0.1:7890`, исключения `localhost`, `127.0.0.1`, `::1`
- Кнопка-переключатель в попапе; иконка на панели отражает состояние — ч/б когда выключено, цветной логотип dropweb когда включено, оранжевый при проблеме
- Автоматическая защита от утечки **WebRTC**, пока прокси включён (Chrome — трафик WebRTC идёт через прокси; Firefox — WebRTC отключается)
- Правка профиля на странице настроек; сохранение при включённом прокси сразу применяет изменения
- Родная локализация **RU / EN**

---

## <img src="docs/icons/settings.svg" width="24" alt="" /> Установка

Расширение ещё не в сторах — загрузите распакованную сборку из [Releases](https://github.com/enkinvsh/dropweb-proxy/releases) или соберите сами (см. ниже).

### Chrome / Chromium / Edge

1. Откройте `chrome://extensions` и включите **Режим разработчика** (справа вверху).
2. Нажмите **Загрузить распакованное расширение** и выберите папку `chrome-mv3`.
3. Откройте попап на панели и нажмите кнопку питания.

### Firefox

1. Откройте `about:debugging#/runtime/this-firefox`.
2. Нажмите **Загрузить временное дополнение…** и выберите `firefox-mv3/manifest.json`.
3. Если при включении запрошен доступ в приватных окнах — откройте `about:addons`, выберите расширение и включите **Запускать в приватных окнах**.

---

## <img src="docs/icons/shield.svg" width="24" alt="" /> Разрешения и приватность

Расширение не собирает и не передаёт данные — все настройки хранятся локально. Запрашиваются только минимально необходимые разрешения, без доступа к сайтам (`host permissions`):

- **`proxy`** — применять выбранный прокси к сетевым запросам браузера
- **`storage`** — хранить профиль и состояние вкл/выкл локально
- **`privacy`** — управлять политикой WebRTC, чтобы реальный IP не утекал в обход прокси
- **`alarms`** — фоновая проверка доступности, которая обновляет только иконку

Логика **fail-closed**: «включено» означает, что настройки применены, а не что конечная точка доступна. Проверка доступности носит справочный характер и никогда не блокирует включение/выключение.

---

## <img src="docs/icons/code.svg" width="24" alt="" /> Сборка из исходников

Нужен [Bun](https://bun.sh).

```bash
bun install
bun run build:chrome    # -> .output/chrome-mv3
bun run build:firefox   # -> .output/firefox-mv3
bun run build           # обе сборки

bun run dev             # Chrome с горячей перезагрузкой
bun run check           # Biome + tsc (strict)
bun run test            # юнит-тесты (Vitest)
```

## <img src="docs/icons/license.svg" width="24" alt="" /> Лицензия

**MIT** — свободная лицензия: код можно использовать, изменять и распространять, в том числе в коммерческих целях, с сохранением копирайта. См. [LICENSE](LICENSE). Сторонние компоненты — [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

---

<sub>dropweb proxy — инструмент для приватности личного трафика. Порядок использования определяется законодательством вашей страны; ответственность за использование несёт пользователь.</sub>
