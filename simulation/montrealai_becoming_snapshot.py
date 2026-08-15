"""Build a reproducible MONTREAL.AI Genesis ERC-1155 ownership snapshot."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

CHAIN_ID = 1
CONTRACT = "0x495f947276749ce646f68ac8c248420045cb7b5e"
CREATOR = "0x054a2e4b3b5ea2c62372e92358fdf7fb74b4f34a"
COLLECTION_SLUG = "montrealai"
TARGET_COUNT = 556
CANONICAL_NUMBERS = set(range(1, TARGET_COUNT + 1))
CANDIDATE_INDEXES = range(1, 701)
BALANCE_OF_SELECTOR = "00fdd58e"
ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
BLOCKSCOUT = "https://eth.blockscout.com"
RPC_CANDIDATES = (
    "https://ethereum-rpc.publicnode.com",
    "https://eth.llamarpc.com",
    "https://rpc.flashbots.net",
    "https://cloudflare-eth.com",
    "https://eth.drpc.org",
    "https://1rpc.io/eth",
)
USER_AGENT = "MONTREAL.AI-Becoming-Omega-Snapshot/1.0 (+https://montreal.ai)"
TITLE_RE = re.compile(r"^Crypto AI Art\s*#\s*0*(\d+)\s*$", re.IGNORECASE)


class SnapshotError(RuntimeError):
    """Raised when a snapshot cannot be proven complete."""


def _canonical_json(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode(
        "utf-8"
    )


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _write_json(path: Path, value: Any) -> None:
    path.write_bytes(_canonical_json(value))


def _http_json(
    url: str,
    *,
    method: str = "GET",
    payload: Any | None = None,
    attempts: int = 5,
    timeout: int = 45,
    allow_not_found: bool = False,
) -> Any | None:
    body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
    }
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, data=body, headers=headers, method=method)
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read()
            return json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if allow_not_found and exc.code in {400, 404}:
                return None
            last_error = exc
            if exc.code not in {408, 425, 429, 500, 502, 503, 504}:
                break
            retry_after = exc.headers.get("Retry-After")
            delay = (
                float(retry_after)
                if retry_after and retry_after.isdigit()
                else min(8.0, 0.5 * (2**attempt))
            )
            time.sleep(delay)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
            time.sleep(min(8.0, 0.5 * (2**attempt)))
    if allow_not_found:
        return None
    raise SnapshotError(
        f"HTTP request failed after {attempts} attempts: {url}: {last_error!r}"
    )


def _token_id(index: int, supply: int = 1) -> int:
    creator_int = int(CREATOR, 16)
    return (creator_int << 96) | (index << 40) | supply


def _decode_token_id(token_id: int) -> dict[str, Any]:
    middle = (token_id >> 32) & ((1 << 64) - 1)
    return {
        "creator": f"0x{token_id >> 96:040x}",
        "creator_index": middle >> 8,
        "token_type_byte": middle & 0xFF,
        "encoded_supply": token_id & ((1 << 32) - 1),
    }


def _extract_number(name: Any) -> int | None:
    if not isinstance(name, str):
        return None
    match = TITLE_RE.match(name.strip())
    if not match:
        return None
    number = int(match.group(1))
    return number if number in CANONICAL_NUMBERS else None


def _normalise_nft(token_id: Any, name: Any, source: str) -> dict[str, Any] | None:
    try:
        text = str(token_id)
        token_int = int(text, 0) if text.lower().startswith("0x") else int(text)
    except (TypeError, ValueError):
        return None
    number = _extract_number(name)
    if number is None:
        return None
    decoded = _decode_token_id(token_int)
    if decoded["creator"].lower() != CREATOR or decoded["encoded_supply"] != 1:
        return None
    return {
        "canonical_number": number,
        "title": f"Crypto AI Art #{number:03d}",
        "chain_id": CHAIN_ID,
        "contract": CONTRACT,
        "token_standard": "ERC-1155",
        "token_id_decimal": str(token_int),
        "token_id_hex": f"0x{token_int:064x}",
        "creator_address": CREATOR,
        "creator_index": decoded["creator_index"],
        "token_type_byte": decoded["token_type_byte"],
        "encoded_supply": decoded["encoded_supply"],
        "manifest_source": source,
    }


def _merge_manifest_record(
    by_number: dict[int, dict[str, Any]],
    by_token: dict[str, dict[str, Any]],
    record: dict[str, Any] | None,
) -> None:
    if record is None:
        return
    number = record["canonical_number"]
    token_id = record["token_id_decimal"]
    prior_number = by_number.get(number)
    prior_token = by_token.get(token_id)
    if prior_number and prior_number["token_id_decimal"] != token_id:
        raise SnapshotError(f"Conflicting token IDs for canonical number {number}")
    if prior_token and prior_token["canonical_number"] != number:
        raise SnapshotError(f"Token ID {token_id} maps to multiple canonical numbers")
    if prior_number:
        sources = set(prior_number["manifest_source"].split("+"))
        sources.update(record["manifest_source"].split("+"))
        prior_number["manifest_source"] = "+".join(sorted(sources))
        by_token[token_id] = prior_number
    else:
        by_number[number] = record
        by_token[token_id] = record


def _manifest_from_opensea_v2() -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    cursor: str | None = None
    seen_cursors: set[str] = set()
    for _ in range(10):
        params = {"limit": "200"}
        if cursor:
            params["next"] = cursor
        url = (
            f"https://api.opensea.io/api/v2/collection/{COLLECTION_SLUG}/nfts?"
            + urllib.parse.urlencode(params)
        )
        try:
            data = _http_json(url, attempts=2)
        except SnapshotError:
            return records
        if not isinstance(data, dict) or not isinstance(data.get("nfts"), list):
            return records
        for nft in data["nfts"]:
            if not isinstance(nft, dict):
                continue
            records.append(
                _normalise_nft(
                    nft.get("identifier") or nft.get("token_id"),
                    nft.get("name"),
                    "opensea-v2-collection",
                )
            )
        cursor_value = data.get("next")
        cursor = str(cursor_value) if cursor_value else None
        if not cursor or cursor in seen_cursors:
            break
        seen_cursors.add(cursor)
    return [record for record in records if record is not None]


def _metadata_record(index: int) -> dict[str, Any] | None:
    token_text = str(_token_id(index))
    urls = (
        (
            f"https://api.opensea.io/api/v1/metadata/{CONTRACT}/{token_text}",
            "opensea-v1-metadata",
        ),
        (
            f"{BLOCKSCOUT}/api/v2/tokens/{CONTRACT}/instances/{token_text}",
            "blockscout-instance-metadata",
        ),
    )
    for url, source in urls:
        try:
            data = _http_json(url, attempts=3, allow_not_found=True)
        except SnapshotError:
            continue
        if not isinstance(data, dict):
            continue
        metadata = data.get("metadata")
        candidate = metadata if isinstance(metadata, dict) else data
        name = candidate.get("name") if isinstance(candidate, dict) else None
        record = _normalise_nft(token_text, name, source)
        if record:
            return record
    return None


def _manifest_from_metadata() -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=24) as executor:
        futures = {
            executor.submit(_metadata_record, index): index for index in CANDIDATE_INDEXES
        }
        for future in as_completed(futures):
            record = future.result()
            if record:
                records.append(record)
    return records


def _manifest_from_creator_transfers() -> list[dict[str, Any]]:
    url = f"{BLOCKSCOUT}/api?" + urllib.parse.urlencode(
        {
            "module": "account",
            "action": "token1155tx",
            "address": CREATOR,
            "contractaddress": CONTRACT,
            "page": 1,
            "offset": 10000,
            "sort": "asc",
        }
    )
    try:
        data = _http_json(url, attempts=4)
    except SnapshotError:
        return []
    if not isinstance(data, dict) or not isinstance(data.get("result"), list):
        return []
    records: list[dict[str, Any]] = []
    for event in data["result"]:
        if not isinstance(event, dict):
            continue
        record = _normalise_nft(
            event.get("tokenID") or event.get("tokenId"),
            event.get("tokenName") or event.get("name"),
            "blockscout-creator-transfers",
        )
        if record:
            records.append(record)
    return records


def _build_manifest() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    by_number: dict[int, dict[str, Any]] = {}
    by_token: dict[str, dict[str, Any]] = {}
    diagnostics: dict[str, Any] = {"methods": {}}
    methods = (
        ("opensea_v2_collection", _manifest_from_opensea_v2),
        ("blockscout_creator_transfers", _manifest_from_creator_transfers),
        ("candidate_metadata_enumeration", _manifest_from_metadata),
    )
    for method_name, method in methods:
        records = method()
        diagnostics["methods"][method_name] = {
            "records_returned": len(records),
            "unique_canonical_numbers_after_merge": None,
        }
        for record in records:
            _merge_manifest_record(by_number, by_token, record)
        diagnostics["methods"][method_name]["unique_canonical_numbers_after_merge"] = len(
            by_number
        )
        if set(by_number) == CANONICAL_NUMBERS:
            break
    missing = sorted(CANONICAL_NUMBERS - set(by_number))
    extra = sorted(set(by_number) - CANONICAL_NUMBERS)
    diagnostics["missing_canonical_numbers"] = missing
    diagnostics["extra_canonical_numbers"] = extra
    diagnostics["unique_token_ids"] = len(by_token)
    if missing or extra or len(by_number) != TARGET_COUNT or len(by_token) != TARGET_COUNT:
        raise SnapshotError(
            f"Manifest is incomplete: {len(by_number)} canonical numbers, "
            f"{len(by_token)} unique IDs, missing={missing[:20]}"
        )
    return [by_number[number] for number in sorted(by_number)], diagnostics


def _rpc(url: str, payload: Any, *, attempts: int = 4) -> Any:
    return _http_json(url, method="POST", payload=payload, attempts=attempts, timeout=60)


def _rpc_call(url: str, method: str, params: list[Any]) -> Any:
    data = _rpc(url, {"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
    if not isinstance(data, dict) or data.get("error"):
        raise SnapshotError(f"RPC error from {url}: {data!r}")
    return data.get("result")


def _select_snapshot_block() -> tuple[dict[str, Any], list[str], dict[str, Any]]:
    candidates: list[tuple[str, dict[str, Any]]] = []
    errors: dict[str, str] = {}
    for url in RPC_CANDIDATES:
        try:
            block = _rpc_call(url, "eth_getBlockByNumber", ["finalized", False])
            if isinstance(block, dict) and block.get("number") and block.get("hash"):
                candidates.append((url, block))
        except Exception as exc:
            errors[url] = repr(exc)
    if len(candidates) < 2:
        raise SnapshotError(
            f"Fewer than two public RPC endpoints returned a finalized block: {errors}"
        )
    selected_number = min(int(block["number"], 16) for _, block in candidates)
    selected_hex = hex(selected_number)
    hash_groups: dict[str, list[str]] = defaultdict(list)
    blocks_by_hash: dict[str, dict[str, Any]] = {}
    verification_errors: dict[str, str] = {}
    for url, _ in candidates:
        try:
            block = _rpc_call(url, "eth_getBlockByNumber", [selected_hex, False])
            if not isinstance(block, dict) or not block.get("hash"):
                raise SnapshotError("Missing block data")
            block_hash = str(block["hash"]).lower()
            hash_groups[block_hash].append(url)
            blocks_by_hash[block_hash] = block
        except Exception as exc:
            verification_errors[url] = repr(exc)
    agreed_hash, agreeing_urls = max(hash_groups.items(), key=lambda item: len(item[1]))
    if len(agreeing_urls) < 2:
        raise SnapshotError(
            f"No two public RPC endpoints agree on block {selected_number}: {hash_groups}"
        )
    block = blocks_by_hash[agreed_hash]
    timestamp = int(block["timestamp"], 16)
    utc_dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
    montreal_dt = utc_dt.astimezone(ZoneInfo("America/Toronto"))
    snapshot = {
        "chain_id": CHAIN_ID,
        "block_number": selected_number,
        "block_number_hex": selected_hex,
        "block_hash": block["hash"],
        "parent_hash": block.get("parentHash"),
        "timestamp_unix": timestamp,
        "timestamp_utc": utc_dt.isoformat().replace("+00:00", "Z"),
        "timestamp_montreal": montreal_dt.isoformat(),
        "finality_tag": "finalized",
        "selection_rule": (
            "Minimum finalized block height reported by responding no-key public RPC "
            "endpoints, accepted only after at least two endpoints returned the same hash."
        ),
        "rpc_quorum": agreeing_urls,
    }
    diagnostics = {
        "finalized_responses": {
            url: {"number": int(candidate["number"], 16), "hash": candidate["hash"]}
            for url, candidate in candidates
        },
        "selected_block_hash_groups": hash_groups,
        "errors": {**errors, **verification_errors},
    }
    return snapshot, agreeing_urls, diagnostics


def _holder_candidates(record: dict[str, Any]) -> tuple[str, list[dict[str, Any]], str | None]:
    token_id = record["token_id_decimal"]
    url = f"{BLOCKSCOUT}/api/v2/tokens/{CONTRACT}/instances/{token_id}/holders"
    candidates: dict[str, dict[str, Any]] = {
        CREATOR: {
            "address": CREATOR,
            "ens": "montrealai.eth",
            "is_contract": False,
            "source": "encoded-creator-fallback",
        }
    }
    error: str | None = None
    try:
        data = _http_json(url, attempts=4, allow_not_found=True)
        if isinstance(data, dict) and isinstance(data.get("items"), list):
            for item in data["items"]:
                if not isinstance(item, dict):
                    continue
                address_data = item.get("address_hash")
                if isinstance(address_data, dict):
                    address = str(address_data.get("hash") or "").lower()
                    ens = address_data.get("ens_domain_name")
                    is_contract = address_data.get("is_contract")
                    name = address_data.get("name")
                else:
                    address = str(address_data or item.get("address") or "").lower()
                    ens = item.get("ens_domain_name")
                    is_contract = item.get("is_contract")
                    name = item.get("name")
                if not re.fullmatch(r"0x[a-f0-9]{40}", address) or address == ZERO_ADDRESS:
                    continue
                candidates[address] = {
                    "address": address,
                    "ens": ens,
                    "name": name,
                    "is_contract": is_contract,
                    "source": "blockscout-current-holder",
                    "indexed_value": str(item.get("value", "")),
                }
    except Exception as exc:
        error = repr(exc)
    return token_id, list(candidates.values()), error


def _get_candidate_holders(
    manifest: list[dict[str, Any]],
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, Any]]:
    candidates: dict[str, list[dict[str, Any]]] = {}
    errors: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = {executor.submit(_holder_candidates, record): record for record in manifest}
        for future in as_completed(futures):
            token_id, token_candidates, error = future.result()
            candidates[token_id] = token_candidates
            if error:
                errors[token_id] = error
    return candidates, {
        "tokens_queried": len(manifest),
        "tokens_with_blockscout_errors": len(errors),
        "blockscout_errors": errors,
    }


def _balance_call_data(address: str, token_id: str) -> str:
    clean_address = address.lower().removeprefix("0x")
    return "0x" + BALANCE_OF_SELECTOR + clean_address.rjust(64, "0") + f"{int(token_id):064x}"


def _batch_balances(
    rpc_url: str,
    pairs: list[tuple[str, str]],
    block_number: int,
    *,
    chunk_size: int = 80,
) -> dict[tuple[str, str], int]:
    results: dict[tuple[str, str], int] = {}
    for start in range(0, len(pairs), chunk_size):
        chunk = pairs[start : start + chunk_size]
        payload = [
            {
                "jsonrpc": "2.0",
                "id": index,
                "method": "eth_call",
                "params": [
                    {"to": CONTRACT, "data": _balance_call_data(address, token_id)},
                    hex(block_number),
                ],
            }
            for index, (token_id, address) in enumerate(chunk)
        ]
        response = _rpc(rpc_url, payload, attempts=5)
        if not isinstance(response, list):
            raise SnapshotError(f"RPC batch response was not a list from {rpc_url}")
        by_id = {int(item.get("id")): item for item in response if isinstance(item, dict)}
        for index, pair in enumerate(chunk):
            item = by_id.get(index)
            if not item or item.get("error") or not isinstance(item.get("result"), str):
                raise SnapshotError(
                    f"Missing balance response for {pair} from {rpc_url}: {item!r}"
                )
            results[pair] = int(item["result"], 16)
    return results


def _transfer_addresses(token_id: str) -> list[dict[str, Any]]:
    addresses: dict[str, dict[str, Any]] = {}
    params: dict[str, Any] = {}
    for _ in range(20):
        query = "?" + urllib.parse.urlencode(params) if params else ""
        url = f"{BLOCKSCOUT}/api/v2/tokens/{CONTRACT}/instances/{token_id}/transfers{query}"
        data = _http_json(url, attempts=4, allow_not_found=True)
        if not isinstance(data, dict) or not isinstance(data.get("items"), list):
            break
        for item in data["items"]:
            if not isinstance(item, dict):
                continue
            for side in ("from", "to"):
                address_data = item.get(side)
                if isinstance(address_data, dict):
                    address = str(address_data.get("hash") or "").lower()
                    ens = address_data.get("ens_domain_name")
                    is_contract = address_data.get("is_contract")
                    name = address_data.get("name")
                else:
                    address = str(address_data or "").lower()
                    ens = None
                    is_contract = None
                    name = None
                if re.fullmatch(r"0x[a-f0-9]{40}", address) and address != ZERO_ADDRESS:
                    addresses[address] = {
                        "address": address,
                        "ens": ens,
                        "name": name,
                        "is_contract": is_contract,
                        "source": "blockscout-transfer-history",
                    }
        next_params = data.get("next_page_params")
        if not isinstance(next_params, dict) or not next_params:
            break
        params = {key: value for key, value in next_params.items() if value is not None}
    return list(addresses.values())


def _resolve_holdings(
    manifest: list[dict[str, Any]],
    candidate_map: dict[str, list[dict[str, Any]]],
    snapshot: dict[str, Any],
    quorum_urls: list[str],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    primary, secondary = quorum_urls[:2]
    pair_metadata: dict[tuple[str, str], dict[str, Any]] = {}
    pairs: list[tuple[str, str]] = []
    for record in manifest:
        token_id = record["token_id_decimal"]
        for candidate in candidate_map[token_id]:
            address = candidate["address"].lower()
            pair = (token_id, address)
            if pair not in pair_metadata:
                pairs.append(pair)
                pair_metadata[pair] = candidate
    balances = _batch_balances(primary, pairs, snapshot["block_number"])
    unresolved: list[str] = []
    for record in manifest:
        token_id = record["token_id_decimal"]
        total = sum(
            balance
            for (candidate_token, _), balance in balances.items()
            if candidate_token == token_id and balance > 0
        )
        if total != record["encoded_supply"]:
            unresolved.append(token_id)
    fallback_pairs: list[tuple[str, str]] = []
    for token_id in unresolved:
        existing = {candidate["address"].lower() for candidate in candidate_map[token_id]}
        for candidate in _transfer_addresses(token_id):
            address = candidate["address"].lower()
            if address not in existing:
                candidate_map[token_id].append(candidate)
                pair = (token_id, address)
                fallback_pairs.append(pair)
                pair_metadata[pair] = candidate
                existing.add(address)
    if fallback_pairs:
        balances.update(
            _batch_balances(primary, fallback_pairs, snapshot["block_number"])
        )
    holdings: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    for record in manifest:
        token_id = record["token_id_decimal"]
        positives = [
            (address, balances.get((token_id, address), 0))
            for address in {candidate["address"].lower() for candidate in candidate_map[token_id]}
            if balances.get((token_id, address), 0) > 0
        ]
        total = sum(balance for _, balance in positives)
        if total != record["encoded_supply"] or not positives:
            failures.append(
                {
                    "canonical_number": record["canonical_number"],
                    "token_id_decimal": token_id,
                    "expected_supply": record["encoded_supply"],
                    "positive_balances": positives,
                    "candidate_count": len(candidate_map[token_id]),
                }
            )
            continue
        for address, balance in positives:
            metadata = pair_metadata.get((token_id, address), {})
            holdings.append(
                {
                    **record,
                    "owner_address": address,
                    "owner_ens": metadata.get("ens"),
                    "owner_name": metadata.get("name"),
                    "owner_is_contract": metadata.get("is_contract"),
                    "owner_candidate_source": metadata.get("source"),
                    "balance": balance,
                    "snapshot_block_number": snapshot["block_number"],
                    "snapshot_block_hash": snapshot["block_hash"],
                    "snapshot_timestamp_utc": snapshot["timestamp_utc"],
                }
            )
    if failures:
        raise SnapshotError(
            f"Could not resolve complete ownership for {len(failures)} tokens: {failures[:5]}"
        )
    verification_pairs = [
        (row["token_id_decimal"], row["owner_address"]) for row in holdings
    ]
    secondary_balances = _batch_balances(
        secondary, verification_pairs, snapshot["block_number"]
    )
    disagreements = [
        {
            "token_id_decimal": token_id,
            "owner_address": address,
            "primary_balance": balances[(token_id, address)],
            "secondary_balance": secondary_balances.get((token_id, address)),
        }
        for token_id, address in verification_pairs
        if balances[(token_id, address)] != secondary_balances.get((token_id, address))
    ]
    if disagreements:
        raise SnapshotError(f"RPC balance disagreement for {len(disagreements)} holdings")
    holdings.sort(key=lambda row: (row["canonical_number"], row["owner_address"]))
    return holdings, {
        "primary_rpc": primary,
        "secondary_rpc": secondary,
        "initial_balance_pairs": len(pairs),
        "fallback_tokens": len(unresolved),
        "fallback_balance_pairs": len(fallback_pairs),
        "holding_rows": len(holdings),
        "rpc_disagreements": disagreements,
    }


def _wallet_summary(holdings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for row in holdings:
        address = row["owner_address"]
        entry = grouped.setdefault(
            address,
            {
                "wallet": address,
                "ens": row.get("owner_ens"),
                "name": row.get("owner_name"),
                "is_contract": row.get("owner_is_contract"),
                "is_creator_wallet": address.lower() == CREATOR,
                "number_of_distinct_genesis_tokens": 0,
                "total_genesis_units": 0,
                "canonical_numbers": [],
            },
        )
        if not entry.get("ens") and row.get("owner_ens"):
            entry["ens"] = row["owner_ens"]
        entry["number_of_distinct_genesis_tokens"] += 1
        entry["total_genesis_units"] += int(row["balance"])
        entry["canonical_numbers"].append(int(row["canonical_number"]))
    summary = sorted(
        grouped.values(),
        key=lambda entry: (-entry["number_of_distinct_genesis_tokens"], entry["wallet"]),
    )
    for rank, entry in enumerate(summary, 1):
        entry["rank"] = rank
        entry["canonical_numbers"] = ",".join(
            f"{number:03d}" for number in sorted(entry["canonical_numbers"])
        )
    return summary


def _write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def _methodology(snapshot: dict[str, Any], manifest_count: int) -> str:
    return f"""# MONTREAL.AI — BECOMING Ω: THE FINAL 444
## Genesis ownership snapshot methodology

This package freezes ownership of the original MONTREAL.AI ERC-1155 collection at
Ethereum mainnet block **{snapshot['block_number']}**
(`{snapshot['block_hash']}`), timestamped **{snapshot['timestamp_utc']}**.

### Collection boundary

The legacy OpenSea shared storefront contract contains unrelated creators. The
manifest therefore includes only token IDs whose encoded creator is
`{CREATOR}`, whose encoded supply is one, and whose public metadata name matches
`Crypto AI Art #001` through `Crypto AI Art #556`. The completed manifest
contains {manifest_count} unique canonical numbers and {manifest_count} unique
token IDs.

### Ownership rule

For every manifest token, candidate addresses were obtained from Blockscout's
public ERC-1155 holder index, with the encoded creator always included to cover
OpenSea's historical lazy-mint balances. Each candidate was then checked by a
read-only `balanceOf(address,uint256)` call against the exact snapshot block.
Transfer history was consulted only when the initial candidate set did not
account for the encoded supply.

### Finality and independent verification

The snapshot block is the minimum finalized height reported by responding
no-key public Ethereum RPC endpoints. At least two endpoints had to agree on its
block hash. Every positive ERC-1155 balance was independently repeated through
a second agreeing RPC endpoint.

No OpenSea API key, Etherscan API key, wallet connection, signature, transaction
or gas payment was used.
"""


def build_snapshot(output_dir: Path) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    started_at = datetime.now(tz=timezone.utc)
    error_path = output_dir / "SNAPSHOT_ERROR.txt"
    try:
        manifest, manifest_diagnostics = _build_manifest()
        snapshot, quorum_urls, block_diagnostics = _select_snapshot_block()
        candidate_map, holder_diagnostics = _get_candidate_holders(manifest)
        holdings, holdings_diagnostics = _resolve_holdings(
            manifest, candidate_map, snapshot, quorum_urls
        )
        wallet_summary = _wallet_summary(holdings)
        manifest_path = output_dir / "genesis-manifest-v1.json"
        block_path = output_dir / "snapshot-block.json"
        holdings_json_path = output_dir / "snapshot-token-holdings.json"
        holdings_csv_path = output_dir / "snapshot-token-holdings.csv"
        wallets_json_path = output_dir / "snapshot-wallet-summary.json"
        wallets_csv_path = output_dir / "snapshot-wallet-summary.csv"
        methodology_path = output_dir / "methodology.md"
        script_path = output_dir / "snapshot-script.py"
        _write_json(
            manifest_path,
            {
                "schema": "montrealai.becoming.genesis-manifest.v1",
                "collection": "MONTREAL.AI",
                "chain_id": CHAIN_ID,
                "contract": CONTRACT,
                "creator": CREATOR,
                "item_count": len(manifest),
                "items": manifest,
            },
        )
        _write_json(block_path, snapshot)
        _write_json(
            holdings_json_path,
            {
                "schema": "montrealai.becoming.snapshot-holdings.v1",
                "snapshot": snapshot,
                "holding_row_count": len(holdings),
                "holdings": holdings,
            },
        )
        _write_csv(
            holdings_csv_path,
            holdings,
            [
                "canonical_number",
                "title",
                "chain_id",
                "contract",
                "token_id_decimal",
                "token_id_hex",
                "creator_index",
                "encoded_supply",
                "owner_address",
                "owner_ens",
                "owner_name",
                "owner_is_contract",
                "owner_candidate_source",
                "balance",
                "snapshot_block_number",
                "snapshot_block_hash",
                "snapshot_timestamp_utc",
            ],
        )
        _write_json(
            wallets_json_path,
            {
                "schema": "montrealai.becoming.snapshot-wallet-summary.v1",
                "snapshot": snapshot,
                "wallet_count": len(wallet_summary),
                "wallets": wallet_summary,
            },
        )
        _write_csv(
            wallets_csv_path,
            wallet_summary,
            [
                "rank",
                "wallet",
                "ens",
                "name",
                "is_contract",
                "is_creator_wallet",
                "number_of_distinct_genesis_tokens",
                "total_genesis_units",
                "canonical_numbers",
            ],
        )
        methodology_path.write_text(_methodology(snapshot, len(manifest)), encoding="utf-8")
        script_path.write_text(Path(__file__).read_text(encoding="utf-8"), encoding="utf-8")
        files_for_hashing = [
            manifest_path,
            block_path,
            holdings_json_path,
            holdings_csv_path,
            wallets_json_path,
            wallets_csv_path,
            methodology_path,
            script_path,
        ]
        file_hashes = {path.name: _sha256(path.read_bytes()) for path in files_for_hashing}
        audit = {
            "schema": "montrealai.becoming.snapshot-audit.v1",
            "status": "PASS",
            "started_at_utc": started_at.isoformat().replace("+00:00", "Z"),
            "completed_at_utc": datetime.now(tz=timezone.utc)
            .isoformat()
            .replace("+00:00", "Z"),
            "manifest": {
                "expected_items": TARGET_COUNT,
                "actual_items": len(manifest),
                "unique_canonical_numbers": len(
                    {row["canonical_number"] for row in manifest}
                ),
                "unique_token_ids": len({row["token_id_decimal"] for row in manifest}),
                "canonical_numbers_complete": {
                    row["canonical_number"] for row in manifest
                }
                == CANONICAL_NUMBERS,
                "diagnostics": manifest_diagnostics,
            },
            "snapshot": snapshot,
            "block_diagnostics": block_diagnostics,
            "holder_index_diagnostics": holder_diagnostics,
            "ownership": {
                "holding_rows": len(holdings),
                "wallet_count": len(wallet_summary),
                "total_genesis_units": sum(int(row["balance"]) for row in holdings),
                "tokens_with_positive_balance": len(
                    {row["token_id_decimal"] for row in holdings}
                ),
                "diagnostics": holdings_diagnostics,
            },
            "file_sha256": file_hashes,
        }
        if (
            len(manifest) != TARGET_COUNT
            or len({row["token_id_decimal"] for row in holdings}) != TARGET_COUNT
            or sum(int(row["balance"]) for row in holdings) != TARGET_COUNT
        ):
            raise SnapshotError("Final invariants failed")
        audit_path = output_dir / "audit-report.json"
        _write_json(audit_path, audit)
        files_for_hashing.append(audit_path)
        checksums_path = output_dir / "SHA256SUMS"
        checksums_path.write_text(
            "".join(
                f"{_sha256(path.read_bytes())}  {path.name}\n"
                for path in sorted(files_for_hashing)
            ),
            encoding="utf-8",
        )
        readme = f"""# MONTREAL.AI — BECOMING Ω: THE FINAL 444
## Complete Genesis ownership snapshot

- Snapshot block: `{snapshot['block_number']}`
- Block hash: `{snapshot['block_hash']}`
- UTC timestamp: `{snapshot['timestamp_utc']}`
- Montréal timestamp: `{snapshot['timestamp_montreal']}`
- Canonical Genesis token IDs: `{len(manifest)}`
- Positive token-holder rows: `{len(holdings)}`
- Distinct holder wallets: `{len(wallet_summary)}`
- Total accounted ERC-1155 units: `{sum(int(row['balance']) for row in holdings)}`
- Audit status: `PASS`

Start with `snapshot-wallet-summary.csv` for the holder ranking and
`snapshot-token-holdings.csv` for the authoritative token-by-token snapshot.
Verify every file with `SHA256SUMS`.
"""
        readme_path = output_dir / "README.md"
        readme_path.write_text(readme, encoding="utf-8")
        package_name = (
            "MONTREALAI_BECOMING_OMEGA_GENESIS_SNAPSHOT_"
            f"BLOCK_{snapshot['block_number']}.zip"
        )
        package_path = output_dir / package_name
        package_members = [
            path for path in output_dir.iterdir() if path.is_file() and path != package_path
        ]
        with zipfile.ZipFile(
            package_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9
        ) as archive:
            for path in sorted(package_members):
                archive.write(path, arcname=path.name)
        summary = {
            "status": "PASS",
            "snapshot_block": snapshot["block_number"],
            "snapshot_block_hash": snapshot["block_hash"],
            "snapshot_timestamp_utc": snapshot["timestamp_utc"],
            "manifest_items": len(manifest),
            "holding_rows": len(holdings),
            "wallet_count": len(wallet_summary),
            "total_units": sum(int(row["balance"]) for row in holdings),
            "package": package_name,
            "package_sha256": _sha256(package_path.read_bytes()),
        }
        _write_json(output_dir / "snapshot-summary.json", summary)
        if error_path.exists():
            error_path.unlink()
        return summary
    except Exception as exc:
        error_path.write_text(f"{type(exc).__name__}: {exc}\n", encoding="utf-8")
        raise
