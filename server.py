print("\n\n🔥🔥🔥 [최종 수정본 실행됨: 중복 포장지 제거] 🔥🔥🔥\n\n")

import hashlib
import hmac
import base64
import requests
import json
import time
import sys
import os
import webbrowser
import uuid
import csv
import re
import urllib.parse 
from fastapi import FastAPI, HTTPException, Request, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

# [안전장치] 출력 인코딩
try:
    if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

if sys.stdout is None: sys.stdout = open(os.devnull, "w")
if sys.stderr is None: sys.stderr = open(os.devnull, "w")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_URL = "https://api.searchad.naver.com"

# --- Models ---
class AdGroupCreateItem(BaseModel):
    nccCampaignId: str
    name: str

class AdCreateItem(BaseModel):
    adGroupId: str
    headline: str
    description: str
    pcUrl: str
    mobileUrl: str

class ExtensionCreateItem(BaseModel):
    adGroupId: str
    type: str 
    businessChannelId: Optional[str] = None
    attributes: Optional[Dict[str, Any]] = None 
    adExtension: Optional[Any] = None

class StatusUpdate(BaseModel):
    status: str 

class BulkBidItem(BaseModel):
    keywordId: str
    adGroupId: str 
    bidAmt: int

class KeywordCreateItem(BaseModel):
    adGroupId: str
    keyword: str
    bidAmt: Optional[int] = None

class LogItem(BaseModel):
    time: str
    keyword: str
    oldBid: int
    newBid: int
    reason: str

class SmartExpandItem(BaseModel):
    sourceGroupId: str
    keywords: List[str]
    bidAmt: Optional[int] = None
    businessChannelId: str

class CloneAdsItem(BaseModel):
    sourceGroupId: str
    targetGroupId: str

# --- Core Helpers ---
def generate_signature(timestamp, method, uri, secret_key):
    message = f"{timestamp}.{method}.{uri}"
    hash = hmac.new(bytes(secret_key, "utf-8"), bytes(message, "utf-8"), hashlib.sha256)
    return base64.b64encode(hash.digest()).decode()

def get_header(method, uri, api_key, secret_key, customer_id):
    timestamp = str(int(time.time() * 1000))
    clean_uri = uri.split("?")[0]
    signature = generate_signature(timestamp, method, clean_uri, secret_key)
    return {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Timestamp": timestamp,
        "X-API-KEY": api_key,
        "X-Customer": str(customer_id),
        "X-Signature": signature
    }

def call_api_sync(args):
    if len(args) == 5:
        method, uri, params, body, auth = args
    else:
        method, uri, params, body, auth = args[0], args[1], None, args[2], args[3]

    if not auth or not auth.get('api_key'):
        return {"error": "Missing authentication data"}

    clean_uri = uri.split("?")[0]
    headers = get_header(method, clean_uri, auth['api_key'], auth['secret_key'], auth['customer_id'])
    url = BASE_URL + clean_uri
    
    try:
        if method in ["POST", "PUT", "DELETE"]:
            if params:
                query_string = urllib.parse.urlencode(params)
                url = f"{url}?{query_string}"
            resp = requests.request(method, url, json=body, headers=headers)
        else:
            resp = requests.get(url, params=params, headers=headers)
            
        if resp.status_code == 200: 
            return resp.json()
        
        if resp.status_code >= 400:
            print(f"[API Error] [{resp.status_code}]: {url}")
            if body:
                 body_str = str(body)
                 if len(body_str) > 200: body_str = body_str[:200] + "..."
                 print(f"   -> Body: {body_str}")
            print(f"   -> Response: {resp.text[:300]}")
        return None

    except Exception as e: 
        print(f"[Network Error]: {e}")
        return None

# [통계 기간 설정]
def fetch_stats(ids_list: list, auth: dict, since: str = None, until: str = None, device: str = None):
    if not ids_list or not auth: return {}
    stats_map = {}
    chunk_size = 50
    
    if not since or not until:
        today = datetime.now()
        today_str = today.strftime("%Y-%m-%d")
        time_range = {"since": today_str, "until": today_str}
    else:
        time_range = {"since": since, "until": until}
    
    for i in range(0, len(ids_list), chunk_size):
        chunk = ids_list[i:i + chunk_size]
        ids_str = ",".join(chunk)
        params = {
            'ids': ids_str,
            'fields': '["impCnt","clkCnt","salesAmt","ccnt","avgRnk","convAmt"]', 
            'timeRange': json.dumps(time_range) 
        }
        
        args = ("GET", "/stats", params, None, auth)
        res = call_api_sync(args)
        if res and 'data' in res:
            for item in res['data']: stats_map[item['id']] = item
        time.sleep(0.05)
    return stats_map

def safe_int(value):
    try:
        return int(value)
    except (ValueError, TypeError):
        return 0

def format_stats(stat_item):
    if not stat_item: 
        return {"impressions": 0, "clicks": 0, "cost": 0, "ctr": 0, "cpc": 0, "conversions": 0, "cpa": 0, "roas": 0, "convAmt": 0}
    
    imp = safe_int(stat_item.get('impCnt', 0))
    clk = safe_int(stat_item.get('clkCnt', 0))
    cost = safe_int(stat_item.get('salesAmt', 0))
    conv = safe_int(stat_item.get('ccnt', 0))
    conv_amt = safe_int(stat_item.get('convAmt', 0))
    
    ctr = (clk / imp * 100) if imp > 0 else 0
    cpc = (cost / clk) if clk > 0 else 0
    cpa = (cost / conv) if conv > 0 else 0
    roas = (conv_amt / cost * 100) if cost > 0 else 0

    return {
        "impressions": imp,
        "clicks": clk,
        "cost": cost,
        "ctr": round(ctr, 2),
        "cpc": round(cpc, 0),
        "conversions": conv,
        "cpa": round(cpa, 0),
        "convAmt": conv_amt,
        "roas": round(roas, 0)
    }

def normalize_type(raw_type: str) -> str:
    return raw_type.upper()

def safe_json_parse(data):
    if data is None: return {}
    if isinstance(data, dict): return data
    if isinstance(data, list): return data
    if isinstance(data, str):
        try:
            return json.loads(data)
        except:
            return {}
    return {}

def convert_ads(ad_list):
    result = []
    for ad in ad_list:
        details = safe_json_parse(ad.get('ad'))
        result.append({
            "nccAdId": ad['nccAdId'], 
            "nccAdGroupId": ad['nccAdgroupId'], 
            "type": ad.get('type', 'TEXT'),
            "headline": details.get('headline', '-'), 
            "description": details.get('description', '-'),
            "pcUrl": details.get('pc', {}).get('final', ''), 
            "mobileUrl": details.get('mobile', {}).get('final', ''),
            "status": ad.get('userLock', False)
        })
    return result

def format_extension(ext):
    ext['extension'] = safe_json_parse(ext.get('adExtension'))
    return ext

VISIT_LOG_FILE = "visits.json"

def load_visit_logs():
    if os.path.exists(VISIT_LOG_FILE):
        try:
            with open(VISIT_LOG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except: return []
    return []

def save_visit_logs(logs):
    with open(VISIT_LOG_FILE, "w", encoding="utf-8") as f:
        json.dump(logs[:1000], f, ensure_ascii=False, indent=2)

@app.post("/api/track/visit")
async def track_visit(request: Request):
    try:
        body = await request.json()
        client_ip = request.headers.get("x-forwarded-for") or request.client.host
        url = body.get("url", "")
        referrer = body.get("referrer", "")
        
        visit_type = "DIRECT"
        keyword = "-"
        
        if "n_keyword" in url or "n_query" in url:
            visit_type = "AD"
            if "n_keyword=" in url:
                keyword = url.split("n_keyword=")[1].split("&")[0]
            elif "n_query=" in url:
                keyword = url.split("n_query=")[1].split("&")[0]
            import urllib.parse
            keyword = urllib.parse.unquote(keyword)
            
        elif "naver.com" in referrer or "google.com" in referrer:
            visit_type = "ORGANIC"
        
        log_entry = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "ip": client_ip,
            "type": visit_type,
            "keyword": keyword,
            "url": url,
            "referrer": referrer
        }
        
        logs = load_visit_logs()
        logs.insert(0, log_entry)
        save_visit_logs(logs)
        return {"success": True}
    except Exception as e:
        print(f"[Tracking Error]: {e}")
        return {"success": False}

@app.get("/api/track/logs")
def get_visit_logs():
    return load_visit_logs()

@app.post("/api/log/save")
def save_bid_logs(items: List[LogItem]):
    try:
        if not os.path.exists("logs"): os.makedirs("logs")
        today_str = datetime.now().strftime("%Y-%m-%d")
        filename = f"logs/log_{today_str}.csv"
        file_exists = os.path.isfile(filename)
        
        with open(filename, mode='a', newline='', encoding='utf-8-sig') as file:
            writer = csv.writer(file)
            if not file_exists:
                writer.writerow(["시간", "키워드", "기존입찰가", "변경입찰가", "변동폭", "변경사유"])
            
            for item in items:
                diff = item.newBid - item.oldBid
                writer.writerow([item.time, item.keyword, item.oldBid, item.newBid, diff, item.reason])
                
        return {"status": "success", "count": len(items)}
    except Exception as e:
        print(f"[Log save error]: {e}")
        return {"status": "error", "message": str(e)}

# --- Endpoints ---

@app.get("/api/campaigns")
def get_campaigns(
    x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...),
    since: Optional[str] = None, until: Optional[str] = None
):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    camps = call_api_sync(("GET", "/ncc/campaigns", None, None, auth))
    if not camps: return []
    ids = [c['nccCampaignId'] for c in camps]
    stats_map = fetch_stats(ids, auth, since, until)
    return [{
        "nccCampaignId": c['nccCampaignId'], "name": c['name'], "campaignType": c.get('campaignType', 'WEB_SITE'),
        "status": c.get('status', 'UNKNOWN'), "stats": format_stats(stats_map.get(c['nccCampaignId']))
    } for c in camps]

@app.get("/api/adgroups")
def get_adgroups(campaign_id: str = Query(...), x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    groups = call_api_sync(("GET", "/ncc/adgroups", {'nccCampaignId': campaign_id}, None, auth))
    if not groups: return []
    ids = [g['nccAdgroupId'] for g in groups]
    stats_map = fetch_stats(ids, auth)
    return [{
        "nccAdGroupId": g['nccAdgroupId'], "nccCampaignId": g['nccCampaignId'], "name": g['name'],
        "bidAmt": g.get('bidAmt', 0), "status": g.get('status', 'UNKNOWN'), "stats": format_stats(stats_map.get(g['nccAdgroupId']))
    } for g in groups]

@app.post("/api/adgroups")
def create_adgroup(
    item: AdGroupCreateItem, 
    x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    body = {"nccCampaignId": item.nccCampaignId, "name": item.name}
    res = call_api_sync(("POST", "/ncc/adgroups", None, body, auth))
    
    if res and isinstance(res, list) and len(res) > 0:
        return res[0] 
    elif res and 'nccAdgroupId' in res:
        return res
    
    raise HTTPException(status_code=400, detail="그룹 생성 실패")

@app.get("/api/keywords")
def get_keywords(
    adgroup_id: str = Query(...), 
    device: Optional[str] = Query(None),
    target_rank: int = Query(3), 
    x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)):
    
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    adgroup = call_api_sync(("GET", f"/ncc/adgroups/{adgroup_id}", None, None, auth))
    group_bid = adgroup.get('bidAmt', 0) if adgroup else 0
    kwd_list = call_api_sync(("GET", "/ncc/keywords", {'nccAdgroupId': adgroup_id}, None, auth))
    if not kwd_list: return []
    
    ids_for_est = [k['nccKeywordId'] for k in kwd_list]
    estimates_map = {}
    api_device = device if device in ['PC', 'MOBILE'] else 'MOBILE'

    chunk_size = 50 
    for i in range(0, len(ids_for_est), chunk_size):
        chunk = ids_for_est[i:i + chunk_size]
        req_items = [{"key": kw_id, "position": target_rank} for kw_id in chunk]
        body = { "device": api_device, "items": req_items }
        
        args = ("POST", "/estimate/average-position-bid/id", None, body, auth)
        res = call_api_sync(args)
        
        if res and 'estimate' in res:
            print(f"[API SUCCESS] 예상가 {len(res['estimate'])}개 수신 완료.")
            for item in res['estimate']:
                k_id = item.get('nccKeywordId') or item.get('keywordId') or item.get('key')
                bid_val = item.get('bid', 0)
                if k_id: estimates_map[k_id] = [{"rank": target_rank, "bid": bid_val}]
        time.sleep(0.05)

    stats_map = fetch_stats(ids_for_est, auth)
    result = []
    for k in kwd_list:
        stat = stats_map.get(k['nccKeywordId'])
        rank_est = stat.get('avgRnk', 0) if stat else 0
        est_data = estimates_map.get(k['nccKeywordId'], [])
        result.append({
            "nccKeywordId": k['nccKeywordId'], "nccAdGroupId": k['nccAdgroupId'], "keyword": k['keyword'],
            "bidAmt": group_bid if k.get('useGroupBidAmt', False) else k['bidAmt'],
            "originalBid": k['bidAmt'], "useGroupBidAmt": k.get('useGroupBidAmt', False),
            "status": k['status'], "managedStatus": "ON" if k['status'] == 'ELIGIBLE' else "OFF",
            "stats": format_stats(stat), 
            "currentRankEstimate": rank_est,
            "bidEstimates": est_data
        })
    return result

@app.get("/api/ads")
def get_ads(campaign_id: Optional[str] = None, adgroup_id: Optional[str] = None, x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    
    if adgroup_id:
        ads = call_api_sync(("GET", "/ncc/ads", {'nccAdgroupId': adgroup_id}, None, auth))
        return convert_ads(ads) if ads else []

    if campaign_id:
        groups = call_api_sync(("GET", "/ncc/adgroups", {'nccCampaignId': campaign_id}, None, auth))
        if not groups: return []
        all_ads = []
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(call_api_sync, ("GET", "/ncc/ads", {'nccAdgroupId': g['nccAdgroupId']}, None, auth)) for g in groups]
            for f in as_completed(futures):
                res = f.result()
                if res: all_ads.extend(res)
        return convert_ads(all_ads)
    return []

# [수정됨] 소재 생성 함수 (자동으로 줄바꿈/공백 제거 기능 추가)
@app.post("/api/ads")
def create_ad(item: AdCreateItem, x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    
    # [핵심 수정] 입력된 값 앞뒤의 공백과 줄바꿈(\n)을 자동으로 제거(.strip())
    ad_content = {
        "headline": item.headline.strip(), 
        "description": item.description.strip(),
        "pc": { "final": item.pcUrl.strip() },
        "mobile": { "final": item.mobileUrl.strip() }
    }
    
    body = {
        "type": "TEXT_45",
        "nccAdgroupId": item.adGroupId, 
        "ad": ad_content 
    }
    
    res = call_api_sync(("POST", "/ncc/ads", None, body, auth))
    if res: return res
    print(f"[FAIL] Ad Body: {body}")
    raise HTTPException(status_code=400, detail="Failed to create ad")

# [소재 복제 - TEXT_45 대응]
@app.post("/api/ads/clone")
def clone_ads(item: CloneAdsItem, x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    
    source_ads = call_api_sync(("GET", "/ncc/ads", {'nccAdgroupId': item.sourceGroupId}, None, auth))
    if not source_ads:
        return {"status": "success", "message": "복제할 소재가 없습니다.", "count": 0}

    success_count = 0
    fail_count = 0

    for ad in source_ads:
        ad_content = ad.get('ad')
        if isinstance(ad_content, str):
            try:
                ad_content = json.loads(ad_content)
            except:
                pass
        
        body = {
            "type": "TEXT_45",
            "nccAdgroupId": item.targetGroupId, 
            "ad": ad_content 
        }
        
        res = call_api_sync(("POST", "/ncc/ads", None, body, auth))
        if res:
            success_count += 1
        else:
            fail_count += 1

    return {"status": "success", "count": success_count, "failed": fail_count}

@app.delete("/api/ads/{ad_id}")
def delete_ad(ad_id: str, x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    res = call_api_sync(("DELETE", f"/ncc/ads/{ad_id}", None, None, auth))
    if res is not None: return {"success": True}
    raise HTTPException(status_code=400, detail="Failed to delete ad")

@app.get("/api/channels")
def get_channels(x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    
    channels = call_api_sync(("GET", "/ncc/channels", None, None, auth))
    if not channels: return []
    
    result = []
    for ch in channels:
        raw_type = ch.get('channelTp', 'UNKNOWN')
        ch_name = ch.get('name') or ch.get('businessChannelName') or ch.get('channelKey') or "이름 없음"

        result.append({
            "nccBusinessChannelId": ch['nccBusinessChannelId'],
            "name": ch_name,
            "channelKey": ch.get('channelKey', ''),
            "type": raw_type 
        })
    return result

@app.get("/api/extensions")
def get_extensions(
    campaign_id: Optional[str] = Query(None), 
    adgroup_id: Optional[str] = Query(None),
    x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)):
    
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    all_exts = []
    
    if adgroup_id:
        res = call_api_sync(("GET", "/ncc/ad-extensions", {'ownerId': adgroup_id}, None, auth))
        if res:
            for ext in res:
                all_exts.append(format_extension(ext))
        return all_exts

    if campaign_id:
        groups = call_api_sync(("GET", "/ncc/adgroups", {'nccCampaignId': campaign_id}, None, auth))
        if not groups: return []
        
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(call_api_sync, ("GET", "/ncc/ad-extensions", {'ownerId': g['nccAdgroupId']}, None, auth)) for g in groups]
            for f in as_completed(futures):
                res = f.result()
                if res:
                    for ext in res:
                        all_exts.append(format_extension(ext))
        return all_exts
    
    return []

# [▼▼▼ 수정됨: create_extension (중복 포장 제거 및 디버깅) ▼▼▼]
# [수정됨] PHONE 오류 해결 및 중복 포장 제거 적용된 create_extension
@app.post("/api/extensions")
def create_extension(item: ExtensionCreateItem, x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}

    print(f"\n🔥🔥 [create_extension] 타입: {item.type} 🔥🔥")
    
    incoming_data = item.adExtension or item.attributes
    
    body = {
        "ownerId": item.adGroupId,
        "type": item.type.upper()
    }
    if item.businessChannelId:
        body["pcChannelId"] = item.businessChannelId
        body["mobileChannelId"] = item.businessChannelId

    # 데이터 처리 및 할당 로직
    real_data = None
    if incoming_data:
        # [핵심 1] 프론트엔드 포장지 제거 (Unwrapping)
        if isinstance(incoming_data, dict) and "adExtension" in incoming_data:
            print(" >> [처리] 프론트엔드 포장지 제거 (Unwrapping adExtension)")
            real_data = incoming_data["adExtension"]
        else:
            real_data = incoming_data

    # [핵심 2] PHONE, PLACE, LOCATION은 adExtension 필드를 아예 보내면 안 됨 (4003 에러 방지)
    if item.type.upper() not in ["PHONE", "PLACE", "LOCATION"]:
        if real_data:
            # WEBSITE_INFO 동의 처리
            if isinstance(real_data, dict) and item.type.upper() == "WEBSITE_INFO":
                 real_data["agree"] = True
            body["adExtension"] = real_data
    else:
        print(f" >> [알림] {item.type} 타입은 adExtension 필드를 전송하지 않습니다. (비즈채널 ID만 사용)")

    uri = "/ncc/ad-extensions"
    
    res = call_api_sync(("POST", uri, None, body, auth))
    if res: return res

    print(f"[FAIL] Extension Create Failed. Body: {body}")
    raise HTTPException(status_code=400, detail="Failed to create extension")

@app.post("/api/extensions/clone/{new_group_id}")
def clone_extensions(source_group_id: str, new_group_id: str, x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    
    uri = "/ncc/ad-extensions"
    res = call_api_sync(("GET", uri, {'ownerId': source_group_id}, {}, auth))

    if not res:
        return {"status": "completed", "success": 0, "failed": 0}

    success_count = 0
    fail_count = 0
    
    IMPOSSIBLE_TYPES = [
        "SHOPPING_EXTRA", "CATALOG_EXTRA", "CATALOG_EVENT", "CATALOG_PURCHASE_CONDITION",
        "SHOPPING_BRAND_BROADCAST", "SHOPPING_BRAND_EVENT", "PLACE_SMART_ORDER", "NAVER_BLOG_REVIEW",
        "IMAGE_SUB_LINKS", 
        "CATALOG_IMAGE", "NAVER_TV_VIDEO",
        "SHOPPING_BRAND_IMAGE", "SHOPPING_BRAND_VIDEO"
    ]
    
    for ext in res:
        ext_type = ext.get("type", "UNKNOWN")
        
        if ext_type in IMPOSSIBLE_TYPES:
            print(f"⚠️ [스킵] {ext_type}는 API 생성 불가")
            continue

        try:
            new_extension = {
                "ownerId": new_group_id,
                "type": ext_type,
                "pcChannelId": ext.get("pcChannelId"),
                "mobileChannelId": ext.get("mobileChannelId")
            }
            
            if "adExtension" in ext:
                new_extension["adExtension"] = ext["adExtension"]
            
            create_res = call_api_sync(("POST", "/ncc/ad-extensions", None, new_extension, auth))
            if create_res:
                success_count += 1
            else:
                fail_count += 1
                
        except Exception as e:
            print(f"[Clone Error] {e}")
            fail_count += 1

    return {"status": "completed", "success": success_count, "failed": fail_count}

@app.delete("/api/extensions")
def delete_extension(adGroupId: str, extensionId: Optional[str] = None, x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    if extensionId:
        res = call_api_sync(("DELETE", f"/ncc/ad-extensions/{extensionId}", None, None, auth))
        if res is not None: return {"success": True}
    return {"success": False}

@app.put("/api/extensions/{ext_id}/status")
def update_extension_status(ext_id: str, update: StatusUpdate, x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    target_lock = True if update.status == 'PAUSED' else False
    res = call_api_sync(("PUT", f"/ncc/ad-extensions/{ext_id}", {'fields': 'userLock'}, {"userLock": target_lock}, auth))
    if res: return {"success": True}
    raise HTTPException(status_code=400, detail="Failed to update extension status")

@app.put("/api/keywords/bid/bulk")
def bulk_update_bids(items: List[BulkBidItem], x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    success_count = 0
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = []
        for item in items:
            params = {'fields': 'bidAmt,useGroupBidAmt'} 
            body = {"nccAdgroupId": item.adGroupId, "bidAmt": item.bidAmt, "useGroupBidAmt": False}
            args = ("PUT", f"/ncc/keywords/{item.keywordId}", params, body, auth)
            futures.append(executor.submit(call_api_sync, args))
        for f in as_completed(futures):
            if f.result(): success_count += 1
    return {"success": True, "processed": len(items), "updated": success_count}

@app.post("/api/keywords/bulk")
def create_keywords_bulk(items: List[KeywordCreateItem], x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    results = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {}
        for item in items:
            body_dict = {"keyword": item.keyword}
            if item.bidAmt: body_dict["bidAmt"] = item.bidAmt
            args = ("POST", "/ncc/keywords", {'nccAdgroupId': item.adGroupId}, [body_dict], auth)
            futures[executor.submit(call_api_sync, args)] = item.keyword
        for f in as_completed(futures):
            kwd = futures[f]
            res = f.result()
            if res:
                if isinstance(res, list) and len(res) > 0: res = res[0]
                results.append({"keyword": kwd, "status": "success", "id": res.get("nccKeywordId")})
            else:
                results.append({"keyword": kwd, "status": "failed"})
    return {"results": results}

@app.put("/api/ads/{ad_id}/status")
def update_ad_status(ad_id: str, update: StatusUpdate, x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    target_lock = True if update.status == 'PAUSED' else False
    res = call_api_sync(("PUT", f"/ncc/ads/{ad_id}", {'fields': 'userLock'}, {"userLock": target_lock}, auth))
    if res: return {"success": True}
    raise HTTPException(status_code=400, detail="Failed")

@app.get("/api/tool/ip-exclusion")
def get_ip_exclusions(x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    res = call_api_sync(("GET", "/tool/ip-exclusions", None, None, auth))
    if res: return res
    return []

@app.post("/api/tool/ip-exclusion")
def add_ip_exclusion(item: Dict[str, Any], x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    current_list = call_api_sync(("GET", "/tool/ip-exclusions", None, None, auth))
    if current_list is None: current_list = []
    new_ip = item.get('ip')
    if any(entry.get('ip') == new_ip for entry in current_list):
        return {"message": "이미 등록된 IP입니다."}
    current_list.append({"ip": new_ip, "memo": item.get('memo', '')})
    res = call_api_sync(("PUT", "/tool/ip-exclusions", None, json.dumps(current_list), auth))
    if res is not None: return {"success": True, "data": res}
    raise HTTPException(status_code=400, detail="IP 차단 실패")

@app.delete("/api/tool/ip-exclusion/{ip}")
def delete_ip_exclusion(ip: str, x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    current_list = call_api_sync(("GET", "/tool/ip-exclusions", None, None, auth))
    if not current_list: return {"success": False}
    filtered_list = [entry for entry in current_list if entry.get('ip') != ip]
    res = call_api_sync(("PUT", "/tool/ip-exclusions", None, json.dumps(filtered_list), auth))
    if res is not None: return {"success": True}
    raise HTTPException(status_code=400, detail="삭제 실패")

@app.get("/api/tool/count-total-keywords")
def count_total_keywords(
    x_naver_access_key: str = Header(...), 
    x_naver_secret_key: str = Header(...), 
    x_naver_customer_id: str = Header(...)
):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    print("[INFO] 계정 내 모든 키워드 개수를 계산합니다...")
    camps = call_api_sync(("GET", "/ncc/campaigns", None, None, auth))
    if not camps: return {"total": 0, "detail": "캠페인 없음"}
    
    total_count = 0
    camp_details = []
    with ThreadPoolExecutor(max_workers=10) as executor:
        future_to_camp = {
            executor.submit(call_api_sync, ("GET", "/ncc/adgroups", {'nccCampaignId': c['nccCampaignId']}, None, auth)): c 
            for c in camps
        }
        for future in as_completed(future_to_camp):
            camp = future_to_camp[future]
            groups = future.result() or []
            camp_kwd_count = 0
            if groups:
                group_futures = [
                    executor.submit(call_api_sync, ("GET", "/ncc/keywords", {'nccAdgroupId': g['nccAdgroupId']}, None, auth)) 
                    for g in groups
                ]
                for gf in as_completed(group_futures):
                    kwds = gf.result()
                    if kwds: camp_kwd_count += len(kwds)
            total_count += camp_kwd_count
            camp_details.append({"name": camp['name'], "count": camp_kwd_count})
            print(f"   -> '{camp['name']}': {camp_kwd_count}개")

    print(f"[INFO] 총 키워드 개수: {total_count}개")
    return {
        "total_keywords": total_count,
        "limit": 100000,
        "remaining": 100000 - total_count,
        "usage_percent": round((total_count / 100000) * 100, 2),
        "details": sorted(camp_details, key=lambda x: x['count'], reverse=True)
    }

def _add_keywords_simple(group_id, keywords, bid_amt, auth):
    for i in range(0, len(keywords), 100):
        chunk = keywords[i:i+100]
        print(f"   -> [전송 중] 키워드 {len(chunk)}개 등록 시도 (그룹: {group_id})...")
        
        body = [
            {
                "nccAdgroupId": group_id, 
                "keyword": k, 
                "bidAmt": bid_amt if bid_amt else 70, 
                "useGroupBidAmt": False 
            } 
            for k in chunk
        ]
        
        params = {'nccAdgroupId': group_id}
        res = call_api_sync(("POST", "/ncc/keywords", params, body, auth))
        
        if res:
            success_cnt = 0
            for item in res:
                if 'nccKeywordId' in item: success_cnt += 1
            print(f"   -> [전송 결과] 성공: {success_cnt}개, 실패: {len(res) - success_cnt}개")
        else:
            print("   -> [전송 실패] 응답 없음")
        time.sleep(0.1)

@app.post("/api/tools/smart-expand")
def smart_expand_keywords(
    item: SmartExpandItem, 
    x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)
):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    print(f"[SmartExpand] 시작: 소스그룹 {item.sourceGroupId}, 총 키워드 {len(item.keywords)}개")

    source_group = call_api_sync(("GET", f"/ncc/adgroups/{item.sourceGroupId}", None, None, auth))
    if not source_group:
        raise HTTPException(status_code=404, detail="Source group not found")

    queue = item.keywords
    current_group = source_group
    
    original_name = source_group['name']
    base_name = re.sub(r'_\d+$', '', original_name)
    
    next_group_index = 1
    if original_name != base_name:
        try:
            next_group_index = int(original_name.split('_')[-1]) + 1
        except:
            next_group_index = 1

    while len(queue) > 0:
        current_group_id = current_group['nccAdgroupId']
        current_group_name = current_group['name']
        print(f"   -> [처리 중] 그룹: {current_group_name} ({current_group_id})")

        existing_keywords = set()
        kwd_res = call_api_sync(("GET", "/ncc/keywords", {'nccAdgroupId': current_group_id}, None, auth))
        if kwd_res:
            for k in kwd_res:
                existing_keywords.add(k['keyword'].replace(" ", "").upper()) 

        current_count = len(existing_keywords)
        capacity = 1000 - current_count
        print(f"      - 현재 키워드: {current_count}개 / 남은 공간: {capacity}개")

        unique_queue = []
        skipped_count = 0
        for k in queue:
            k_norm = k.replace(" ", "").upper()
            if k_norm in existing_keywords:
                skipped_count += 1
            else:
                unique_queue.append(k)
        
        if skipped_count > 0:
            print(f"      - [필터링] 이미 존재하는 {skipped_count}개 키워드 건너뜀")
        
        queue = unique_queue

        if capacity > 0 and len(queue) > 0:
            chunk = queue[:capacity] 
            print(f"      - [채우기] {len(chunk)}개 키워드 등록 시작...")
            
            _add_keywords_simple(current_group_id, chunk, item.bidAmt, auth)
            
            queue = queue[capacity:]
        elif capacity <= 0:
            print(f"      - [알림] 그룹이 꽉 찼습니다.")

        if len(queue) > 0:
            print(f"   -> 남은 키워드 {len(queue)}개... 다음 그룹 준비")
            
            found_next_group = False
            while not found_next_group:
                next_name = f"{base_name}_{next_group_index}"
                
                body = {
                    "nccCampaignId": source_group['nccCampaignId'],
                    "name": next_name
                }
                if item.businessChannelId:
                    body['pcChannelId'] = item.businessChannelId
                    body['mobileChannelId'] = item.businessChannelId
                if 'adgroupType' in source_group:
                    body['adgroupType'] = source_group['adgroupType']
                
                print(f"      - 그룹 '{next_name}' 생성/확인 시도...")
                new_res = call_api_sync(("POST", "/ncc/adgroups", None, body, auth))
                
                if new_res and 'nccAdgroupId' in new_res:
                    current_group = new_res
                    found_next_group = True
                    print(f"      - [성공] 새 그룹 생성 완료: {next_name}")
                    
                    print(f"      - [자동] 확장소재 및 소재(Ads) 복제 시도...")
                    
                    # 1. 확장소재 복제
                    clone_extensions(source_group['nccAdgroupId'], new_res['nccAdgroupId'], 
                                     x_naver_access_key, x_naver_secret_key, x_naver_customer_id)
                    
                    # 2. 소재(Ads) 복제
                    clone_item = CloneAdsItem(sourceGroupId=source_group['nccAdgroupId'], targetGroupId=new_res['nccAdgroupId'])
                    clone_ads(clone_item, x_naver_access_key, x_naver_secret_key, x_naver_customer_id)
                
                elif new_res and new_res.get('code') == 3710: 
                    print(f"      - [발견] 이미 존재하는 그룹입니다. 정보를 가져옵니다...")
                    
                    all_groups = call_api_sync(("GET", "/ncc/adgroups", {'nccCampaignId': source_group['nccCampaignId']}, None, auth))
                    target = next((g for g in all_groups if g['name'] == next_name), None)
                    
                    if target:
                        current_group = target
                        found_next_group = True
                        print(f"      - [성공] 기존 그룹 로드 완료: {next_name}")
                    else:
                        print(f"      - [오류] 그룹이 있다고 하는데 찾을 수 없음. 인덱스 증가.")
                        next_group_index += 1
                else:
                    print(f"      - [오류] 그룹 생성 실패. 다음 번호로 시도.")
                    next_group_index += 1
                    if next_group_index > 100:
                         raise HTTPException(status_code=500, detail="그룹 생성 실패 반복")

                if found_next_group:
                    next_group_index += 1

    return {"status": "success", "message": "모든 키워드 처리 완료"}

if getattr(sys, 'frozen', False):
    dist_path = os.path.join(sys._MEIPASS, "dist")
else:
    base_dir = os.path.dirname(__file__)
    frontend_path = os.path.join(base_dir, "frontend")
    dist_local_path = os.path.join(base_dir, "dist")
    if os.path.exists(frontend_path) and os.path.exists(os.path.join(frontend_path, "index.html")):
        dist_path = frontend_path
    else:
        dist_path = dist_local_path

if os.path.exists(dist_path) and os.path.exists(os.path.join(dist_path, "index.html")):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="static")
    print(f"[SUCCESS] 화면 파일을 연결했습니다: {dist_path}")
else:
    print(f"[FAILED] 화면 파일을 찾을 수 없습니다. (경로: {dist_path})")
    @app.get("/")
    def read_root():
        return HTMLResponse(content=f"""
            <div style="text-align: center; padding: 40px; font-family: sans-serif;">
                <h1>[ERROR] 화면 파일(index.html)이 없습니다.</h1>
                <p>현재 서버가 확인한 경로: <b>{dist_path}</b></p>
                <hr>
                <p><b>[해결 방법]</b></p>
                <p>1. <code>frontend</code> 폴더가 있는지 확인하세요.</p>
                <p>2. 그 안에 <code>index.html</code> 파일이 들어있는지 확인하세요.</p>
            </div>
        """)

if __name__ == "__main__":
    webbrowser.open("http://localhost:8000")
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_config=None)