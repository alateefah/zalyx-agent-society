# Zalyx Agent Society Quickstart

## Live Demo

- App: http://139.129.19.5:3001/
- Health: http://139.129.19.5:3001/api/health

The live deployment runs Docker on Alibaba Cloud ECS with Qwen Cloud live mode
and Alibaba Cloud Tablestore live mode. The health response should show
`ai.mockMode: false`, `database.mockMode: false`, and
`database.instance: "zalyx-agent-db"`.

## Local Prerequisites

- Node.js 20+
- Yarn 1.x
- A Qwen Cloud API key for live inference
- Optional Alibaba Cloud Tablestore credentials for merchant-table persistence

## Install

```bash
git clone https://github.com/alateefah/zalyx-agent-society.git
cd zalyx-agent-society
yarn install
cd frontend && yarn install && cd ..
cp .env.example .env
```

Set `QWEN_API_KEY` in `.env`; the app does not invent Qwen responses when the
key is missing. Set all four `OTS_*` values to use Alibaba Cloud Tablestore for
the merchant table. Leave them blank locally to load merchants from
`data/snapshots/*.json`:

```env
QWEN_API_KEY=your_qwen_cloud_api_key_here
QWEN_MODEL=qwen-max
QWEN_API_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
PORT=3001

DATA_BACKEND=local
OTS_ENDPOINT=https://<instance>.<region>.ots.aliyuncs.com
OTS_INSTANCE=<your_instance_name>
OTS_ACCESS_KEY_ID=
OTS_ACCESS_KEY_SECRET=
DECISION_STORE=auto
LOCAL_MERCHANTS_DIR=data/snapshots
LOCAL_DECISIONS_FILE=data/decisions.local.json
```

## Run Locally

```bash
yarn dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001
- Health: http://localhost:3001/api/health

Open a merchant workspace, run underwriting, and review the streamed agent
stages. Reports are saved under permanent decision URLs and can be reopened from
the workspace history.

## Validate

```bash
yarn type-check
yarn audit:repo
cd frontend && yarn lint && cd ..
```

Optional broader checks:

```bash
yarn test --runInBand
yarn build
```

`DATA_BACKEND=local` loads the three demo merchants from `data/snapshots`,
saves custom merchants there, still calls Qwen Cloud for the decision, and
writes reports to `data/decisions.local.json`.

For Alibaba ECS, use `DATA_BACKEND=tablestore`. To intentionally reset the demo
database on deployment, set `RESET_TABLESTORE_ON_DEPLOY=true` and
`CONFIRM_TABLESTORE_RESET=<OTS_INSTANCE>` before `docker compose up`; the
container will recreate the OTS tables, preload the three merchants, call Qwen
for decisions, and store results in Tablestore.
