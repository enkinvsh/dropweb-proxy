# Store listing — Dropweb Proxy

Copy-paste reference for the Chrome Web Store and Firefox AMO dashboards.

- **Extension name:** Dropweb Proxy
- **Privacy policy URL:** https://enkinvsh.github.io/dropweb-proxy/privacy-policy.html
- **Homepage / support:** https://github.com/enkinvsh/dropweb-proxy
- **License:** MIT
- **Category:** Chrome → *Tools* · Firefox → *Privacy & Security*
- **Assets:** store icon 128×128 (`public/icons/on-128.png`) · screenshots 1280×800 (`docs/store/chrome-1..4.png`)

---

## Summary (≤132 chars)

**EN:** One-click proxy on/off switch for HTTP or SOCKS5, with automatic WebRTC leak protection. No accounts, no data collection.

**RU:** Переключатель браузерного прокси (HTTP/SOCKS5) одной кнопкой с автозащитой от утечки WebRTC. Без аккаунтов и сбора данных.

---

## Full description

### EN

Dropweb Proxy is a minimal Chrome and Firefox extension that turns the browser proxy on and off with a single power button.

• One local proxy profile — HTTP or SOCKS5, with host, port and a bypass list
• One-click toggle in the toolbar popup; the icon reflects the state at a glance
• Automatic WebRTC leak protection while the proxy is on, so your real IP can't leak
• A dedicated options page — saving while enabled re-applies instantly
• RU / EN interface

Privacy first: no accounts, no servers, no analytics, no tracking. Everything is stored locally on your device and nothing is transmitted. The extension only routes requests through the proxy endpoint you configure (for example a local address such as 127.0.0.1:7890).

Permissions are kept to the minimum — proxy, storage, privacy and alarms — with no access to the content of the pages you visit.

Open source (MIT): https://github.com/enkinvsh/dropweb-proxy

### RU

Dropweb Proxy — минимальное расширение для Chrome и Firefox, которое включает и выключает браузерный прокси одной кнопкой питания.

• Один локальный профиль — HTTP или SOCKS5: хост, порт и список исключений
• Переключатель в попапе на панели; иконка показывает состояние с первого взгляда
• Автоматическая защита от утечки WebRTC, пока прокси включён — реальный IP не утекает
• Отдельная страница настроек; сохранение при включённом прокси сразу применяет изменения
• Интерфейс RU / EN

Приватность прежде всего: без аккаунтов, серверов, аналитики и трекинга. Все настройки хранятся локально на устройстве и никуда не передаются. Расширение лишь направляет запросы через прокси, который настраиваете вы (например, локальный адрес вида 127.0.0.1:7890).

Разрешения минимальны — proxy, storage, privacy и alarms — без доступа к содержимому посещаемых страниц.

Открытый код (MIT): https://github.com/enkinvsh/dropweb-proxy

---

## Chrome Web Store — Privacy tab

### Single purpose

Dropweb Proxy has a single purpose: to turn the browser's proxy on and off using one local, user-configured proxy profile (HTTP or SOCKS5).

### Permission justifications

- **proxy** — Required to apply the user's configured proxy profile to the browser's network requests. This is the core function: turning the proxy on writes the profile to the browser's proxy settings; turning it off releases control.
- **storage** — Saves the user's single proxy profile (type, host, port, bypass list) and the on/off state locally so the choice persists across sessions. No data leaves the device.
- **privacy** — Sets the browser's WebRTC IP-handling policy (`webRTCIPHandlingPolicy`) so the user's real IP address cannot leak outside the proxy while it is enabled. This is the narrowest available API for WebRTC leak protection.
- **alarms** — Schedules a lightweight, periodic local reachability check that only updates the toolbar icon / status indicator. It collects nothing and sends nothing off the device.

### Host permissions

None. The extension does not request host permissions and has no access to page content.

### Remote code

No — the extension does not use remote code. All code is bundled in the package.

### Data usage

- **Data collected:** none.
- Certify all three: does **not** sell or transfer user data to third parties (outside approved use cases); does **not** use or transfer data for purposes unrelated to the single purpose; does **not** use or transfer data to determine creditworthiness or for lending.

---

## Firefox AMO

- **Name / summary / description:** same as above (AMO supports per-locale listings — add EN and RU).
- **Categories:** Privacy & Security.
- **License:** MIT.
- **Source code (REQUIRED):** the extension is bundled/minified (WXT + Vite/esbuild), so AMO requires source. Upload `dropweb-proxy-<version>-sources.zip` (produced by `bun run zip:firefox`). It already contains `BUILD.md` with reproducible build steps (Bun 1.3.14, `bun install --frozen-lockfile && bun run zip:firefox`) and `bun.lock`. ⚠️ AMO's default reviewer environment uses Node/npm — `BUILD.md` tells the reviewer to install Bun first.

---

## Pre-submit checklist

- [ ] Chrome: account verified + 2-Step Verification enabled
- [ ] Upload `dropweb-proxy-0.1.1-chrome.zip`
- [ ] Fill Store Listing (name, description, icon 128×128, screenshots 1280×800, category)
- [ ] Fill Privacy tab (single purpose, 4 permission justifications, data usage, privacy policy URL)
- [ ] Firefox: upload `dropweb-proxy-0.1.1-firefox.zip` + attach `-sources.zip`
- [ ] Expect longer review for the `proxy` permission; respond promptly to reviewer questions
