#!/usr/bin/env bash

set -euo pipefail

# Project directory: use MY_PROJECT_DIR if set, otherwise fallback to default
PROJECT_DIR="${MY_PROJECT_DIR:-/home/z/my-project}"
# Code package URL placeholders (replaced with actual URLs before upload by
# upload-to-oss.ts). CODE_TAR_URL 是首选源（OSS 内网 endpoint，同 region VPC
# 直连，~几百 ms）；CODE_TAR_FALLBACK_URL 是备用源（公网 CDN），仅当内网下载
# 失败时兜底——少数 FC instance 的 VPC 内网偶发劣化时不至于彻底卡死。
CODE_TAR_URL="https://sandbox-public.oss-cn-hongkong-internal.aliyuncs.com/fullstack/code_1785226337571.tar"
CODE_TAR_FALLBACK_URL="https://z-cdn.chatglm.cn/fullstack/code_1785226337571.tar"

# Fixed behavior: keep existing target directory contents; run dev.sh after extraction
SKIP_DEV="false"

TMP_ROOT=""

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

err() {
  printf '[%s] ERROR: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2
}

cleanup() {
  if [ -n "${TMP_ROOT}" ] && [ -d "${TMP_ROOT}" ]; then
    rm -rf "${TMP_ROOT}" || true
  fi
}

trap cleanup EXIT INT TERM

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    err "command not found: $cmd"
    exit 1
  fi
}

download_tarball() {
  local src="$1"
  local out="$2"

  case "$src" in
    http://*|https://*)
      log "Downloading package from HTTP(S): $src"
      curl -fL --retry 3 --retry-delay 2 --connect-timeout 10 --max-time 1800 "$src" -o "$out"
      ;;
    oss://*)
      if ! command -v ossutil >/dev/null 2>&1; then
        err "ossutil is required for oss:// URLs but was not found in PATH"
        err "install ossutil or provide a pre-signed https URL"
        exit 1
      fi

      log "Downloading package from OSS: $src"
      # If OSS credentials are provided as env vars, configure ossutil for this run.
      if [ -n "${OSS_ACCESS_KEY_ID:-}" ] && [ -n "${OSS_ACCESS_KEY_SECRET:-}" ] && [ -n "${OSS_ENDPOINT:-}" ]; then
        ossutil config -e "$OSS_ENDPOINT" -i "$OSS_ACCESS_KEY_ID" -k "$OSS_ACCESS_KEY_SECRET" >/dev/null
      fi

      ossutil cp "$src" "$out" -f
      ;;
    *)
      err "unsupported --code-tar-url scheme: $src"
      err "supported: https://..., http://..., oss://..."
      exit 1
      ;;
  esac
}

# download_tarball_with_fallback 先用首选源（OSS 内网）下载，失败再退到备用源
# （公网 CDN）。内网链路对绝大多数 instance 是 VPC 直连（~几百 ms），但个别
# instance 的 VPC 内网会偶发劣化——这时 connect-timeout 快速失败后自动切到公网
# CDN，避免像过去那样卡在单一公网源上 76s 直到 completion 整体超时。
download_tarball_with_fallback() {
  local primary="$1"
  local fallback="$2"
  local out="$3"

  if download_tarball "$primary" "$out"; then
    return 0
  fi

  # 备用源缺失（占位符未替换 / 与主源相同）时不重复尝试
  if [ -z "$fallback" ] || [ "$fallback" = "https://z-cdn.chatglm.cn/fullstack/code_1785226337571.tar" ] || [ "$fallback" = "$primary" ]; then
    err "primary download failed and no usable fallback URL"
    return 1
  fi

  err "primary source failed, falling back to: $fallback"
  download_tarball "$fallback" "$out"
}

prepare_target_dir() {
  local dir="$1"

  mkdir -p "$dir"

  if [ -n "$(ls -A "$dir" 2>/dev/null || true)" ]; then
    log "Target directory is not empty, keeping existing contents: $dir"
  fi
}

extract_project() {
  local tar_file="$1"
  local target_dir="$2"
  local unpack_dir="$3"
  local tar_flags=""

  log "Validating tar package"
  if tar -tzf "$tar_file" >/dev/null 2>&1; then
    tar_flags="z"
  elif tar -tf "$tar_file" >/dev/null 2>&1; then
    tar_flags=""
  else
    err "invalid tar package: $tar_file"
    exit 1
  fi

  log "Extracting package to temp directory"
  mkdir -p "$unpack_dir"
  tar -x${tar_flags}f "$tar_file" -C "$unpack_dir"

  local source_root="$unpack_dir"
  local child_count
  child_count="$(find "$unpack_dir" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"

  if [ "$child_count" = "1" ] && [ -z "$(find "$unpack_dir" -mindepth 1 -maxdepth 1 -type f -print -quit)" ]; then
    source_root="$(find "$unpack_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  fi

  log "Copying project files into target directory"
  cp -a "$source_root"/. "$target_dir"/
}

run_dev_script() {
  local target_dir="$1"
  local dev_script="$target_dir/.zscripts/dev.sh"
  local log_file="$target_dir/.zscripts/dev.log"
  local pid_file="$target_dir/.zscripts/dev.pid"

  if [ "$SKIP_DEV" = "true" ]; then
    log "SKIP_DEV=true, skip running dev.sh"
    return 0
  fi

  if [ ! -f "$dev_script" ]; then
    err "dev script not found: $dev_script"
    exit 1
  fi

  chmod +x "$dev_script"
  log "Starting fullstack dev script in background: $dev_script"

  export DATABASE_URL="${DATABASE_URL:-file:${target_dir}/db/custom.db}"

  (
    cd "$target_dir"
    nohup bash "$dev_script" >>"$log_file" 2>&1 </dev/null &
    echo "$!" >"$pid_file"
  )

  log "dev.sh started in background"
  log "PID file: $pid_file"
  log "Log file: $log_file"
}

main() {
  local existing_package_json="$PROJECT_DIR/package.json"
  local existing_dev_script="$PROJECT_DIR/.zscripts/dev.sh"

  if [ -f "$existing_dev_script" ]; then
    log "Skipping code download and extraction, starting existing dev.sh"
    run_dev_script "$PROJECT_DIR"
    log "Initialization completed successfully"
    return 0
  fi

  if [ -f "$existing_package_json" ]; then
    log "Found existing package.json, skipping initialization"
    return 0
  fi

  require_cmd curl
  require_cmd tar

  TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/init-fullstack.XXXXXX")"
  local tar_path="$TMP_ROOT/package.tar"
  local unpack_path="$TMP_ROOT/unpacked"

  log "Initializing fullstack project"
  log "Target directory: $PROJECT_DIR"
  log "Package source (primary): $CODE_TAR_URL"
  log "Package source (fallback): $CODE_TAR_FALLBACK_URL"

  prepare_target_dir "$PROJECT_DIR"
  download_tarball_with_fallback "$CODE_TAR_URL" "$CODE_TAR_FALLBACK_URL" "$tar_path"
  extract_project "$tar_path" "$PROJECT_DIR" "$unpack_path"
  run_dev_script "$PROJECT_DIR"

  log "Initialization completed successfully"
}

main
