#!/usr/bin/env python3

import yaml
import os
import sys
import platform
import subprocess
import re
import shutil
import signal
import time
import json
from typing import Optional, List, Dict, Tuple
from rich.console import Console
from rich.panel import Panel
from rich.text import Text
from rich.table import Table
from rich.live import Live
from InquirerPy import inquirer
from InquirerPy.base.control import Choice

# --- Constants ---
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
K8S_DIR = os.path.join(REPO_ROOT, "platform", "k8s")
CONSOLE = Console()
COMPOSE_FILE = os.path.join(REPO_ROOT, "platform", "docker-compose.yml")
COMPOSE_ENV = os.path.join(REPO_ROOT, "platform", ".env")

# Global flag for clean shutdown
shutdown_requested = False

def signal_handler(signum, frame):
    """Handle keyboard interrupt (Ctrl+C) gracefully."""
    global shutdown_requested
    shutdown_requested = True
    CONSOLE.print("\n[yellow]Shutdown requested. Exiting gracefully...[/yellow]")
    sys.exit(0)

# Register signal handler for clean shutdown
signal.signal(signal.SIGINT, signal_handler)

# --- Service Definitions (for Kubernetes) ---
# This data structure defines the resources associated with each logical service group.
K8S_SERVICE_GROUPS = {
    "Stateful Backend": {
        "description": "PostgreSQL and MinIO for persistent data storage.",
        "helm_releases": ["postgres-metastore", "minio"],
        "manifests": ["secrets/postgres-secret.yaml", "secrets/minio-secret.yaml"],
    },
    "Messaging": {
        "description": "Kafka (via Confluent) and Redis for real-time communication and caching.",
        "helm_releases": ["redis"],
        "manifests": ["apps/zookeeper.yaml", "apps/kafka.yaml"],
    },
    "Core Applications": {
        "description": "The main hexagon orchestrator and hexagonal worker services (hexagon, assistant-worker, agent-tool-worker, etc.)",
        "helm_releases": ["api-gateway", "identity-worker"],
        "manifests": [
            "config/core-config.yaml", "apps/control-plane.yaml",
            "config/worker-config.yaml", "apps/llm-worker.yaml", "apps/agent-tool-worker.yaml",
            "apps/data-processing-worker.yaml", "apps/interview-worker.yaml",
            "apps/latex-worker.yaml", "apps/resume-worker.yaml",
            "apps/wolfram-kernel.yaml", "apps/main-node.yaml",
            "rbac/main-node-observability-rbac.yaml"
        ],
    },
    "Scheduling App": {
        "description": "The AI-powered scheduling model service.",
        "helm_releases": [],
        "manifests": ["config/scheduling-model-config.yaml", "apps/scheduling-model.yaml"],
    },
    "News Ingestion Job": {
        "description": "The scheduled CronJob for ingesting news articles.",
        "helm_releases": [],
        "manifests": ["config/news-ingestion-config.yaml", "apps/news-ingestion-cronjob.yaml"],
    }
}

# --- Kubernetes Environment Logic ---

def get_group_resources(selected_groups: List[str]) -> Tuple[List[str], List[str]]:
    """Collects all manifests and Helm releases from a list of service groups."""
    manifests = []
    helm_releases = []
    for group_name in selected_groups:
        group_data = K8S_SERVICE_GROUPS.get(group_name, {})
        for manifest in group_data.get("manifests", []):
            manifests.append(os.path.join(K8S_DIR, manifest))
        helm_releases.extend(group_data.get("helm_releases", []))
    return sorted(list(set(manifests))), sorted(list(set(helm_releases)))


def _is_windows() -> bool:
    return platform.system().lower().startswith("win")


def _run_script(script_path: str):
    """Run a script cross-platform: .ps1 via PowerShell on Windows, .sh via bash otherwise."""
    try:
        if _is_windows():
            # Ensure PowerShell execution
            subprocess.run(
                [
                    "pwsh",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    script_path,
                ],
                check=True,
            )
        else:
            subprocess.run(["bash", script_path], check=True)
    except FileNotFoundError:
        # Fallback to Windows PowerShell if pwsh isn't available
        if _is_windows():
            subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    script_path,
                ],
                check=True,
            )


def _kubectl_available() -> bool:
    return shutil.which("kubectl") is not None


def _helm_available() -> bool:
    return shutil.which("helm") is not None


def _kind_available() -> bool:
    return shutil.which("kind") is not None


def _docker_available() -> bool:
    return shutil.which("docker") is not None


def _compose_available() -> bool:
    # either 'docker compose' or legacy docker-compose
    if not _docker_available():
        return False
    # Prefer docker compose v2
    try:
        subprocess.run(["docker", "compose", "version"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except Exception:
        return shutil.which("docker-compose") is not None


def _compose_cmd(base_args: List[str]) -> List[str]:
    # Build a compose command using docker compose if available, else docker-compose
    if shutil.which("docker"):
        try:
            subprocess.run(["docker", "compose", "version"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return ["docker", "compose", "-f", COMPOSE_FILE, "--env-file", COMPOSE_ENV] + base_args
        except Exception:
            pass
    return ["docker-compose", "-f", COMPOSE_FILE, "--env-file", COMPOSE_ENV] + base_args


def _ensure_compose_files() -> bool:
    if not os.path.isfile(COMPOSE_FILE):
        CONSOLE.print(Panel(
            f"[red]Missing {COMPOSE_FILE}[/red]\n\nPlease commit the hybrid dev compose file.",
            title="Compose file missing",
            border_style="red",
        ))
        return False
    if not os.path.isfile(COMPOSE_ENV):
        CONSOLE.print(Panel(
            f"[yellow]Missing {COMPOSE_ENV}[/yellow]\nA default will be created for you.",
            title="Compose env missing",
            border_style="yellow",
        ))
        try:
            with open(COMPOSE_ENV, "w") as f:
                f.write("# Auto-created. See docker-compose.dev.yml for variables.\n")
        except Exception:
            pass
    return True


def _is_cluster_online(timeout_seconds: int = 8) -> bool:
    if not _kubectl_available():
        return False
    try:
        subprocess.run(
            f"kubectl cluster-info --request-timeout={timeout_seconds}s",
            shell=True,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except subprocess.CalledProcessError:
        return False


def _start_kind_cluster_interactive() -> bool:
    """Offer to start a local kind cluster. Returns True if cluster is online after, else False."""
    if not _kind_available():
        CONSOLE.print(Panel(
            "[red]kind is not installed[/red]\n\n"
            "Install with: [cyan]choco install kind[/cyan] or [cyan]scoop install kind[/cyan] on Windows,\n"
            "or follow docs at: https://kind.sigs.k8s.io/",
            title="Missing kind",
            border_style="red",
        ))
        return False

    use_kind = inquirer.confirm(
        message="Cluster offline. Start a local kind cluster now?",
        default=True,
    ).execute()
    if not use_kind:
        return False

    # Determine config path
    config_path = os.path.join(REPO_ROOT, "kind-config.yaml")
    cmd = ["kind", "create", "cluster", "--name", "enginedge"]
    if os.path.exists(config_path):
        cmd.extend(["--config", config_path])

    CONSOLE.print("\n[bold]Starting local kind cluster...[/bold]")
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        CONSOLE.print(f"[red]Failed to start kind cluster: {e}[/red]")
        return False

    # Wait for cluster to become reachable
    for _ in range(40):
        if _is_cluster_online():
            CONSOLE.print("[green]Cluster is online.[/green]")
            return True
        time.sleep(3)
    CONSOLE.print("[yellow]Cluster did not become ready in time.[/yellow]")
    return False


def _ensure_cluster_online_or_offer_start() -> bool:
    if _is_cluster_online():
        return True
    return _start_kind_cluster_interactive()


def _extract_images_from_manifests(manifest_paths: List[str]) -> List[str]:
    images: List[str] = []
    for path in manifest_paths:
        if not os.path.exists(path):
            continue
        try:
            with open(path, "r") as f:
                for doc in yaml.safe_load_all(f):
                    if not isinstance(doc, dict):
                        continue
                    spec = doc.get("spec") or {}
                    # Navigate to pod template if it's a workload
                    if doc.get("kind") in ("Deployment", "StatefulSet", "DaemonSet", "Job", "CronJob"):
                        tpl = spec
                        if doc.get("kind") == "CronJob":
                            tpl = spec.get("jobTemplate", {}).get("spec", {}).get("template", {}).get("spec", {})
                        else:
                            tpl = spec.get("template", {}).get("spec", {})
                        for c in (tpl.get("containers") or []):
                            image = c.get("image")
                            if image:
                                images.append(image.split("@")[0])
                        for c in (tpl.get("initContainers") or []):
                            image = c.get("image")
                            if image:
                                images.append(image.split("@")[0])
        except Exception:
            continue
    return sorted(list({img for img in images if ":" in img and img.endswith(":latest")}))


def _candidate_build_dirs_for_image(image_name: str) -> List[str]:
    # Strip tag
    base = image_name.split(":")[0]
    candidates = [
        base,
        base.replace("-", "_"),
    ]
    # Special mappings
    special = {
        "core": "hexagon",  # Legacy reference, now points to hexagon
        "hexagon": "hexagon",
        "scheduling-model-api": "scheduling_model",
        # News ingestion job lives under scripts/jobs with its Dockerfile
        "news-ingestion-job": "scripts/jobs",
        "wolfram-kernel": "local-kernel",
    }
    if base in special:
        candidates.insert(0, special[base])
    
    # Build list of directories to search
    search_dirs = []
    
    # First, search in REPO_ROOT (enginedge-core)
    for c in candidates:
        search_dirs.append(os.path.join(REPO_ROOT, c))
    
    # Then search in sibling directories
    parent_dir = os.path.dirname(REPO_ROOT)
    
    # enginedge-workers directory (for worker services)
    enginedge_workers = os.path.join(parent_dir, "enginedge-workers")
    for c in candidates:
        search_dirs.append(os.path.join(enginedge_workers, c))
    
    # EnginEdge-monorepo directory (for scheduling model, local-kernel, news ingestion, etc.)
    enginedge_monorepo = os.path.join(parent_dir, "EnginEdge-monorepo")
    for c in candidates:
        search_dirs.append(os.path.join(enginedge_monorepo, c))
    
    return search_dirs


def _find_build_context_for_image(image_name: str) -> Optional[str]:
    # Special case: hexagon Dockerfile is at hexagon/Dockerfile
    if image_name.startswith("hexagon") or image_name.startswith("core"):
        hexagon_dockerfile = os.path.join(REPO_ROOT, "hexagon", "Dockerfile")
        if os.path.isfile(hexagon_dockerfile):
            # Return hexagon directory as the build context
            return os.path.join(REPO_ROOT, "hexagon")
    
    # Default: search for Dockerfile in candidate directories
    for cand in _candidate_build_dirs_for_image(image_name):
        dockerfile_path = os.path.join(cand, "Dockerfile")
        if os.path.isdir(cand) and os.path.isfile(dockerfile_path):
            return cand
    
    return None


def _load_env_file_if_present():
    """Load simple KEY=VALUE pairs from .env.local or .env into os.environ (noop if absent)."""
    for filename in (".env.local", ".env"):
        path = os.path.join(REPO_ROOT, filename)
        if not os.path.isfile(path):
            continue
        try:
            with open(path, "r") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" not in line:
                        continue
                    key, value = line.split("=", 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    if key and value and key not in os.environ:
                        os.environ[key] = value
        except Exception:
            pass


def _build_and_load_kind_images(selected_groups: List[str]):
    if not _docker_available():
        CONSOLE.print(Panel(
            "[yellow]Docker CLI not found. Skipping local image build/load.[/yellow]",
            title="Docker Missing",
            border_style="yellow",
        ))
        return
    # Determine manifests involved for selected groups and extract images
    manifests_to_apply, _ = get_group_resources(selected_groups)
    # Only app manifests (exclude secrets/config)
    app_manifests = [m for m in manifests_to_apply if "apps/" in m or m.endswith("cronjob.yaml")]
    images = _extract_images_from_manifests(app_manifests)
    if not images:
        return

    CONSOLE.print(Panel("Building and loading local images into kind (if needed)...", title="Images", border_style="cyan"))

    for image in images:
        # Expect local dev tags like name:latest
        tag = image
        ctx = _find_build_context_for_image(image)
        if not ctx:
            CONSOLE.print(f"[yellow]No Dockerfile found for image '{image}'. Skipping build.[/yellow]")
            continue
        build_cmd = ["docker", "build", "-t", tag]
        # Special handling for hexagon (Dockerfile is in hexagon/Dockerfile)
        if (image.startswith("hexagon") or image.startswith("core")) and os.path.basename(ctx) == "hexagon":
            # Dockerfile is already in the context, no need for -f flag
            pass
        # Special handling for wolfram-kernel
        elif os.path.basename(ctx) == "local-kernel":
            # If image already exists locally, skip rebuild and just load into kind
            try:
                subprocess.run(["docker", "image", "inspect", tag], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                CONSOLE.print(f"[green]{tag} already exists locally. Skipping build.[/green]")
                if _kind_available():
                    subprocess.run(["kind", "load", "docker-image", tag, "--name", "enginedge"], check=True)
                    CONSOLE.print(f"[green]Loaded {tag} into kind cluster.[/green]")
                continue
            except subprocess.CalledProcessError:
                pass

            wolfram_url_env = os.environ.get("WOLFRAM_DOWNLOAD_URL", "").strip()
            if wolfram_url_env:
                build_cmd.extend(["--build-arg", f"WOLFRAM_DOWNLOAD_URL={wolfram_url_env}"])
                CONSOLE.print(f"[green]Using custom Wolfram download URL from environment[/green]")
            else:
                CONSOLE.print(Panel(
                    "Building wolfram-kernel with default download URL.\n"
                    "Set WOLFRAM_DOWNLOAD_URL env var to use a custom URL.",
                    title="Wolfram Kernel",
                    border_style="blue",
                ))
        build_cmd.append(ctx)
        CONSOLE.print(f"[bold]{' '.join(build_cmd)}[/bold]")
        try:
            subprocess.run(build_cmd, check=True)
        except subprocess.CalledProcessError as e:
            CONSOLE.print(f"[red]Build failed for {tag}: {e}[/red]")
            continue

        if _kind_available():
            try:
                subprocess.run(["kind", "load", "docker-image", tag, "--name", "enginedge"], check=True)
                CONSOLE.print(f"[green]Loaded {tag} into kind cluster.[/green]")
            except subprocess.CalledProcessError as e:
                CONSOLE.print(f"[yellow]Failed to load {tag} into kind: {e}[/yellow]")
        else:
            CONSOLE.print("[yellow]kind not found; skipping image load.[/yellow]")
def wait_for_readiness(timeout_seconds: int = 600):
    """Live readiness watcher for Deployments and StatefulSets in the default namespace."""
    CONSOLE.print("\n[bold]Waiting for resources to become Ready...[/bold]")

    def load_statuses() -> List[Dict]:
        statuses: List[Dict] = []
        try:
            dep_out = subprocess.run([
                "kubectl", "get", "deploy", "-n", "default", "-o", "json"
            ], check=True, capture_output=True, text=True)
            dep_data = json.loads(dep_out.stdout or "{}")
            for item in dep_data.get("items", []):
                name = item.get("metadata", {}).get("name")
                replicas = item.get("spec", {}).get("replicas", 1)
                ready = item.get("status", {}).get("readyReplicas", 0) or 0
                statuses.append({
                    "kind": "Deployment",
                    "name": name,
                    "ready": int(ready),
                    "replicas": int(replicas),
                })
        except Exception:
            pass

        try:
            st_out = subprocess.run([
                "kubectl", "get", "statefulset", "-n", "default", "-o", "json"
            ], check=True, capture_output=True, text=True)
            st_data = json.loads(st_out.stdout or "{}")
            for item in st_data.get("items", []):
                name = item.get("metadata", {}).get("name")
                replicas = item.get("spec", {}).get("replicas", 1)
                ready = item.get("status", {}).get("readyReplicas", 0) or 0
                statuses.append({
                    "kind": "StatefulSet",
                    "name": name,
                    "ready": int(ready),
                    "replicas": int(replicas),
                })
        except Exception:
            pass

        return statuses

    start = time.time()
    with Live(refresh_per_second=8, transient=True) as live:
        while True:
            statuses = load_statuses()
            table = Table(show_header=True, header_style="bold", expand=True)
            table.add_column("Kind", no_wrap=True)
            table.add_column("Name")
            table.add_column("Ready", justify="right", no_wrap=True)
            table.add_column("Desired", justify="right", no_wrap=True)
            table.add_column("Errors", justify="left")

            ready_count = 0
            total = 0
            # Build a quick lookup of pod restarts and bad statuses per owner
            restarts_map: Dict[str, int] = {}
            owner_reason_map: Dict[str, str] = {}
            try:
                pods_out = subprocess.run([
                    "kubectl", "get", "pods", "-n", "default", "-o", "json"
                ], check=True, capture_output=True, text=True)
                pods_data = json.loads(pods_out.stdout or "{}")
                for pod in pods_data.get("items", []):
                    restarts = 0
                    phase = pod.get("status", {}).get("phase", "")
                    for cs in pod.get("status", {}).get("containerStatuses", []) or []:
                        restarts += int(cs.get("restartCount", 0))
                        st = cs.get("state", {})
                        if "waiting" in st:
                            reason = st["waiting"].get("reason") or "waiting"
                            if reason not in ["ContainerCreating", "PodInitializing"]:
                                owner_reason_map[pod.get("metadata", {}).get("name", "")] = reason
                        if "terminated" in st:
                            reason = st["terminated"].get("reason") or "terminated"
                            owner_reason_map[pod.get("metadata", {}).get("name", "")] = reason
                    owner = None
                    for ref in pod.get("metadata", {}).get("ownerReferences", []) or []:
                        if ref.get("kind") in ("ReplicaSet", "StatefulSet"):
                            owner = ref.get("name", "")
                    # Map restarts to owning controller name prefix
                    if owner:
                        # Trim ReplicaSet hash to deployment name
                        if "-" in owner:
                            owner_prefix = owner.split("-")[0]
                        else:
                            owner_prefix = owner
                        restarts_map[owner_prefix] = restarts_map.get(owner_prefix, 0) + restarts
                        # If this pod had a problematic reason, carry it to owner prefix (first one wins)
                        pod_reason = owner_reason_map.get(pod.get("metadata", {}).get("name", ""))
                        if pod_reason and owner_prefix not in owner_reason_map:
                            owner_reason_map[owner_prefix] = pod_reason
            except Exception:
                pass

            for s in sorted(statuses, key=lambda x: (x["kind"], x["name"])):
                total += 1
                is_ready = s["ready"] >= s["replicas"] and s["replicas"] > 0
                if is_ready:
                    ready_count += 1
                # Aggregate errors by matching pod owner prefix to resource name
                owner_prefix = s["name"]
                restart_count = restarts_map.get(owner_prefix, 0)
                reason = owner_reason_map.get(owner_prefix)
                err_badges = []
                if reason:
                    err_badges.append(str(reason))
                if restart_count > 0:
                    err_badges.append(f"restarts:{restart_count}")
                # Format with color if any issue
                if err_badges:
                    err_text = Text(", ".join(err_badges), style="red")
                else:
                    err_text = Text("")
                table.add_row(
                    s["kind"],
                    s["name"],
                    str(s["ready"]),
                    str(s["replicas"]),
                    err_text,
                )

            elapsed = int(time.time() - start)
            title = f"Readiness {ready_count}/{total} ready • {elapsed}s elapsed"
            live.update(Panel(table, title=title, border_style="cyan"))

            if total > 0 and ready_count == total:
                break
            if time.time() - start >= timeout_seconds:
                break
            time.sleep(1)

    # Show final pods summary (single block)
    try:
        result = subprocess.run(
            "kubectl get pods --namespace default -o wide",
            shell=True,
            check=True,
            capture_output=True,
            text=True,
        )
        CONSOLE.print(Panel(result.stdout, title="Pods Status", border_style="green"))
    except subprocess.CalledProcessError:
        pass


def _list_services() -> List[Dict]:
    """Return list of services in default namespace with names and ports."""
    try:
        result = subprocess.run(
            ["kubectl", "get", "svc", "-n", "default", "-o", "json"],
            check=True,
            capture_output=True,
            text=True,
        )
        data = json.loads(result.stdout)
        items = data.get("items", [])
        services = []
        for item in items:
            name = item.get("metadata", {}).get("name")
            ports = item.get("spec", {}).get("ports", [])
            services.append({"name": name, "ports": ports})
        return services
    except Exception:
        return []


def _start_port_forward(service_name: str, local_port: int, target_port: int):
    """Start kubectl port-forward in background and log to file."""
    log_name = f"port-forward_{service_name}_{local_port}.log"
    log_path = os.path.join(REPO_ROOT, log_name)
    cmd = [
        "kubectl",
        "port-forward",
        f"svc/{service_name}",
        f"{local_port}:{target_port}",
        "-n",
        "default",
    ]
    try:
        with open(log_path, "w") as log_file:
            if _is_windows():
                DETACHED_PROCESS = 0x00000008
                subprocess.Popen(cmd, stdout=log_file, stderr=log_file, creationflags=DETACHED_PROCESS)
            else:
                subprocess.Popen(cmd, stdout=log_file, stderr=log_file, start_new_session=True)
        CONSOLE.print(Panel(
            f"Forwarding [bold]{service_name}[/bold] on localhost:{local_port} -> {target_port}\nLog: {log_path}",
            title="Port-forward started",
            border_style="green",
        ))
    except Exception as e:
        CONSOLE.print(f"[red]Failed to start port-forward: {e}[/red]")

def generate_k8s_deploy_script(selected_groups: List[str]):
    """Generates deploy scripts (.sh and .ps1) for the selected Kubernetes service groups."""
    if not selected_groups:
        CONSOLE.print("[yellow]No service groups selected. Nothing to generate.[/yellow]")
        return

    CONSOLE.print(f"\n[bold]Generating Kubernetes Deploy Script for: {', '.join(selected_groups)}...[/bold]")

    manifests_to_apply, helm_releases_to_install = get_group_resources(selected_groups)

    if not manifests_to_apply and not helm_releases_to_install:
        CONSOLE.print("[yellow]No resources found for the selected groups.[/yellow]")
        return

    script_name_part = "all" if len(selected_groups) == len(K8S_SERVICE_GROUPS) else "_".join(group.split()[0].lower() for group in selected_groups)
    script_filename_sh = f"deploy_k8s_{script_name_part}.sh"
    script_filename_ps1 = f"deploy_k8s_{script_name_part}.ps1"

    # Bash script (includes offline guard)
    with open(script_filename_sh, "w") as f:
        f.write("#!/bin/bash\n")
        f.write(f"# Deploy script for: {', '.join(selected_groups)}\n")
        f.write("# This script was generated by the EnginEdge Control Center.\nset -e\n\n")
        f.write("kubectl cluster-info >/dev/null 2>&1 || { echo 'Cluster offline'; exit 1; }\n\n")
        f.write("echo 'Starting Kubernetes deployment...'\n\n")

        # Define helm charts here to avoid repeating this static info
        helm_charts = {
            "postgres-metastore": "bitnami/postgresql", "minio": "minio/minio",
            "kafka": "bitnami/kafka", "redis": "bitnami/redis"
        }
        helm_values = {
            "postgres-metastore": "charts/postgres/values.yaml", "minio": "charts/minio/values.yaml",
            "kafka": "charts/kafka/values.yaml", "redis": "charts/redis/values.yaml"
        }

        # Write commands in a logical order: manifests (secrets/configs), then helm, then apps
        secrets_and_configs = [m for m in manifests_to_apply if "secrets/" in m or "config/" in m]
        apps = [m for m in manifests_to_apply if "apps/" in m]

        if secrets_and_configs:
            f.write("# --- Applying Secrets and ConfigMaps ---\n")
            for manifest in sorted(secrets_and_configs):
                f.write(f"kubectl apply -f {manifest}\n")
            f.write("\n")

        if helm_releases_to_install:
            f.write("# --- Installing Helm Charts for 3rd party services ---\n")
            f.write("helm repo add bitnami https://charts.bitnami.com/bitnami\n")
            f.write("helm repo add minio https://charts.min.io/\n")
            f.write("helm repo update\n\n")
            for release in helm_releases_to_install:
                chart = helm_charts.get(release)
                values_rel = helm_values.get(release)
                if chart and values_rel:
                    values = os.path.join(K8S_DIR, values_rel)
                    f.write(f"helm install {release} {chart} -f {values} --namespace default\n")
            f.write("\n")

        if apps:
            f.write("# --- Deploying Core Applications ---\n")
            for manifest in sorted(apps):
                f.write(f"kubectl apply -f {manifest}\n")
            f.write("\n")

        f.write("echo 'Kubernetes deployment finished.'\n")

    os.chmod(script_filename_sh, 0o755)

    # PowerShell script (includes offline guard)
    with open(script_filename_ps1, "w") as f:
        f.write("Param()\n")
        f.write("$ErrorActionPreference = 'Stop'\n")
        f.write(f"Write-Host 'Deploying: {', '.join(selected_groups)}'\n")
        f.write("try { kubectl cluster-info | Out-Null } catch { Write-Host 'Cluster offline'; exit 1 }\n")
        f.write("Write-Host 'Starting Kubernetes deployment...'\n\n")

        f.write("# --- Applying Secrets and ConfigMaps ---\n")
        for manifest in sorted([m for m in manifests_to_apply if "secrets/" in m or "config/" in m]):
            f.write(f"kubectl apply -f '{manifest}'\n")
        f.write("\n")

        if helm_releases_to_install:
            f.write("# --- Installing Helm Charts for 3rd party services ---\n")
            f.write("helm repo add bitnami https://charts.bitnami.com/bitnami\n")
            f.write("helm repo add minio https://charts.min.io/\n")
            f.write("helm repo update\n\n")
            helm_charts = {
                "postgres-metastore": "bitnami/postgresql",
                "minio": "minio/minio",
                "kafka": "bitnami/kafka",
                "redis": "bitnami/redis",
            }
            helm_values = {
                "postgres-metastore": "charts/postgres/values.yaml",
                "minio": "charts/minio/values.yaml",
                "kafka": "charts/kafka/values.yaml",
                "redis": "charts/redis/values.yaml",
            }
            for release in helm_releases_to_install:
                chart = helm_charts.get(release)
                values_rel = helm_values.get(release)
                if chart and values_rel:
                    values = os.path.join(K8S_DIR, values_rel)
                    f.write(f"helm install {release} {chart} -f '{values}' --namespace default\n")
            f.write("\n")

        f.write("# --- Deploying Core Applications ---\n")
        for manifest in sorted([m for m in manifests_to_apply if "apps/" in m]):
            f.write(f"kubectl apply -f '{manifest}'\n")
        f.write("\n")

        f.write("Write-Host 'Kubernetes deployment finished.'\n")

    CONSOLE.print(f"\n[bold green]Deploy scripts created: '{script_filename_sh}', '{script_filename_ps1}'[/bold green]")
    CONSOLE.print(Panel(f"[bold cyan]./{script_filename_sh}[/bold cyan] or [bold cyan].\\{script_filename_ps1}[/bold cyan]", expand=False, padding=(0, 2)))


def refresh_k8s_deployments(selected_groups: List[str]):
    """Restarts deployments by triggering a rollout restart (keeps all data/PVCs)."""
    if not selected_groups:
        CONSOLE.print("[yellow]No service groups selected.[/yellow]")
        return
    
    CONSOLE.print(f"\n[bold]Refreshing deployments for: {', '.join(selected_groups)}...[/bold]")
    
    try:
        # Map groups to deployments
        deployments_to_refresh = []
        apps_and_configs = []
        _, helm_releases = get_group_resources(selected_groups)
        
        # Get all deployment names from manifests
        for group in selected_groups:
            if "Stateful Backend" in group:
                deployments_to_refresh.extend(["hexagon"])
            if "Core Applications" in group:
                deployments_to_refresh.extend(["agent-tool-worker", "data-processing-worker", "interview-worker", 
                                               "latex-worker", "assistant-worker", "resume-worker", "wolfram-kernel", "hexagon"])
            if "Scheduling App" in group:
                deployments_to_refresh.append("scheduling-model")
        
        # Restart each deployment
        for deployment in deployments_to_refresh:
            try:
                cmd = ["kubectl", "rollout", "restart", f"deployment/{deployment}", "-n", "default"]
                subprocess.run(cmd, check=True, capture_output=True)
                CONSOLE.print(f"[green]✓[/green] Restarted deployment: {deployment}")
            except subprocess.CalledProcessError as e:
                CONSOLE.print(f"[yellow]⚠[/yellow] Could not restart {deployment}: {e.stderr.decode()}")
        
        CONSOLE.print("[bold green]Deployment refresh finished.[/bold green]")
        CONSOLE.print("[cyan]Data and PersistentVolumes preserved. Pods will restart with the same configuration.[/cyan]")
        
    except Exception as e:
        CONSOLE.print(f"[red]Error during refresh: {e}[/red]")


def stop_k8s_deployments(selected_groups: List[str]):
    """Scales down deployments to 0 replicas (keeps all data/PVCs)."""
    if not selected_groups:
        CONSOLE.print("[yellow]No service groups selected.[/yellow]")
        return
    
    CONSOLE.print(f"\n[bold]Scaling down deployments for: {', '.join(selected_groups)}...[/bold]")
    
    try:
        deployments_to_stop = []
        
        # Map groups to deployments
        for group in selected_groups:
            if "Stateful Backend" in group:
                deployments_to_stop.extend(["hexagon"])
            if "Core Applications" in group:
                deployments_to_stop.extend(["agent-tool-worker", "data-processing-worker", "interview-worker", 
                                            "latex-worker", "assistant-worker", "resume-worker", "wolfram-kernel"])
            if "Scheduling App" in group:
                deployments_to_stop.append("scheduling-model")
        
        # Scale down each deployment
        for deployment in deployments_to_stop:
            try:
                cmd = ["kubectl", "scale", f"deployment/{deployment}", "--replicas=0", "-n", "default"]
                subprocess.run(cmd, check=True, capture_output=True)
                CONSOLE.print(f"[green]✓[/green] Scaled down deployment: {deployment}")
            except subprocess.CalledProcessError as e:
                CONSOLE.print(f"[yellow]⚠[/yellow] Could not scale down {deployment}: {e.stderr.decode()}")
        
        CONSOLE.print("[bold green]Deployment scaling finished.[/bold green]")
        CONSOLE.print("[cyan]Pods stopped but data and PersistentVolumes preserved. Use 'Refresh' to restart.[/cyan]")
        
    except Exception as e:
        CONSOLE.print(f"[red]Error during stop: {e}[/red]")


def generate_k8s_destroy_script(selected_groups: List[str], preserve_pvc: bool = False):
    """Generates destroy scripts (.sh and .ps1) for the selected groups."""
    if not selected_groups:
        CONSOLE.print("[yellow]No service groups selected. Nothing to generate.[/yellow]")
        return

    CONSOLE.print(f"\n[bold]Generating Kubernetes Destroy Script for: {', '.join(selected_groups)}...[/bold]")

    manifests_to_delete, helm_releases_to_delete = get_group_resources(selected_groups)

    if not manifests_to_delete and not helm_releases_to_delete:
        CONSOLE.print("[yellow]No resources found for the selected groups.[/yellow]")
        return

    script_name_part = "all" if len(selected_groups) == len(K8S_SERVICE_GROUPS) else "_".join(group.split()[0].lower() for group in selected_groups)
    script_filename_sh = f"destroy_k8s_{script_name_part}.sh"
    script_filename_ps1 = f"destroy_k8s_{script_name_part}.ps1"

    # Bash script (includes offline guard)
    with open(script_filename_sh, "w") as f:
        f.write("#!/bin/bash\n# Destroys selected application components from Kubernetes.\nset -e\n\n")
        f.write("kubectl cluster-info >/dev/null 2>&1 || { echo 'Cluster offline'; exit 1; }\n\n")
        f.write(f"echo 'Starting Kubernetes teardown for: {', '.join(selected_groups)}...'\n\n")

        apps_and_configs = [m for m in manifests_to_delete if "apps/" in m or "config/" in m]
        secrets = [m for m in manifests_to_delete if "secrets/" in m]

        if apps_and_configs:
            f.write("# --- Deleting Applications and ConfigMaps ---\n")
            for file in sorted(apps_and_configs, reverse=True):
                f.write(f"kubectl delete -f {file} --ignore-not-found=true\n")
            f.write("\n")

        if helm_releases_to_delete:
            f.write("# --- Deleting Helm Releases ---\n")
            for release in helm_releases_to_delete:
                # Try uninstall; if not installed, ignore error
                f.write(f"helm status {release} --namespace default >/dev/null 2>&1 && helm delete {release} --namespace default || true\n")
            f.write("\n")

        if secrets:
            f.write("# --- Deleting Secrets ---\n")
            for file in sorted(secrets, reverse=True):
                f.write(f"[ -f {file} ] && kubectl delete -f {file} --ignore-not-found=true || true\n")
            f.write("\n")

        if preserve_pvc:
            f.write("echo 'PersistentVolumeClaims preserved (wolfram-state and other PVCs retained).'\n")
        else:
            f.write("# --- Deleting PersistentVolumeClaims ---\n")
            f.write("kubectl delete pvc --all -n default --ignore-not-found=true\n")
            f.write("\n")

        f.write("echo 'Kubernetes teardown finished.'\n")

    os.chmod(script_filename_sh, 0o755)

    # PowerShell script (includes offline guard)
    with open(script_filename_ps1, "w") as f:
        f.write("Param()\n")
        f.write("$ErrorActionPreference = 'Stop'\n")
        f.write(f"Write-Host 'Tearing down: {', '.join(selected_groups)}'\n")
        f.write("try { kubectl cluster-info | Out-Null } catch { Write-Host 'Cluster offline'; exit 1 }\n")
        f.write("Write-Host 'Starting Kubernetes teardown...'\n\n")

        f.write("# --- Deleting Applications and ConfigMaps ---\n")
        for file in sorted([m for m in manifests_to_delete if "apps/" in m or "config/" in m], reverse=True):
            f.write(f"kubectl delete -f '{file}' --ignore-not-found=true\n")
        f.write("\n")

        if helm_releases_to_delete:
            f.write("# --- Deleting Helm Releases ---\n")
            for release in helm_releases_to_delete:
                # Only delete if installed to avoid noisy errors
                f.write(f"if (helm status {release} --namespace default 2>$null) {{ helm delete {release} --namespace default }}\n")
            f.write("\n")

        if [m for m in manifests_to_delete if "secrets/" in m]:
            f.write("# --- Deleting Secrets ---\n")
            for file in sorted([m for m in manifests_to_delete if "secrets/" in m], reverse=True):
                f.write(f"if (Test-Path '{file}') {{ kubectl delete -f '{file}' --ignore-not-found=true }}\n")
            f.write("\n")

        if preserve_pvc:
            f.write("Write-Host 'PersistentVolumeClaims preserved (wolfram-state and other PVCs retained).'\n")
        else:
            f.write("# --- Deleting PersistentVolumeClaims ---\n")
            f.write("kubectl delete pvc --all -n default --ignore-not-found=true\n")
            f.write("\n")

        f.write("Write-Host 'Kubernetes teardown finished.'\n")

    CONSOLE.print(f"\n[bold orange_red1]Destroy scripts created: '{script_filename_sh}', '{script_filename_ps1}'[/bold orange_red1]")
    CONSOLE.print(Panel(f"[bold cyan]./{script_filename_sh}[/bold cyan] or [bold cyan].\\{script_filename_ps1}[/bold cyan]", expand=False, padding=(0, 2)))


# --- Hybrid Dev (Docker Compose) ---

def manage_dev_hybrid_environment():
    """Run selected services in Docker Compose while allowing local apps to run outside containers."""
    CONSOLE.print(Panel("[bold]Hybrid Dev Environment (Docker Compose)[/bold]", expand=False))
    if not _compose_available():
        CONSOLE.print(Panel(
            "[red]Docker Compose is not available[/red]\nInstall Docker Desktop on Windows.",
            title="Missing docker compose",
            border_style="red",
        ))
        return
    if not _ensure_compose_files():
        return

    # Map K8S service groups to compose service lists for consistent UX
    compose_groups: Dict[str, List[str]] = {
        "Stateful Backend": ["postgres", "minio"],
        "Messaging": ["kafka", "kafka-ui", "redis"],
        "Core Applications": ["mongodb", "hexagon", "wolfram-kernel"],
        "Scheduling App": ["scheduling-model"],
        # CronJobs typically aren't in compose; skip News Ingestion Job or add here if containerized
    }

    while True:
        action = inquirer.select(
            message="Select action:",
            choices=[
                Choice("up_all", "Up: Infra + All App Containers"),
                Choice("up_infra", "Up: Infra only (run apps locally)"),
                Choice("up_all_except_hexagon", "Up: All except hexagon"),
                Choice("up_select", "Up: Choose services"),
                Choice("wolfram_activate", "Wolfram: open activation shell"),
                Choice("down", "Down: stop all"),
                Choice("ps", "Status (ps)"),
                Choice("logs", "Tail logs (interactive)"),
                Choice(None, "Back"),
            ],
            default="up_infra",
        ).execute()

        if not action:
            break

        try:
            if action == "up_all":
                cmd = _compose_cmd(["up", "-d", "--build"])
                subprocess.run(cmd, check=True)
                CONSOLE.print("[green]Compose stack (all) is up.[/green]")
            elif action == "up_infra":
                # Bring up infra needed to run apps locally.
                services = ["mongodb", "minio", "postgres", "redis", "kafka", "kafka-ui"]
                cmd = _compose_cmd(["up", "-d", "--build"] + services)
                subprocess.run(cmd, check=True)
                CONSOLE.print("[green]Infra services are up. You can run app services locally now.[/green]")
                _show_local_dev_hints()
            elif action == "up_all_except_hexagon":
                # Bring up everything except hexagon (so hexagon runs locally but other services in containers)
                all_services = [
                    "mongodb", "minio", "postgres", "redis", "kafka", "kafka-ui",
                    "scheduling-model", "wolfram-kernel"
                ]
                cmd = _compose_cmd(["up", "-d", "--build"] + all_services)
                subprocess.run(cmd, check=True)
                CONSOLE.print("[green]Infra + app services (except hexagon) are up.[/green]")
                _show_local_dev_hints()
            elif action == "wolfram_activate":
                # Ensure wolfram-kernel is running
                try:
                    subprocess.run(_compose_cmd(["up", "-d", "wolfram-kernel"]), check=True)
                except subprocess.CalledProcessError:
                    pass
                CONSOLE.print(Panel(
                    "Opening an interactive shell in the wolfram-kernel container.\n"
                    "Run: [bold]wolframscript[/bold] and sign in with your Wolfram ID to activate.\n"
                    "Activation state is persisted in a named volume.",
                    title="Wolfram Activation",
                    border_style="cyan",
                ))
                # Open shell
                try:
                    # Prefer docker compose v2
                    if shutil.which("docker"):
                        subprocess.run(["docker", "exec", "-it", "wolfram-kernel", "/bin/bash"])
                    else:
                        subprocess.run(["docker-compose", "exec", "wolfram-kernel", "/bin/bash"])  # fallback
                except KeyboardInterrupt:
                    pass
            elif action == "up_select":
                # Offer selection by groups first, then optionally individual services
                group_choices = [Choice(value=name, name=f"{name}: {K8S_SERVICE_GROUPS[name]['description']}") for name in K8S_SERVICE_GROUPS.keys()]
                selected_groups = inquirer.checkbox(
                    message="Select service groups (optional):",
                    choices=group_choices,
                    cycle=True,
                ).execute()
                preselected: List[str] = []
                for g in selected_groups:
                    preselected.extend(compose_groups.get(g, []))

                svc_list = [
                    "mongodb", "minio", "postgres", "redis", "kafka", "kafka-ui",
                    "scheduling-model", "wolfram-kernel", "hexagon",
                ]
                # Deduplicate and keep known ordering
                preselected = [s for s in svc_list if s in set(preselected)]
                selected = inquirer.checkbox(
                    message="Select services to start:",
                    choices=[Choice(value=s, name=s, enabled=(s in preselected)) for s in svc_list],
                    cycle=True,
                ).execute()
                if selected:
                    cmd = _compose_cmd(["up", "-d", "--build"] + selected)
                    subprocess.run(cmd, check=True)
                    CONSOLE.print(f"[green]Started: {', '.join(selected)}[/green]")
            elif action == "down":
                cmd = _compose_cmd(["down"])
                subprocess.run(cmd, check=True)
                CONSOLE.print("[yellow]Compose stack stopped.[/yellow]")
            elif action == "ps":
                cmd = _compose_cmd(["ps"])
                subprocess.run(cmd, check=True)
            elif action == "logs":
                # Interactive: let user pick a service to tail
                svc_list = [
                    "mongodb", "minio", "postgres", "redis", "kafka", "kafka-ui",
                    "scheduling-model", "wolfram-kernel", "hexagon",
                ]
                service = inquirer.select(message="Select service:", choices=svc_list).execute()
                if service:
                    cmd = _compose_cmd(["logs", "-f", service])
                    try:
                        subprocess.run(cmd, check=True)
                    except KeyboardInterrupt:
                        pass
        except subprocess.CalledProcessError as e:
            CONSOLE.print(f"[red]Command failed: {e}[/red]")


def _show_local_dev_hints():
    text = Text()
    text.append("Run local services in separate terminals:\n", style="bold")
    text.append("- Frontend: cd frontend && npm run dev (port 9090)\n")
    text.append("- Hexagon:  cd hexagon && copy .env.example -> .env then npm run start:dev\n")
    text.append("- Workers:  Individual workers can run locally or in containers\n")
    text.append("\nCompose endpoints:\n", style="bold")
    text.append("- MongoDB: mongodb://localhost:27017\n")
    text.append("- Kafka broker: localhost:9094 (external)\n")
    text.append("- Redis: redis://localhost:6379\n")
    text.append("- MinIO: http://localhost:9000 (console: :9001)\n")
    text.append("- Scheduling model: http://localhost:8000\n")
    text.append("- Wolfram kernel: http://localhost:5001 (may return 503 until activated)\n")
    text.append("\nSet these in your app .env when running locally:\n", style="bold")
    text.append("- SCHEDULING_MODEL_URL=http://localhost:8000\n")
    text.append("- WOLFRAM_LOCAL_URL=http://localhost:5001\n")
    text.append("\nWolfram Activation:\n", style="bold")
    text.append("- Use menu: 'Wolfram: open activation shell' to enter the container\n")
    text.append("- Run 'wolframscript' and sign in with your Wolfram ID (free developer license)\n")
    text.append("- Activation state persists across restarts\n")
    CONSOLE.print(Panel(text, title="Local Dev Hints", border_style="cyan"))

def check_k8s_status():
    """Checks the status of the Kubernetes cluster and deployed resources."""
    CONSOLE.print("\n[bold]Checking Kubernetes Cluster Status...[/bold]")
    
    if not shutil.which("kubectl"):
        CONSOLE.print(Panel(
            "[red]kubectl command not found[/red]\n\n"
            "Please ensure kubectl is installed and available in your PATH.\n"
            "Visit: https://kubernetes.io/docs/tasks/tools/",
            title="Missing kubectl",
            border_style="red"
        ))
        return
    
    # First check if cluster is reachable
    try:
        # Simple connectivity test
        connectivity_result = subprocess.run(
            "kubectl cluster-info --request-timeout=10s", 
            shell=True, 
            capture_output=True, 
            text=True, 
            check=True
        )
        
        # If we get here, cluster is reachable, now get detailed status
        cmd = "kubectl get pods,svc,pvc,cronjob --namespace default -o wide"
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, check=True)
        
        if result.stdout.strip():
            CONSOLE.print(Panel(
                result.stdout, 
                title="Kubernetes Resource Status", 
                border_style="green"
            ))
        else:
            CONSOLE.print(Panel(
                "No resources found in the default namespace.\n"
                "The cluster is running but no applications are deployed.",
                title="Cluster Status - No Resources",
                border_style="yellow"
            ))
            
    except subprocess.CalledProcessError as e:
        output = (e.stdout or "") + (e.stderr or "")
        normalized = output.lower()

        # Concise offline message for common connection-refused cases
        connection_refused = (
            "actively refused" in normalized
            or "was refused" in normalized
            or "no connection could be made" in normalized
            or "connection refused" in normalized
        ) and ("https://" in normalized or "cluster-info" in normalized or "api" in normalized)

        if connection_refused:
            CONSOLE.print(Panel("Cluster offline", title="Kubernetes", border_style="yellow"))
        elif "context" in output.lower() and "not found" in output.lower():
            CONSOLE.print(Panel(
                "[red]No Kubernetes context configured[/red]\n\n"
                "Please configure your kubectl context:\n"
                "• [cyan]kubectl config get-contexts[/cyan] - list available contexts\n"
                "• [cyan]kubectl config use-context <context-name>[/cyan] - switch context",
                title="No Context Found",
                border_style="red"
            ))
        else:
            # Generic error display with better formatting
            error_text = Text()
            error_text.append("Error checking cluster status:\n\n", style="red")
            error_text.append(output, style="white")
            
            CONSOLE.print(Panel(
                error_text,
                title="Cluster Status Error",
                border_style="red"
            ))

def manage_kubernetes_environment():
    """Handles all logic for the Kubernetes environment."""
    CONSOLE.print(Panel("[bold]Kubernetes Environment Manager[/bold]", expand=False))
    while True:
        try:
            action_choice = inquirer.select(
                message="Select an action:",
                choices=[
                    Choice("deploy", "Deploy now"),
                    Choice("refresh", "Refresh (restart deployments, keep data)"),
                    Choice("stop", "Stop (scale down deployments, keep data)"),
                    Choice("destroy", "Destroy now (delete everything)"),
                    Choice("status", "Check cluster status"),
                    Choice("gen_deploy", "Generate deploy script only"),
                    Choice("gen_destroy", "Generate destroy script only"),
                    Choice("build_images", "Build and load local images"),
                    Choice("start_kind", "Start local kind cluster"),
                    Choice("delete_kind", "Delete local kind cluster"),
                    Choice("port_forward", "Port-forward a service"),
                    Choice(value=None, name="Exit")
                ],
                default="deploy",
            ).execute()

            if not action_choice:
                break

            if action_choice in ["deploy", "destroy", "refresh", "stop", "gen_deploy", "gen_destroy"]:
                scope_choice = inquirer.select(
                    message="Select scope:",
                    choices=[
                        Choice("all", "Full Stack"),
                        Choice("group", "Specific Service Groups")
                    ],
                    default="group"
                ).execute()

                if scope_choice == "all":
                    selected_groups = list(K8S_SERVICE_GROUPS.keys())
                else:
                    group_choices = [Choice(value=name, name=f"{name}: {data['description']}") for name, data in K8S_SERVICE_GROUPS.items()]
                    selected_groups = inquirer.checkbox(
                        message="Select the service groups to act on:",
                        choices=group_choices,
                        cycle=True,
                        long_instruction="Use SPACE to select. Note: Dependencies are not automatically selected."
                    ).execute()

                if action_choice in ["deploy", "gen_deploy"]:
                    # Load env from .env files if present (e.g., WOLFRAM_DOWNLOAD_URL)
                    _load_env_file_if_present()
                    # Ensure cluster is online before proceeding with live deploy
                    if action_choice == "deploy" and not _ensure_cluster_online_or_offer_start():
                        CONSOLE.print("[yellow]Deploy cancelled: cluster is offline.[/yellow]")
                        continue
                    # Build and load local images to kind to avoid ErrImageNeverPull
                    if action_choice == "deploy":
                        _build_and_load_kind_images(selected_groups)
                    generate_k8s_deploy_script(selected_groups)
                    if action_choice == "deploy":
                        script_part = "all" if len(selected_groups) == len(K8S_SERVICE_GROUPS) else "_".join(g.split()[0].lower() for g in selected_groups)
                        script_path = f"deploy_k8s_{script_part}.ps1" if _is_windows() else f"deploy_k8s_{script_part}.sh"
                        _run_script(script_path)
                        if inquirer.confirm(message="Wait for resources to become Ready?", default=True).execute():
                            wait_for_readiness()
                elif action_choice == "refresh":
                    if not _ensure_cluster_online_or_offer_start():
                        CONSOLE.print("[yellow]Refresh cancelled: cluster is offline.[/yellow]")
                        continue
                    refresh_k8s_deployments(selected_groups)
                elif action_choice == "stop":
                    if not _ensure_cluster_online_or_offer_start():
                        CONSOLE.print("[yellow]Stop cancelled: cluster is offline.[/yellow]")
                        continue
                    stop_k8s_deployments(selected_groups)
                else:  # destroy or gen_destroy
                    if action_choice == "destroy" and not _ensure_cluster_online_or_offer_start():
                        CONSOLE.print("[yellow]Destroy cancelled: cluster is offline.[/yellow]")
                        continue
                    # Ask user if they want to preserve PVCs
                    preserve_pvc = False
                    if inquirer.confirm(message="Preserve PersistentVolumeClaims (wolfram-state, etc.)?", default=True).execute():
                        preserve_pvc = True
                    generate_k8s_destroy_script(selected_groups, preserve_pvc=preserve_pvc)
                    if action_choice == "destroy":
                        script_part = "all" if len(selected_groups) == len(K8S_SERVICE_GROUPS) else "_".join(g.split()[0].lower() for g in selected_groups)
                        script_path = f"destroy_k8s_{script_part}.ps1" if _is_windows() else f"destroy_k8s_{script_part}.sh"
                        _run_script(script_path)

            elif action_choice == "status":
                check_k8s_status()
                # Offer to build images if image pull errors detected
                try:
                    pods_out = subprocess.run([
                        "kubectl", "get", "pods", "-n", "default", "-o", "json"
                    ], check=True, capture_output=True, text=True)
                    pods_data = json.loads(pods_out.stdout or "{}")
                    needs_images = False
                    for pod in pods_data.get("items", []) or []:
                        for cs in pod.get("status", {}).get("containerStatuses", []) or []:
                            st = cs.get("state", {})
                            reason = None
                            if "waiting" in st:
                                reason = st["waiting"].get("reason")
                            if "terminated" in st and not reason:
                                reason = st["terminated"].get("reason")
                            if reason in ("ErrImageNeverPull", "ImagePullBackOff", "ErrImagePull"):
                                needs_images = True
                                break
                        if needs_images:
                            break
                    if needs_images and inquirer.confirm(message="Detected image pull errors. Build and load local images now?", default=True).execute():
                        _build_and_load_kind_images(list(K8S_SERVICE_GROUPS.keys()))
                except Exception:
                    pass

            elif action_choice == "start_kind":
                if _start_kind_cluster_interactive():
                    # After cluster starts, offer to build local images
                    if inquirer.confirm(message="Build and load local images now?", default=True).execute():
                        _build_and_load_kind_images(list(K8S_SERVICE_GROUPS.keys()))

            elif action_choice == "delete_kind":
                if not _kind_available():
                    CONSOLE.print("[red]kind is not installed.[/red]")
                else:
                    confirm = inquirer.confirm(message="Delete local kind cluster 'enginedge'?", default=False).execute()
                    if confirm:
                        try:
                            subprocess.run(["kind", "delete", "cluster", "--name", "enginedge"], check=True)
                            CONSOLE.print("[green]Deleted kind cluster 'enginedge'.[/green]\n")
                        except subprocess.CalledProcessError as e:
                            CONSOLE.print(f"[red]Failed to delete kind cluster: {e}[/red]")

            elif action_choice == "port_forward":
                if not _ensure_cluster_online_or_offer_start():
                    CONSOLE.print("[yellow]Cluster offline. Port-forward cancelled.[/yellow]")
                    continue
                services = _list_services()
                if not services:
                    CONSOLE.print("[yellow]No services found in namespace 'default'.[/yellow]")
                    continue
                svc_choice = inquirer.select(
                    message="Select service to port-forward:",
                    choices=[Choice(s["name"], s["name"]) for s in services],
                ).execute()
                svc = next((s for s in services if s["name"] == svc_choice), None)
                if not svc:
                    continue
                ports = svc.get("ports", [])
                if not ports:
                    CONSOLE.print("[yellow]Selected service has no ports defined.[/yellow]")
                    continue
                port_map = {f"{p.get('name') or 'port'} ({p.get('port')})->{p.get('targetPort')}": p for p in ports}
                chosen = inquirer.select(
                    message="Choose target port:",
                    choices=[Choice(k, k) for k in port_map.keys()],
                ).execute()
                p = port_map.get(chosen)
                if not p:
                    continue
                target_port = p.get("targetPort") or p.get("port")
                default_local = str(p.get("port"))
                local_port_str = inquirer.text(message=f"Local port (default {default_local}):", default=default_local).execute()
                try:
                    local_port = int(local_port_str)
                except ValueError:
                    CONSOLE.print("[red]Invalid local port.[/red]")
                    continue
                _start_port_forward(svc_choice, local_port, int(target_port))
                # Offer to view logs for a related deployment/statefulset
                if inquirer.confirm(message="Open logs for this service now?", default=False).execute():
                    # Try to find a pod serving this service selector
                    try:
                        # Get service selectors
                        svc_json = subprocess.run([
                            "kubectl", "get", "svc", svc_choice, "-n", "default", "-o", "json"
                        ], check=True, capture_output=True, text=True)
                        selector = json.loads(svc_json.stdout or "{}").get("spec", {}).get("selector", {})
                        if selector:
                            selector_str = ",".join([f"{k}={v}" for k, v in selector.items()])
                            # Get one pod matching selector
                            pod_json = subprocess.run([
                                "kubectl", "get", "pods", "-n", "default", "-l", selector_str, "-o", "jsonpath={.items[0].metadata.name}"
                            ], check=True, capture_output=True, text=True)
                            pod_name = (pod_json.stdout or "").strip()
                            if pod_name:
                                # Stream logs (non-blocking user can Ctrl+C)
                                CONSOLE.print(f"[cyan]Streaming logs for pod {pod_name} (Press Ctrl+C to stop)...[/cyan]")
                                try:
                                    subprocess.run(["kubectl", "logs", "-f", pod_name, "-n", "default"])  # interactive
                                except KeyboardInterrupt:
                                    pass
                            else:
                                CONSOLE.print("[yellow]No pod found for service selector.[/yellow]")
                        else:
                            CONSOLE.print("[yellow]Service has no selector; cannot find backing pod.[/yellow]")
                    except subprocess.CalledProcessError:
                        CONSOLE.print("[red]Failed to fetch service or pod information.[/red]")

            elif action_choice == "build_images":
                # Choose scope similar to deploy/destroy
                scope_choice = inquirer.select(
                    message="Select scope:",
                    choices=[
                        Choice("all", "Full Stack"),
                        Choice("group", "Specific Service Groups")
                    ],
                    default="all"
                ).execute()
                if scope_choice == "all":
                    selected_groups = list(K8S_SERVICE_GROUPS.keys())
                else:
                    group_choices = [Choice(value=name, name=f"{name}: {data['description']}") for name, data in K8S_SERVICE_GROUPS.items()]
                    selected_groups = inquirer.checkbox(
                        message="Select the service groups to build images for:",
                        choices=group_choices,
                        cycle=True,
                    ).execute()
                _build_and_load_kind_images(selected_groups)

        except KeyboardInterrupt:
            CONSOLE.print("\n[yellow]Operation cancelled by user.[/yellow]")
            break
        except Exception as e:
            CONSOLE.print(f"\n[red]An error occurred: {e}[/red]")
            if not inquirer.confirm(message="Continue with the menu?", default=True).execute():
                break

# --- Main Entry Point ---

def main():
    """Main function to run the control center."""
    try:
        CONSOLE.print(Panel("[bold green]EnginEdge Service Control Center[/bold green]", expand=False))
        # Top-level mode selection
        mode = inquirer.select(
            message="Choose environment mode:",
            choices=[
                Choice("k8s", "Kubernetes (kind)"),
                Choice("dev", "Dev (Hybrid: Docker Compose)"),
                Choice(None, "Exit"),
            ],
            default="k8s",
        ).execute()
        if mode == "k8s":
            manage_kubernetes_environment()
        elif mode == "dev":
            manage_dev_hybrid_environment()
        CONSOLE.print("\n[green]Thank you for using EnginEdge Control Center![/green]")
    except KeyboardInterrupt:
        CONSOLE.print("\n[yellow]Shutdown requested. Exiting gracefully...[/yellow]")
    except Exception as e:
        CONSOLE.print(f"\n[red]Fatal error: {e}[/red]")
        sys.exit(1)

if __name__ == "__main__":
    main()
