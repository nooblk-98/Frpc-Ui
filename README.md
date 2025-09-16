# frpc UI

A lightweight Node.js + vanilla web UI to manage a local [`frpc`](https://github.com/fatedier/frp) client. Configure your tunnels, persist settings, and start or stop the frpc process directly from the browser.

Key niceties include:

- Live server reachability indicator in the Common settings panel
- Auto-start of frpc once a valid server address/port is configured (and opt-out by pressing **Stop frpc**)
- Dedicated Save buttons for both global settings and forwarding rules
- A friendly footer linking back to the maintainer

## Prerequisites

- Node.js 18+
- A local `frpc` binary (if you run outside Docker; the included image already ships with one)

## Getting started

```bash
npm install
npm start
```

By default the web server listens on http://localhost:4000.

## Docker

The included `docker-compose.yml` brings up two services:

- `frpc`: the FRP client, based on `${FRPC_IMAGE:-snowdreamtech/frpc:alpine}`
- `frpc-ui`: this web UI, built on top of the chosen FRPC image so the binary is available inside the container and published on port 4000

> **Note**: the `frpc` service still uses `network_mode: host` to expose your tunnels just like the upstream frp examples. Host networking requires a Linux engine; on macOS/Windows the UI continues to work, but `frpc` will not be able to bind remote ports unless you run inside WSL or a Linux VM.

Bring the stack online:

```bash
docker compose up --build -d
```

Configuration is persisted on the host in the `./data` folder:

- `config.json`: settings saved by the UI
- `frpc.generated.toml` / `frpc.generated.ini`: auto-generated client config that the FRPC container consumes

Follow the combined logs with:

```bash
docker compose logs -f
```

Shut everything down:

```bash
docker compose down
```

The Dockerfile copies the FRPC binary from `snowdreamtech/frpc`; swap to another variant (`:alpine`, `:debian`, `:bookworm`, etc.) by setting `FRPC_IMAGE` in a `.env` file or via environment variables before running Compose.

## Usage

1. Open the dashboard and fill in the Common section with your FRP server address, port, token, and user (if required). The header now shows a live connection check so you immediately know if the server is reachable.
2. Add forwarding entries for every service you want to expose. Each entry becomes a section in the generated `frpc` config.
3. Click **Save Settings** or **Save Forwardings** to persist updates in `data/config.json`.
4. The backend writes `data/frpc.generated.ini` and `data/frpc.generated.toml` on every save/start. These files are bind-mounted into the frpc container.
5. frpc starts automatically whenever the stack boots and a valid address/port is configured. Use **Stop frpc** if you need to keep it down; **Start frpc** brings it back manually.

The UI footer links back to the project author if you want to follow along or contribute.

## Development notes

- API endpoints live under `/api/*` and the static UI is served from `public/`.
- Configuration is persisted in `data/config.json`; delete the file to reset to defaults.
- The backend keeps a rolling window of the last 500 log lines for display in the UI.

## Limitations

- The UI currently covers the most common frpc fields (tcp/udp/http/https). Advanced directives can be added by editing `data/config.json` manually.
- frpc must run on the same machine as this UI, and the process inherits the working directory of the binary location.


