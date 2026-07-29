#!/usr/bin/env python3
"""
Upload the rendered XYZ tile directory to Supabase Storage (S3-compatible API).

Supabase Storage speaks the S3 protocol, so we use boto3 — far faster and more
reliable for thousands of small files than the dashboard or REST uploader.

SETUP (once):
  1. Supabase dashboard -> Storage -> New bucket
       name: chart-tiles   |   Public bucket: ON
  2. Supabase dashboard -> Project Settings -> Storage -> S3 Connection
       - copy the "Endpoint" URL          -> SUPABASE_S3_ENDPOINT
       - copy the "Region"                -> SUPABASE_S3_REGION
       - click "New access key"           -> SUPABASE_S3_ACCESS_KEY / _SECRET_KEY
  3. Export the env vars below, then run this script.

USAGE:
  export SUPABASE_S3_ENDPOINT="https://<project-ref>.storage.supabase.co/storage/v1/s3"
  export SUPABASE_S3_REGION="us-east-1"          # whatever the dashboard shows
  export SUPABASE_S3_ACCESS_KEY="..."
  export SUPABASE_S3_SECRET_KEY="..."
  python3 upload_supabase.py --src tiles --bucket chart-tiles --prefix chart/v1

  # dry run first to see the count / URL:
  python3 upload_supabase.py --src tiles --bucket chart-tiles --prefix chart/v1 --dry-run

Re-running is safe: it overwrites the same keys (idempotent). Version the prefix
(chart/v1, chart/v2, ...) so cached tiles never go stale for users.
"""
import argparse
import concurrent.futures as cf
import os
import sys
import threading

import boto3
from botocore.config import Config


def env(name):
    v = os.environ.get(name)
    if not v:
        sys.exit(f"Missing required env var: {name}  (see header of this file)")
    return v


def make_client():
    return boto3.client(
        "s3",
        endpoint_url=env("SUPABASE_S3_ENDPOINT"),
        region_name=env("SUPABASE_S3_REGION"),
        aws_access_key_id=env("SUPABASE_S3_ACCESS_KEY"),
        aws_secret_access_key=env("SUPABASE_S3_SECRET_KEY"),
        config=Config(s3={"addressing_style": "path"}, retries={"max_attempts": 5}),
    )


def gather_tiles(src):
    files = []
    for z in os.listdir(src):
        zp = os.path.join(src, z)
        if not (z.isdigit() and os.path.isdir(zp)):
            continue
        for x in os.listdir(zp):
            xp = os.path.join(zp, x)
            for f in os.listdir(xp):
                if f.endswith(".png"):
                    files.append((os.path.join(xp, f), f"{z}/{x}/{f}"))
    return files


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="tiles")
    ap.add_argument("--bucket", default="chart-tiles")
    ap.add_argument("--prefix", default="chart/v1", help="version this: chart/v1")
    ap.add_argument("--workers", type=int, default=16)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    tiles = gather_tiles(a.src)
    print(f"found {len(tiles)} tiles under {a.src}/")

    endpoint = os.environ.get("SUPABASE_S3_ENDPOINT")
    if endpoint:
        ref = endpoint.split("//")[1].split(".")[0]
        public_base = (f"https://{ref}.supabase.co/storage/v1/object/public/"
                       f"{a.bucket}/{a.prefix}")
        print(f"public URL base:\n  {public_base}/{{z}}/{{x}}/{{y}}.png\n")
    else:
        public_base = ("https://<project-ref>.supabase.co/storage/v1/object/"
                       f"public/{a.bucket}/{a.prefix}")
        print("(SUPABASE_S3_ENDPOINT not set — showing template URL)")
        print(f"public URL base:\n  {public_base}/{{z}}/{{x}}/{{y}}.png\n")

    if a.dry_run:
        print("dry run — nothing uploaded.")
        return

    client = make_client()
    done = {"n": 0}
    lock = threading.Lock()

    def put(job):
        local, rel = job
        key = f"{a.prefix}/{rel}"
        with open(local, "rb") as fh:
            client.put_object(
                Bucket=a.bucket, Key=key, Body=fh.read(),
                ContentType="image/png",
                CacheControl="public, max-age=31536000, immutable",
            )
        with lock:
            done["n"] += 1
            if done["n"] % 100 == 0 or done["n"] == len(tiles):
                print(f"  uploaded {done['n']}/{len(tiles)}")

    with cf.ThreadPoolExecutor(max_workers=a.workers) as ex:
        list(ex.map(put, tiles))

    print(f"\ndone — {done['n']} tiles live at:\n  {public_base}/{{z}}/{{x}}/{{y}}.png")


if __name__ == "__main__":
    main()
