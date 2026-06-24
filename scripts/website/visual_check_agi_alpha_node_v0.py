#!/usr/bin/env python3
"""Run Chromium interaction, responsive, and visual QA for AGI Alpha Node v0."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
from pathlib import Path
from typing import Any

RELEASE_TITLE = "GoalOS AGIALPHA Ascension AGI Alpha Node v0 ⚡️✨"


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def record(results: list[dict[str, Any]], label: str, condition: bool, detail: Any = "") -> None:
    results.append({"label": label, "status": "PASS" if condition else "FAIL", "detail": detail})


def overflow(page: Any) -> dict[str, Any]:
    return page.evaluate("""() => ({documentWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth, bodyWidth: document.body.scrollWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2})""")


def inline_release_page(site: Path, filename: str) -> str:
    html = (site / filename).read_text(encoding="utf-8")
    css = (site / "assets" / "agi-alpha-node-v0.css").read_text(encoding="utf-8")
    javascript = (site / "assets" / "agi-alpha-node-v0.js").read_text(encoding="utf-8").replace("</script", "<\\/script")
    html = re.sub(r'<meta\s+http-equiv="Content-Security-Policy"[^>]*>\s*', "", html, flags=re.IGNORECASE)
    html = re.sub(r'<link\s+[^>]*rel="stylesheet"[^>]*>\s*', "", html, flags=re.IGNORECASE)
    html = re.sub(r'<script\s+[^>]*src="[^"]+"[^>]*>\s*</script>\s*', "", html, flags=re.IGNORECASE)
    html = html.replace("</head>", f"<style data-qa-inline-styles>\n{css}\n</style>\n</head>", 1)
    return html.replace("</body>", f"<script>{javascript}</script>\n</body>", 1)


def inline_homepage(site: Path) -> str:
    html = (site / "index.html").read_text(encoding="utf-8")
    hrefs = re.findall(r'<link\s+[^>]*rel=[\'\"]stylesheet[\'\"][^>]*href=[\'\"]([^\'\"]+)', html, flags=re.IGNORECASE)
    css_parts = []
    for href in hrefs:
        if href.startswith(("http://", "https://", "//")):
            continue
        path = site / href.split("?", 1)[0]
        if path.is_file():
            css_parts.append(path.read_text(encoding="utf-8"))
    html = re.sub(r'<link\s+[^>]*rel=[\'\"]stylesheet[\'\"][^>]*>\s*', "", html, flags=re.IGNORECASE)
    html = re.sub(r'<script\s+[^>]*src=[\'\"][^\'\"]+[\'\"][^>]*>\s*</script>\s*', "", html, flags=re.IGNORECASE)
    combined_css = "\n".join(css_parts)
    return html.replace("</head>", f"<style data-qa-inline-styles>\n{combined_css}\n</style>\n</head>", 1)


def launch_browser(playwright: Any) -> Any:
    args = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
    executable = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE") or os.environ.get("CHROMIUM_PATH") or shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome")
    if executable:
        return playwright.chromium.launch(headless=True, executable_path=executable, args=args)
    return playwright.chromium.launch(headless=True, args=args)


def attach_diagnostics(page: Any, console_errors: list[str], external_requests: list[str], failed_requests: list[str]) -> None:
    page.on("console", lambda message: console_errors.append(f"{page.url}: {message.text}") if message.type == "error" else None)
    page.on("pageerror", lambda error: console_errors.append(f"{page.url}: {error}"))
    page.on("request", lambda request: external_requests.append(f"{request.method} {request.url}") if request.url.startswith(("http://", "https://", "ws://", "wss://")) else None)
    page.on("requestfailed", lambda request: failed_requests.append(f"{request.method} {request.url}: {request.failure}"))


def wait_ready(page: Any) -> None:
    page.wait_for_selector('html[data-aan-ready="true"]', timeout=15000)


def launch_cycle(page: Any) -> dict[str, Any]:
    page.locator("#aan-node-form").evaluate("form => form.requestSubmit()")
    page.wait_for_function("window.__AAN_STATE__ && !window.__AAN_STATE__.running", timeout=20000)
    return page.evaluate("() => JSON.parse(JSON.stringify(window.__AAN_STATE__))")


def screenshot_view(page: Any, selector: str, destination: Path) -> None:
    page.locator(selector).scroll_into_view_if_needed()
    page.wait_for_timeout(80)
    page.screenshot(path=str(destination), full_page=False)


def run(site: Path, output: Path) -> dict[str, Any]:
    try:
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        report = {"schema": "goalos.agi_alpha_node_v0.browser_qa.v2", "status": "FAIL", "checks_total": 1, "checks_passed": 0, "checks_failed": 1, "checks": [{"label": "playwright-import", "status": "FAIL", "detail": str(exc)}]}
        write_json(output / "browser-report.json", report)
        return report

    output.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, Any]] = []
    console_errors: list[str] = []
    external_requests: list[str] = []
    failed_requests: list[str] = []
    experience_html = inline_release_page(site, "agi-alpha-node-v0.html")
    architecture_html = inline_release_page(site, "agi-alpha-node-v0-architecture.html")
    ledger_html = inline_release_page(site, "agi-alpha-node-v0-proof-ledger.html")
    homepage_html = inline_homepage(site)

    with sync_playwright() as playwright:
        browser = launch_browser(playwright)
        try:
            context = browser.new_context(viewport={"width": 1600, "height": 1000}, device_scale_factor=1, reduced_motion="reduce", accept_downloads=True)
            page = context.new_page()
            page.set_default_timeout(15000)
            attach_diagnostics(page, console_errors, external_requests, failed_requests)

            page.set_content(experience_html, wait_until="domcontentloaded")
            wait_ready(page)
            record(results, "experience-load", True, page.title())
            record(results, "experience-title", page.title() == RELEASE_TITLE, page.title())
            record(results, "experience-hero-visible", page.locator("#aan-hero-title").is_visible(), page.locator("#aan-hero-title").inner_text())
            record(results, "experience-doctrine-visible", page.locator("#aan-doctrine-title").is_visible(), page.locator("#aan-doctrine-title").inner_text())
            record(results, "experience-five-hero-metrics", page.locator("#aan-hero-metrics > div").count() == 5, page.locator("#aan-hero-metrics > div").count())
            record(results, "experience-five-theses", page.locator("#aan-thesis-grid > article").count() == 5, page.locator("#aan-thesis-grid > article").count())
            record(results, "experience-ten-gates", page.locator(".aan-stage").count() == 10, page.locator(".aan-stage").count())
            record(results, "experience-twelve-peers", page.locator(".aan-peer-node").count() == 12, page.locator(".aan-peer-node").count())
            record(results, "experience-sixteen-artifacts", page.locator(".aan-artifact-card").count() == 16, page.locator(".aan-artifact-card").count())
            record(results, "experience-seven-validators", page.locator(".aan-validator").count() == 7, page.locator(".aan-validator").count())
            record(results, "experience-five-guardians", page.locator(".aan-guardian").count() == 5, page.locator(".aan-guardian").count())
            record(results, "experience-five-presets", page.locator("#aan-preset option").count() == 5, page.locator("#aan-preset option").count())
            record(results, "experience-five-work-classes", page.locator("#aan-work-class option").count() == 5, page.locator("#aan-work-class option").count())
            record(results, "experience-four-postures", page.locator("#aan-posture option").count() == 4, page.locator("#aan-posture option").count())
            record(results, "experience-three-risks", page.locator("#aan-risk option").count() == 3, page.locator("#aan-risk option").count())
            record(results, "experience-four-incidents", page.locator('input[name="incident"]').count() == 4, page.locator('input[name="incident"]').count())
            record(results, "experience-authority-none", page.locator("#aan-node-status .deny").inner_text() == "NONE GRANTED", page.locator("#aan-node-status .deny").inner_text())
            desktop_overflow = overflow(page)
            record(results, "experience-desktop-no-overflow", not desktop_overflow["overflow"], desktop_overflow)
            page.screenshot(path=str(output / "01-sovereign-citadel-hero-desktop.png"), full_page=False)
            record(results, "screenshot-hero-desktop", (output / "01-sovereign-citadel-hero-desktop.png").is_file(), "")

            first = launch_cycle(page)
            record(results, "runtime-terminal-human-review", first["terminal"] == "HUMAN_REVIEW_REQUIRED", first["terminal"])
            record(results, "runtime-state-label-human-review", page.locator("#aan-state-label").inner_text() == "HUMAN_REVIEW_REQUIRED", page.locator("#aan-state-label").inner_text())
            record(results, "runtime-nine-complete-one-active", page.locator(".aan-stage.is-complete").count() == 9 and page.locator(".aan-stage.is-active").count() == 1, {"complete": page.locator(".aan-stage.is-complete").count(), "active": page.locator(".aan-stage.is-active").count()})
            record(results, "runtime-primary-route-four", len(first["route"]["primary"]) == 4, [item["id"] for item in first["route"]["primary"]])
            record(results, "runtime-shadow-route-three", len(first["route"]["shadow"]) == 3, [item["id"] for item in first["route"]["shadow"]])
            record(results, "runtime-no-quarantine-default", len(first["route"]["quarantined"]) == 0, first["route"]["quarantined"])
            record(results, "runtime-peer-mesh-primary-four", page.locator(".aan-peer-node.primary").count() == 4, page.locator(".aan-peer-node.primary").count())
            record(results, "runtime-peer-mesh-shadow-three", page.locator(".aan-peer-node.shadow").count() == 3, page.locator(".aan-peer-node.shadow").count())
            record(results, "runtime-validator-six-pass", first["consensus"]["pass"] == 6 and page.locator(".aan-validator.is-pass").count() == 6, first["consensus"]["summary"])
            record(results, "runtime-validator-one-dissent", first["consensus"]["dissent"] == 1 and page.locator(".aan-validator.is-dissent").count() == 1, first["consensus"]["summary"])
            record(results, "runtime-validator-zero-reject", first["consensus"]["reject"] == 0, first["consensus"]["summary"])
            record(results, "runtime-guardian-no-veto", page.locator(".aan-guardian.is-veto").count() == 0, page.locator("#aan-guardian-label").inner_text())
            record(results, "runtime-sixteen-sealed", len(first["chain"]) == 16 and page.locator(".aan-artifact-card.is-sealed").count() == 16, {"runtime": len(first["chain"]), "dom": page.locator(".aan-artifact-card.is-sealed").count()})
            record(results, "runtime-chain-status-sealed", page.locator("#aan-chain-status").inner_text() == "SEALED", page.locator("#aan-chain-status").inner_text())
            record(results, "runtime-chain-head-present", len(first["chain"][-1]["commitment"]) == 64, first["chain"][-1]["commitment"])
            record(results, "runtime-docket-schema", first["docket"]["schema"] == "goalos.agi_alpha_node_v0.node_evidence_docket.v2", first["docket"]["schema"])
            record(results, "runtime-docket-external-actions-zero", first["docket"]["authority"]["external_actions"] == 0, first["docket"]["authority"])
            record(results, "runtime-docket-factual-not-certified", first["docket"]["authority"]["factual_correctness"] == "NOT_CERTIFIED", first["docket"]["authority"])
            record(results, "runtime-exports-enabled", all(not page.locator(f"#{item}").is_disabled() for item in ["aan-download-json", "aan-download-md", "aan-copy-summary"]), "")
            record(results, "runtime-events-present", len(first["logs"]) >= 12, len(first["logs"]))
            screenshot_view(page, "#node-theatre", output / "02-sovereign-node-theatre-desktop.png")
            screenshot_view(page, "#proof-chain", output / "03-sixteen-artifact-proof-chain-desktop.png")
            screenshot_view(page, "#consensus", output / "04-validator-guardian-council-desktop.png")
            for filename in ["02-sovereign-node-theatre-desktop.png", "03-sixteen-artifact-proof-chain-desktop.png", "04-validator-guardian-council-desktop.png"]:
                record(results, f"screenshot:{filename}", (output / filename).is_file(), "")

            with page.expect_download() as json_download_info:
                page.locator("#aan-download-json").click()
            json_download = json_download_info.value
            json_path = output / "runtime-evidence-docket.json"
            json_download.save_as(str(json_path))
            downloaded_docket = json.loads(json_path.read_text(encoding="utf-8"))
            record(results, "runtime-json-download", downloaded_docket.get("schema") == "goalos.agi_alpha_node_v0.node_evidence_docket.v2" and downloaded_docket.get("authority", {}).get("external_actions") == 0, json_download.suggested_filename)
            with page.expect_download() as md_download_info:
                page.locator("#aan-download-md").click()
            md_download = md_download_info.value
            md_path = output / "runtime-executive-review-brief.md"
            md_download.save_as(str(md_path))
            brief = md_path.read_text(encoding="utf-8")
            record(results, "runtime-brief-download", "HUMAN_REVIEW_REQUIRED" in brief and "External actions: 0" in brief and "Factual correctness: NOT CERTIFIED" in brief, md_download.suggested_filename)

            fingerprint = {"seed": first["seed"], "route": first["route"]["route_id"], "chain": first["chain"][-1]["commitment"], "receipt": first["receipt"]["work_unit_id"]}
            page.locator("#aan-reset").click()
            second = launch_cycle(page)
            second_fingerprint = {"seed": second["seed"], "route": second["route"]["route_id"], "chain": second["chain"][-1]["commitment"], "receipt": second["receipt"]["work_unit_id"]}
            record(results, "runtime-deterministic-replay", fingerprint == second_fingerprint, {"first": fingerprint, "second": second_fingerprint})
            page.locator('button[data-view="technical"]').click()
            record(results, "runtime-technical-view", page.locator("body").get_attribute("data-view") == "technical", page.locator("body").get_attribute("data-view"))
            record(results, "runtime-technical-decision-trace", "Terminal state:" in page.locator("#aan-decision-copy").inner_text(), page.locator("#aan-decision-copy").inner_text())

            page.locator("#aan-reset").click()
            page.locator("#aan-incident-identity-drift").evaluate("node => { node.checked = true; node.dispatchEvent(new Event(\'change\', {bubbles:true})); }")
            held = launch_cycle(page)
            record(results, "incident-terminal-safe-hold", held["terminal"] == "SAFE_HOLD", held["terminal"])
            record(results, "incident-quarantines-peer", len(held["route"]["quarantined"]) == 1 and page.locator(".aan-peer-node.quarantine").count() == 1, held["route"]["quarantined"])
            record(results, "incident-validator-reject", held["consensus"]["reject"] >= 1 and page.locator(".aan-validator.is-reject").count() >= 1, held["consensus"]["summary"])
            record(results, "incident-guardian-veto", page.locator(".aan-guardian.is-veto").count() >= 1, page.locator("#aan-guardian-label").inner_text())
            record(results, "incident-evidence-still-sealed", len(held["chain"]) == 16 and held["docket"]["authority"]["external_actions"] == 0, {"chain": len(held["chain"]), "authority": held["docket"]["authority"]})
            screenshot_view(page, "#node-theatre", output / "05-adversarial-safe-hold-desktop.png")
            record(results, "screenshot-safe-hold", (output / "05-adversarial-safe-hold-desktop.png").is_file(), "")

            page.set_content(architecture_html, wait_until="domcontentloaded")
            wait_ready(page)
            page.evaluate("window.scrollTo(0, 0)")
            record(results, "architecture-load", page.title() == "AGI Alpha Node v0 — Constitutional Architecture", page.title())
            record(results, "architecture-ten-planes", page.locator("#aan-stack-diagram > article").count() == 10, page.locator("#aan-stack-diagram > article").count())
            record(results, "architecture-ten-gates", page.locator("#aan-arch-pipeline > li").count() == 10, page.locator("#aan-arch-pipeline > li").count())
            record(results, "architecture-ten-translations", page.locator("#aan-translation-grid > article").count() == 10, page.locator("#aan-translation-grid > article").count())
            record(results, "architecture-fifteen-fingerprints", page.locator("#aan-lineage-table > tr").count() == 15, page.locator("#aan-lineage-table > tr").count())
            record(results, "architecture-eight-threats", page.locator("#aan-threat-grid > article").count() == 8, page.locator("#aan-threat-grid > article").count())
            record(results, "architecture-seven-principles", page.locator("#aan-principle-grid > article").count() == 7, page.locator("#aan-principle-grid > article").count())
            record(results, "architecture-six-mainnet-cards", page.locator("#aan-mainnet-grid > article").count() == 6, page.locator("#aan-mainnet-grid > article").count())
            record(results, "architecture-seven-boundaries", page.locator("#aan-boundary-list > li").count() == 7, page.locator("#aan-boundary-list > li").count())
            lineage_root = page.locator("#aan-lineage-root").inner_text()
            record(results, "architecture-lineage-root", lineage_root.startswith("root ") and len(lineage_root.split()[-1]) == 64, lineage_root)
            arch_overflow = overflow(page)
            record(results, "architecture-desktop-no-overflow", not arch_overflow["overflow"], arch_overflow)
            page.screenshot(path=str(output / "06-constitutional-architecture-hero-desktop.png"), full_page=False)
            screenshot_view(page, "#lineage", output / "07-traceable-lineage-desktop.png")

            page.set_content(ledger_html, wait_until="domcontentloaded")
            wait_ready(page)
            page.evaluate("window.scrollTo(0, 0)")
            record(results, "ledger-load", page.title() == "AGI Alpha Node v0 — Proof Ledger", page.title())
            record(results, "ledger-sixteen-catalog-items", page.locator("#aan-ledger-catalog > article").count() == 16, page.locator("#aan-ledger-catalog > article").count())
            record(results, "ledger-six-review-questions", page.locator(".aan-review-checklist > article").count() == 6, page.locator(".aan-review-checklist > article").count())
            record(results, "ledger-five-sample-facts", page.locator("#aan-sample-summary > div").count() == 5, page.locator("#aan-sample-summary > div").count())
            record(results, "ledger-sixteen-sample-chain", page.locator("#aan-sample-chain > div").count() == 16, page.locator("#aan-sample-chain > div").count())
            sample_text = page.locator("#aan-sample-json").inner_text()
            sample_json = json.loads(sample_text)
            record(results, "ledger-sample-schema", sample_json.get("schema") == "goalos.agi_alpha_node_v0.node_evidence_docket.v2", sample_json.get("schema"))
            record(results, "ledger-final-human-review", page.locator(".aan-ledger-final > span").inner_text() == "HUMAN_REVIEW_REQUIRED", page.locator(".aan-ledger-final > span").inner_text())
            ledger_overflow = overflow(page)
            record(results, "ledger-desktop-no-overflow", not ledger_overflow["overflow"], ledger_overflow)
            page.screenshot(path=str(output / "08-proof-ledger-hero-desktop.png"), full_page=False)
            screenshot_view(page, "#sample", output / "09-sample-evidence-docket-desktop.png")

            page.set_content(homepage_html, wait_until="domcontentloaded")
            gateway = page.locator(".aan-home-gateway")
            gateway.scroll_into_view_if_needed()
            record(results, "homepage-gateway-once", gateway.count() == 1 and gateway.is_visible(), gateway.count())
            record(results, "homepage-gateway-six-doctrines", page.locator(".aan-home-gateway-doctrine span").count() == 6, page.locator(".aan-home-gateway-doctrine span").count())
            record(results, "homepage-gateway-three-links", all(page.locator(f'a[href="{name}"]').count() >= 1 for name in ["agi-alpha-node-v0.html", "agi-alpha-node-v0-architecture.html", "agi-alpha-node-v0-proof-ledger.html"]), "")
            record(results, "homepage-gateway-copy", "One node. Many minds. Zero unearned authority." in gateway.inner_text(), gateway.inner_text()[:200])
            home_overflow = overflow(page)
            record(results, "homepage-desktop-no-overflow", not home_overflow["overflow"], home_overflow)
            gateway.screenshot(path=str(output / "10-main-website-sovereign-gateway-desktop.png"))

            page.set_viewport_size({"width": 1024, "height": 1366})
            page.set_content(experience_html, wait_until="domcontentloaded")
            wait_ready(page)
            page.evaluate("window.scrollTo(0, 0)")
            tablet_overflow = overflow(page)
            record(results, "experience-tablet-no-overflow", not tablet_overflow["overflow"], tablet_overflow)
            record(results, "experience-tablet-form-visible", page.locator("#aan-node-form").is_visible(), "")
            page.screenshot(path=str(output / "11-sovereign-citadel-tablet.png"), full_page=False)

            page.set_viewport_size({"width": 390, "height": 844})
            page.set_content(experience_html, wait_until="domcontentloaded")
            wait_ready(page)
            page.evaluate("window.scrollTo(0, 0)")
            mobile_overflow = overflow(page)
            record(results, "experience-mobile-no-overflow", not mobile_overflow["overflow"], mobile_overflow)
            record(results, "experience-mobile-hero-visible", page.locator("#aan-hero-title").is_visible(), "")
            page.locator("#aan-nav-toggle").click()
            record(results, "experience-mobile-nav-opens", "is-open" in (page.locator("#aan-nav").get_attribute("class") or ""), page.locator("#aan-nav").get_attribute("class"))
            page.locator("#aan-nav-toggle").click()
            page.screenshot(path=str(output / "12-sovereign-citadel-mobile-hero.png"), full_page=False)
            mobile_state = launch_cycle(page)
            record(results, "experience-mobile-cycle-human-review", mobile_state["terminal"] == "HUMAN_REVIEW_REQUIRED", mobile_state["terminal"])
            record(results, "experience-mobile-sixteen-artifacts", len(mobile_state["chain"]) == 16, len(mobile_state["chain"]))
            screenshot_view(page, "#node-theatre", output / "13-sovereign-node-theatre-mobile.png")
            mobile_runtime_overflow = overflow(page)
            record(results, "experience-mobile-runtime-no-overflow", not mobile_runtime_overflow["overflow"], mobile_runtime_overflow)

            page.set_content(architecture_html, wait_until="domcontentloaded")
            wait_ready(page)
            mobile_arch_overflow = overflow(page)
            record(results, "architecture-mobile-no-overflow", not mobile_arch_overflow["overflow"], mobile_arch_overflow)
            page.set_content(ledger_html, wait_until="domcontentloaded")
            wait_ready(page)
            mobile_ledger_overflow = overflow(page)
            record(results, "ledger-mobile-no-overflow", not mobile_ledger_overflow["overflow"], mobile_ledger_overflow)
            context.close()
        except PlaywrightTimeoutError as exc:
            record(results, "browser-timeout", False, str(exc))
        except Exception as exc:
            record(results, "browser-unexpected-error", False, f"{type(exc).__name__}: {exc}")
        finally:
            browser.close()

    record(results, "browser-console-clean", not console_errors, console_errors)
    record(results, "browser-external-network-zero", not external_requests, external_requests)
    record(results, "browser-failed-requests-zero", not failed_requests, failed_requests)
    failed = [item for item in results if item["status"] != "PASS"]
    report = {
        "schema": "goalos.agi_alpha_node_v0.browser_qa.v2",
        "release_title": RELEASE_TITLE,
        "status": "PASS" if not failed else "FAIL",
        "checks_total": len(results),
        "checks_passed": len(results) - len(failed),
        "checks_failed": len(failed),
        "checks": results,
        "screenshots": sorted(path.name for path in output.glob("*.png")),
        "downloads": sorted(path.name for path in output.glob("runtime-*")),
        "qa_mode": "inline-generated-release-desktop-tablet-mobile-determinism-incident-downloads",
    }
    write_json(output / "browser-report.json", report)
    return report


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", type=Path, default=root / "site")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    output = args.output or args.site / "qa" / "agi-alpha-node-v0"
    report = run(args.site.resolve(), output.resolve())
    print(json.dumps({"status": report["status"], "checks_total": report["checks_total"], "checks_passed": report["checks_passed"], "checks_failed": report["checks_failed"], "screenshots": len(report["screenshots"]), "output": str(output)}, indent=2))
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
