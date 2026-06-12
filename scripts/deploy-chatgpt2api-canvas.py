#!/usr/bin/env python3
"""Deploy infinite-canvas to the existing chatgpt2api Docker Compose host.

Password can be passed with:
  --password "server ssh password"
or, for non-interactive automation only:
  INFINITE_CANVAS_SSH_PASSWORD or SSH_PASSWORD

The script only updates the `infinite-canvas` service in the existing
`/opt/chatgpt2api/docker-compose.yml` project. It does not run `down`, prune
Docker resources, or restart other services.
"""

from __future__ import annotations

import argparse
import fnmatch
import os
import shlex
import tarfile
import tempfile
import time
from pathlib import Path

import paramiko


DEFAULT_HOST = "111.230.202.235"
DEFAULT_USER = "root"
DEFAULT_REMOTE_ROOT = "/opt/chatgpt2api"
DEFAULT_SERVICE = "infinite-canvas"
DEFAULT_IMAGE = "infinite-canvas:multi-channel"
DEFAULT_CONTAINER = "chatgpt2api-prod-canvas"
DEFAULT_PORT = "127.0.0.1:18082"

EXCLUDED_DIRS = {".git", ".idea", "node_modules", ".next", ".source", "out", "data", ".cache"}
EXCLUDED_SUFFIXES = (".tar", ".tar.gz", ".zip", ".7z", ".log", ".tsbuildinfo")
EXCLUDED_PATTERNS = ("output-*-auth-state.json", "*auth-state*.json")
SERVICE_ENV_KEYS = (
    "TENCENT_COS_SECRET_ID",
    "TENCENT_COS_SECRET_KEY",
    "TENCENT_COS_BUCKET",
    "TENCENT_COS_REGION",
    "TENCENT_COS_CDN_DOMAIN",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[1]), help="Local repository root.")
    parser.add_argument("--host", default=os.environ.get("INFINITE_CANVAS_SSH_HOST", DEFAULT_HOST))
    parser.add_argument("--user", default=os.environ.get("INFINITE_CANVAS_SSH_USER", DEFAULT_USER))
    parser.add_argument("--password", default="", help="SSH password for this execution. Prefer this over persistent environment variables.")
    parser.add_argument("--remote-root", default=os.environ.get("INFINITE_CANVAS_REMOTE_ROOT", DEFAULT_REMOTE_ROOT))
    parser.add_argument("--service", default=os.environ.get("INFINITE_CANVAS_COMPOSE_SERVICE", DEFAULT_SERVICE))
    parser.add_argument("--image", default=os.environ.get("INFINITE_CANVAS_DOCKER_IMAGE", DEFAULT_IMAGE))
    parser.add_argument("--container", default=os.environ.get("INFINITE_CANVAS_CONTAINER", DEFAULT_CONTAINER))
    parser.add_argument("--port", default=os.environ.get("INFINITE_CANVAS_LOCAL_PORT", DEFAULT_PORT))
    parser.add_argument("--build-timeout", type=int, default=int(os.environ.get("INFINITE_CANVAS_BUILD_TIMEOUT", "1200")))
    parser.add_argument("--frontend-only", action="store_true", default=os.environ.get("INFINITE_CANVAS_FRONTEND_ONLY") == "1", help="Reuse the current image runtime and rebuild only the Next.js frontend.")
    parser.add_argument("--keep-remote-build-dir", action="store_true", help="Do not remove the remote temporary build directory.")
    return parser.parse_args()


def should_exclude(root: Path, path: Path) -> bool:
    rel = path.relative_to(root).as_posix()
    parts = set(rel.split("/"))
    if parts & EXCLUDED_DIRS:
        return True
    if rel == ".env" or rel.startswith(".env."):
        return True
    if any(fnmatch.fnmatch(path.name, pattern) or fnmatch.fnmatch(rel, pattern) for pattern in EXCLUDED_PATTERNS):
        return True
    return path.is_file() and rel.endswith(EXCLUDED_SUFFIXES)


def create_package(root: Path) -> Path:
    output = Path(tempfile.gettempdir()) / f"infinite-canvas-deploy-{int(time.time())}.tar.gz"
    with tarfile.open(output, "w:gz") as tar:
        for path in root.rglob("*"):
            if should_exclude(root, path):
                continue
            tar.add(path, arcname=path.relative_to(root), recursive=False)
    return output


def connect(host: str, user: str, password: str) -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=host, username=user, password=password, timeout=20, banner_timeout=20, auth_timeout=20)
    return client


def run(client: paramiko.SSHClient, command: str, timeout: int = 120, stream: bool = False) -> str:
    stdin, stdout, stderr = client.exec_command(command, get_pty=stream, timeout=timeout)
    chunks: list[str] = []
    if stream:
        for line in iter(stdout.readline, ""):
            print(line, end="")
            chunks.append(line)
    else:
        chunks.append(stdout.read().decode("utf-8", "replace"))
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    output = "".join(chunks)
    if code != 0:
        raise RuntimeError(f"Remote command failed ({code}):\n{command}\n{output}{error}")
    if error:
        output += error
    return output


def upload(client: paramiko.SSHClient, local_path: Path, remote_path: str) -> None:
    sftp = client.open_sftp()
    try:
        sftp.put(str(local_path), remote_path)
    finally:
        sftp.close()


def upload_text(client: paramiko.SSHClient, content: str, remote_path: str) -> None:
    sftp = client.open_sftp()
    try:
        with sftp.file(remote_path, "w") as file:
            file.write(content)
    finally:
        sftp.close()


def service_env_from_local() -> dict[str, str]:
    return {key: value for key in SERVICE_ENV_KEYS if (value := os.environ.get(key, "").strip())}


def service_override_content(service: str, env: dict[str, str]) -> str:
    lines = ["services:", f"  {service}:", "    environment:"]
    lines.extend(f"      {key}: {yaml_quote(value)}" for key, value in env.items())
    return "\n".join(lines) + "\n"


def yaml_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> None:
    args = parse_args()
    password = args.password or os.environ.get("INFINITE_CANVAS_SSH_PASSWORD") or os.environ.get("SSH_PASSWORD")
    if not password:
        raise SystemExit("Pass --password or set INFINITE_CANVAS_SSH_PASSWORD / SSH_PASSWORD before running this script.")

    root = Path(args.root).resolve()
    package = create_package(root)
    remote_stamp = int(time.time())
    remote_tar = f"/tmp/{package.name}"
    remote_dir = f"/tmp/infinite-canvas-deploy-{remote_stamp}"

    print(f"Package: {package} ({package.stat().st_size} bytes)")
    print(f"Target: {args.user}@{args.host}:{args.remote_root} service={args.service}")

    client = connect(args.host, args.user, password)
    try:
        remote_override = f"{args.remote_root}/docker-compose.infinite-canvas.override.yml"
        service_env = service_env_from_local()
        if service_env:
            upload_text(client, service_override_content(args.service, service_env), remote_override)
            print(f"Updated service environment override: {remote_override}")
        override_exists = run(client, f"test -f {remote_override} && echo yes || true", timeout=30).strip() == "yes"
        compose_files = f"-f {args.remote_root}/docker-compose.yml" + (f" -f {remote_override}" if override_exists else "")

        inspect = run(
            client,
            f"set -e; test -f {args.remote_root}/docker-compose.yml; "
            f"docker compose {compose_files} config --services | grep -x {args.service!r}; "
            f"docker ps --filter name={args.container!r} --format '{{{{.Names}}}} {{{{.Status}}}}'",
        )
        print(inspect.strip())

        print(f"Uploading to {remote_tar}")
        upload(client, package, remote_tar)

        dockerfile = "Dockerfile.web-only" if args.frontend_only else "Dockerfile"
        extra_build_args = f"--build-arg BASE_IMAGE={args.image}" if args.frontend_only else ""
        print(f"Build mode: {'frontend-only' if args.frontend_only else 'full'}")

        build_cmd = f"""
set -euo pipefail
rm -rf {remote_dir}
mkdir -p {remote_dir}
tar -xzf {remote_tar} -C {remote_dir}
cd {remote_dir}
timeout {args.build_timeout}s docker build --progress=plain -f {dockerfile} {extra_build_args} -t {args.image} .
cd {args.remote_root}
docker compose {compose_files} up -d --no-deps --force-recreate {args.service}
sleep 5
docker ps --filter name={args.container!r} --format '{{{{.Names}}}} {{{{.Image}}}} {{{{.Status}}}}'
curl -fsS --max-time 15 http://{args.port}/ >/dev/null
"""
        run(client, f"bash -lc {shlex.quote(build_cmd)}", timeout=args.build_timeout + 180, stream=True)

        if not args.keep_remote_build_dir:
            run(client, f"rm -rf {remote_dir} {remote_tar}", timeout=60)
        print("Deployment finished.")
    finally:
        client.close()


if __name__ == "__main__":
    main()
