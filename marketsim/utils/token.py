import json, gzip, base64, zlib

def encode_sim_token(cfg: dict) -> str:
    cfg = dict(cfg)
    cfg.setdefault("seed", 123456789)  # ensure determinism
    js = json.dumps(cfg, sort_keys=True, separators=(",", ":"), allow_nan=False)
    gz = gzip.compress(js.encode("utf-8"), mtime=0)  # deterministic gzip
    crc = zlib.crc32(js.encode("utf-8")) & 0xFFFFFFFF
    body = base64.urlsafe_b64encode(gz).decode().rstrip("=")
    sig  = base64.urlsafe_b64encode(crc.to_bytes(4, "big")).decode().rstrip("=")
    return f"{body}.{sig}"

def decode_sim_token(token: str) -> dict:
    body, sig = token.split(".", 1)
    pad = "=" * (-len(body) % 4)
    gz = base64.urlsafe_b64decode(body + pad)
    js = gzip.decompress(gz).decode("utf-8")
    expect = int.from_bytes(base64.urlsafe_b64decode(sig + "=" * (-len(sig) % 4)), "big")
    have = zlib.crc32(js.encode("utf-8")) & 0xFFFFFFFF
    if have != expect:
        raise ValueError("Token corrupted (checksum mismatch)")
    return json.loads(js)
