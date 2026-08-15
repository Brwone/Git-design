#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

: "${ALIBABA_CLOUD_ACCESS_KEY_ID:?Set ALIBABA_CLOUD_ACCESS_KEY_ID}"
: "${ALIBABA_CLOUD_ACCESS_KEY_SECRET:?Set ALIBABA_CLOUD_ACCESS_KEY_SECRET}"

ECS_HOST="121.41.64.245"
ECS_PATH="/var/www/Git-design"
INSTANCE_ID="i-bp1hfcmvvwjgsfeq4bm1"
REGION="cn-hangzhou"
KEY="$(mktemp -u /tmp/ecs-deploy-XXXXXX)"
cleanup() { rm -f "$KEY" "$KEY.pub"; }
trap cleanup EXIT

ssh-keygen -t ed25519 -f "$KEY" -N '' -q
PUBKEY="$(cat "$KEY.pub")"

find assets -type d -print0 | xargs -0 chmod 755
find assets -type f -print0 | xargs -0 chmod 644

python3 <<PY
import os, time
from alibabacloud_ecs20140526.client import Client as EcsClient
from alibabacloud_tea_openapi import models as open_api_models
from alibabacloud_ecs20140526 import models as ecs_models

config = open_api_models.Config(
    access_key_id=os.environ["ALIBABA_CLOUD_ACCESS_KEY_ID"],
    access_key_secret=os.environ["ALIBABA_CLOUD_ACCESS_KEY_SECRET"],
)
config.endpoint = "ecs.cn-hangzhou.aliyuncs.com"
client = EcsClient(config)
pubkey = """$PUBKEY""".strip()

script = f"""#!/bin/bash
set -e
mkdir -p /root/.ssh
chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys
grep -v 'cursor-ecs-deploy' /root/.ssh/authorized_keys > /tmp/ak || true
echo '{pubkey} cursor-ecs-deploy' >> /tmp/ak
mv /tmp/ak /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
echo KEY_ADDED
"""

req = ecs_models.RunCommandRequest(
    region_id="$REGION",
    instance_id=["$INSTANCE_ID"],
    type="RunShellScript",
    command_content=script,
    name="cursor-ecs-deploy-key",
)
invoke_id = client.run_command(req).body.invoke_id
print("invoke_id", invoke_id)

for _ in range(90):
    time.sleep(2)
    r = client.describe_invocation_results(
        ecs_models.DescribeInvocationResultsRequest(region_id="$REGION", invoke_id=invoke_id)
    )
    inv = r.body.invocation
    items = inv.invocation_results.invocation_result if inv and inv.invocation_results else []
    if not items:
        continue
    status = items[0].invoke_record_status
    output = (items[0].output or "")[:800]
    if status in ("Success", "Failed", "PartialFailed", "Timeout", "Stopped", "Finished"):
        print("status", status)
        print("output", output)
        exit_code = items[0].exit_code
        invocation_status = getattr(items[0], "invocation_status", None)
        ok = status == "Success" or (status == "Finished" and exit_code == 0) or invocation_status == "Success"
        if not ok:
            raise SystemExit(f"Cloud assistant failed: {status} exit={exit_code}")
        break
else:
    raise SystemExit("Cloud assistant timeout")
PY

echo "=== rsync ==="
rsync -avz --delete \
  -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes -o ConnectTimeout=20" \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '.venv-webp/' \
  --exclude '.DS_Store' \
  --exclude '*.log' \
  ./ "root@${ECS_HOST}:${ECS_PATH}/"

echo "=== post-deploy ==="
ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes "root@${ECS_HOST}" "
  find ${ECS_PATH} -type d -exec chmod 755 {} +
  find ${ECS_PATH} -type f -exec chmod 644 {} +
  nginx -t && systemctl reload nginx
  grep -v cursor-ecs-deploy /root/.ssh/authorized_keys > /tmp/ak && mv /tmp/ak /root/.ssh/authorized_keys
  chmod 600 /root/.ssh/authorized_keys
  ls -lh ${ECS_PATH}/assets/hero-video3.mov ${ECS_PATH}/assets/about-browne.webp ${ECS_PATH}/index.html
  echo DEPLOY_OK
"

echo "=== verify ==="
curl -sI --max-time 15 "http://${ECS_HOST}/" | head -8
curl -s --max-time 15 -o /dev/null -w 'hero-mov:%{http_code} size:%{size_download}\n' "http://${ECS_HOST}/assets/hero-video3.mov?v=202608142"
curl -s --max-time 15 -o /dev/null -w 'about:%{http_code} size:%{size_download}\n' "http://${ECS_HOST}/assets/about-browne.webp?v=202608142"
