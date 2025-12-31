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
    # [NEW] URL 필드 추가
    pcUrl: Optional[str] = None
    mobileUrl: Optional[str] = None

class ExtensionCreateItem(BaseModel):
    adGroupId: str
    type: str 
    businessChannelId: Optional[str] = None
    attributes: Optional[Dict[str, Any]] = None 

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

# --- Core Helpers ---
def generate_signature(timestamp, method, uri, secret_key):
    message = f"{timestamp}.{method}.{uri}"
    hash = hmac.new(bytes(secret_key, "utf-8"), bytes(message, "utf-8"), hashlib.sha256)
    return base64.b64encode(hash.digest()).decode()

def get_header(method, uri, api_key, secret_key, customer_id):
    timestamp = str(int(time.time() * 1000))
    # [핵심] 서명 생성 시 물음표(?) 뒤의 파라미터는 무시하고 순수 주소만 사용
    clean_uri = uri.split("?")[0]
    signature = generate_signature(timestamp, method, clean_uri, secret_key)
    return {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Timestamp": timestamp,
        "X-API-KEY": api_key,
        "X-Customer": str(customer_id),
        "X-Signature": signature
    }

# [1] API 호출 담당 함수 (서명 로직 완벽 수정)
def call_api_sync(args):
    # args 분해 (순서: Method, URI, Params, Body, Auth)
    if len(args) == 5:
        method, uri, params, body, auth = args
    else:
        # 안전장치: 혹시라도 인자가 부족할 경우 처리
        method, uri, params, body, auth = args[0], args[1], None, args[2], args[3]

    if not auth or not auth.get('api_key'):
        return {"error": "Missing authentication data"}

    # [★핵심 1] 서명 생성용 URI는 물음표(?) 뒤를 잘라낸 '순수 경로'만 사용
    # 예: "/ncc/ad-extensions?isList=true" -> "/ncc/ad-extensions"
    clean_uri = uri.split("?")[0]
    
    headers = get_header(method, clean_uri, auth['api_key'], auth['secret_key'], auth['customer_id'])
    
    # 실제 요청 URL (requests 라이브러리가 params를 알아서 ?key=value로 붙여줌)
    url = BASE_URL + clean_uri
    
    try:
        if method in ["POST", "PUT", "DELETE"]:
            # [★핵심 2] requests에 params와 json(body)을 분리해서 전달
            # json=body를 쓰면 requests가 알아서 Content-Type 설정 및 직렬화 수행
            resp = requests.request(method, url, params=params, json=body, headers=headers)
        else:
            resp = requests.get(url, params=params, headers=headers)
            
        if resp.status_code == 200: 
            return resp.json()
        
        # 에러 발생 시 상세 로그 출력
        print(f"[API Error] [{resp.status_code}]: {url}")
        print(f"   -> Params: {params}")
        print(f"   -> Response: {resp.text[:500]}")
        return None

    except Exception as e: 
        print(f"[Network Error]: {e}")
        return None

# [통계 기간: 오늘 하루로 고정]
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
    if isinstance(data, str):
        try:
            return json.loads(data)
        except:
            return {}
    return {}

# [수정됨] 소재 데이터 정제 (URL 정보 포함)
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
            "pcUrl": details.get('pcUrl', ''),      # [NEW]
            "mobileUrl": details.get('mobileUrl', ''), # [NEW]
            "status": ad.get('userLock', False)
        })
    return result

# [수정됨] 확장소재 데이터 정제
def format_extension(ext):
    ext['extension'] = safe_json_parse(ext.get('adExtension'))
    return ext

# --- 방문자 추적 및 로그 시스템 ---
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

# --- 입찰 로그 자동 저장 API ---
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
    x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)
):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    body = {"nccCampaignId": item.nccCampaignId, "name": item.name}
    
    # [수정] json.dumps 제거 -> body 딕셔너리 그대로 전달 (배열 포장도 제거)
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

# [2] 소재(Ad) 생성 API (파라미터 분리 적용)
@app.post("/api/ads")
def create_ad(item: AdCreateItem, x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}
    
    # 1. 소재 내용 구성 (Dictionary)
    ad_content = {
        "headline": item.headline,
        "description": item.description
    }
    
    # 2. 전체 Body 구성 (Dictionary)
    single_body = {
        "type": "TEXT", 
        "nccAdgroupId": item.adGroupId, 
        "ad": ad_content  # json.dumps 쓰지 않음!
    }
    
    # 3. [★핵심 3] isList=true 파라미터 분리 및 Body 리스트핑
    uri = "/ncc/ads"
    params = {'isList': 'true'}
    body_list = [single_body] # 대량 등록 모드이므로 리스트로 감쌈

    res = call_api_sync(("POST", uri, params, body_list, auth))
    
    if res: return res
    
    raise HTTPException(status_code=400, detail="Failed to create ad")

# 요청 결과를 로깅
    if 'error' in res:
        print(f"[DEBUG] API Response: {res['error']}")

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
        ch_type = ch.get('channelType', 'UNKNOWN')
        result.append({
            "nccBusinessChannelId": ch['nccBusinessChannelId'],
            "name": ch['name'],
            "channelKey": ch.get('channelKey', ''),
            "type": ch_type 
        })
    return result

@app.get("/api/extensions")
def get_extensions(
    campaign_id: Optional[str] = Query(None), 
    adgroup_id: Optional[str] = Query(None),
    x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)
):
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

@app.post("/api/extensions")
def create_extension(item: ExtensionCreateItem, x_naver_access_key: str = Header(...), x_naver_secret_key: str = Header(...), x_naver_customer_id: str = Header(...)):
    auth = {"api_key": x_naver_access_key, "secret_key": x_naver_secret_key, "customer_id": x_naver_customer_id}

    # 요청 데이터 구성 (배열 형태로 변경)
    payload = [
        {
            "ownerId": item.adGroupId,
            "type": item.type.upper(),
            "adExtension": {
                "links": [
                    {"linkName": "Link 1", "url": "https://example1.com"},
                    {"linkName": "Link 2", "url": "https://example2.com"}
                ]
            }
        }
    ]

    # API 요청
    uri = "/ncc/ad-extensions"
    params = {"isList": "true"}  # 서버에 리스트 형태 데이터 전송을 명시
    print(f"[DEBUG] Sending Payload: {json.dumps(payload, ensure_ascii=False)}")
    res = call_api_sync(("POST", uri, params, payload, auth))

    if res:
        return res

    raise HTTPException(status_code=400, detail="Failed to create extension")

    # 요청 결과를 로깅
    if 'error' in res:
        print(f"[DEBUG] API Response: {res['error']}")

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
            args = ("POST", "/ncc/keywords", {'nccAdgroupId': item.adGroupId}, json.dumps([body_dict]), auth)
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