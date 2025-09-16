# frpc UI

A lightweight Node.js + vanilla web UI to manage a local [`frpc`](https://github.com/fatedier/frp) client. Configure your tunnels, persist settings, and start or stop the frpc process directly from the browser.

## Prerequisites

- Node.js 18+
- A local `frpc` binary (downloaded separately from the official FRP releases)

## Getting started

```bash
npm install
npm start
```

By default the web server listens on http://localhost:4000.

## Docker

The included `docker-compose.yml` brings up two services:

- `frpc`: the FRP client, based on `${FRPC_IMAGE:-snowdreamtech/frpc:alpine}`
- `frpc-ui`: this web UI, built on top of the chosen FRPC image so the binary is available inside the container

> **Note**: `network_mode: host` is used to match the upstream Docker examples. This requires running on a Linux host (Docker Desktop on macOS/Windows does not support host networking).

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

1. Open the dashboard and point **frpc executable path** at your downloaded `frpc` binary (the Docker image defaults to `/usr/local/bin/frpc`).
2. Fill in the Common section with the FRP server address, port, and optional token/user.
3. Add forwarding entries for every service you want to expose. Each entry becomes a section in the generated `frpc` config.
4. Click **Save Settings** to persist the configuration in `data/config.json`.
5. Use **Start frpc** / **Stop frpc** to control the client. The UI streams recent stdout/stderr lines for quick feedback.

The application writes generated configuration files (`data/frpc.generated.ini` and `data/frpc.generated.toml`) whenever frpc is saved or started. These files are ignored by Git.

## Development notes

- API endpoints live under `/api/*` and the static UI is served from `public/`.
- Configuration is persisted in `data/config.json`; delete the file to reset to defaults.
- The backend keeps a rolling window of the last 500 log lines for display in the UI.

## Limitations

- The UI currently covers the most common frpc fields (tcp/udp/http/https). Advanced directives can be added by editing `data/config.json` manually.
- frpc must run on the same machine as this UI, and the process inherits the working directory of the binary location.


