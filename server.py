print("\n\n🔥🔥🔥 [SaaS 모드 실행: 기간제 구독 시스템 적용됨] 🔥🔥🔥\n\n")

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
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from concurrent.futures import ThreadPoolExecutor, as_completed

import mimetypes
from fastapi import FastAPI, HTTPException, Request, Header, Query, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from passlib.context import CryptContext
from jose import JWTError, jwt

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

# ==========================================
# 1. 데이터베이스 및 보안 설정 (SaaS 핵심)
# ==========================================
SECRET_KEY = "YOUR_SECRET_KEY_PLEASE_CHANGE_THIS"  # 실제 배포시 변경 권장
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # 24시간

SQLALCHEMY_DATABASE_URL = "sqlite:///./app.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# [수정] 유저 모델에 '만료일(subscription_expiry)' 추가
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    name = Column(String)
    phone = Column(String)
    
    naver_access_key = Column(String, nullable=True)
    naver_secret_key = Column(String, nullable=True)
    naver_customer_id = Column(String, nullable=True)
    
    is_active = Column(Boolean, default=True)
    is_paid = Column(Boolean, default=False)
    is_superuser = Column(Boolean, default=False)
    
    # [NEW] 이용 기간 만료일 (이 날짜가 지나면 자동으로 is_paid가 꺼짐)
    subscription_expiry = Column(DateTime, nullable=True)

Base.metadata.create_all(bind=engine)

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

# --- Pydantic Models (데이터 검증) ---
class UserCreate(BaseModel):
    username: str
    password: str
    name: str
    phone: str

class UserLogin(BaseModel):
    username: str
    password: str

class UserUpdateKeys(BaseModel):
    naver_access_key: str
    naver_secret_key: str
    naver_customer_id: str

class UserOut(BaseModel):
    id: int
    username: str
    name: str
    is_active: bool
    is_paid: bool
    is_superuser: bool
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

# --- Helper Functions (보안) ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# [중요] 유저 인증 및 자동 만료 체크 로직
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception

    # [NEW] 기간 만료 체크 (관리자가 아니면 체크)
    if user.is_paid and not user.is_superuser:
        if user.subscription_expiry and user.subscription_expiry < datetime.now():
            print(f"🚫 [기간 만료] {user.username}님의 이용 기간이 종료되었습니다.")
            user.is_paid = False # 권한 박탈
            db.commit()
    
    return user

# [중요] 승인된 유저만 통과 (Dependency)
def get_current_active_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    # 기간 만료 체크는 위에서 이미 수행함
    if not current_user.is_paid and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="관리자 승인(결제 확인) 대기 중이거나 이용 기간이 만료되었습니다.")
    return current_user

# [중요] 관리자만 통과 (Dependency)
def get_current_admin_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다.")
    return current_user

# ==========================================
# 2. 기존 로직 모델 (Pydantic)
# ==========================================
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
    adExtension: Optional[Any] = None # List 허용

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

# ==========================================
# 3. 네이버 API 호출 로직 (기존 함수 재활용)
# ==========================================
BASE_URL = "https://api.searchad.naver.com"

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
    # args: (method, uri, params, body, auth)
    # auth 딕셔너리 필수: {'api_key':..., 'secret_key':..., 'customer_id':...}
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
        time.sleep(0.3)
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

def safe_json_parse(data):
    if data is None: return {}
    if isinstance(data, dict): return data
    if isinstance(data, list): return data # [유지] 리스트 허용
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

# --- 로그 파일 기능 (기존 복구) ---
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


mimetypes.init()
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('image/svg+xml', '.svg')

# ==========================================
# 4. FastAPI 앱 설정
# ==========================================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 5. 인증 API (회원가입/로그인)
# ==========================================

@app.post("/auth/register", response_model=UserOut)
def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="이미 존재하는 아이디입니다.")
    
    hashed_pw = get_password_hash(user.password)
    is_first = db.query(User).count() == 0
    
    new_user = User(
        username=user.username,
        hashed_password=hashed_pw,
        name=user.name,
        phone=user.phone,
        is_paid=False,
        is_superuser=is_first
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/auth/token", response_model=Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 틀렸습니다.")
    
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me", response_model=UserOut)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.put("/users/me/keys")
def update_api_keys(keys: UserUpdateKeys, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.naver_access_key = keys.naver_access_key
    current_user.naver_secret_key = keys.naver_secret_key
    current_user.naver_customer_id = keys.naver_customer_id
    db.commit()
    return {"status": "success", "message": "API 키가 저장되었습니다."}

# [관리자 전용] 회원 목록 조회
@app.get("/admin/users", response_model=List[UserOut])
def get_all_users(current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    return db.query(User).all()

# [수정] 관리자 승인 (개월 수 입력 받음)
@app.put("/admin/approve/{user_id}")
def approve_user(user_id: int, months: int = Query(1, description="이용 개월 수"), current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.is_paid = True
    # 현재 시간 기준으로 N개월 추가
    user.subscription_expiry = datetime.now() + timedelta(days=30 * months)
    
    db.commit()
    return {"status": "success", "message": f"{user.name}님 승인 완료 ({months}개월)", "expiry": user.subscription_expiry}

# [수정] 승인 취소 (만료 처리)
@app.put("/admin/revoke/{user_id}")
def revoke_user(user_id: int, current_user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.is_paid = False
    user.subscription_expiry = None # 만료일 초기화
    
    db.commit()
    return {"status": "success", "message": f"{user.name}님 이용 정지 완료"}

# ==========================================
# 6. 유틸리티 API (로그인 불필요) - 복구됨
# ==========================================

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

# ==========================================
# 7. 비즈니스 로직 API (인증 적용)
# ==========================================

# 도우미: 유저 정보에서 API 인증 딕셔너리 생성
def get_naver_auth(user: User):
    if not user.naver_access_key or not user.naver_secret_key or not user.naver_customer_id:
        raise HTTPException(status_code=400, detail="네이버 API 키가 설정되지 않았습니다. 마이페이지에서 설정해주세요.")
    return {
        "api_key": user.naver_access_key,
        "secret_key": user.naver_secret_key,
        "customer_id": user.naver_customer_id
    }

@app.get("/api/campaigns")
def get_campaigns(current_user: User = Depends(get_current_active_user)):
    auth = get_naver_auth(current_user)
    camps = call_api_sync(("GET", "/ncc/campaigns", None, None, auth))
    if not camps: return []
    ids = [c['nccCampaignId'] for c in camps]
    stats_map = fetch_stats(ids, auth)
    return [{
        "nccCampaignId": c['nccCampaignId'], 
        "name": c['name'], 
        "campaignType": c.get('campaignType', 'WEB_SITE'),
        "status": c.get('status', 'UNKNOWN'),
        "stats": format_stats(stats_map.get(c['nccCampaignId']))
    } for c in camps]

@app.get("/api/adgroups")
def get_adgroups(campaign_id: str = Query(...), current_user: User = Depends(get_current_active_user)):
    auth = get_naver_auth(current_user)
    groups = call_api_sync(("GET", "/ncc/adgroups", {'nccCampaignId': campaign_id}, None, auth))
    if not groups: return []
    ids = [g['nccAdgroupId'] for g in groups]
    stats_map = fetch_stats(ids, auth)
    return [{
        "nccAdGroupId": g['nccAdgroupId'], 
        "nccCampaignId": g['nccCampaignId'], 
        "name": g['name'],
        "bidAmt": g.get('bidAmt', 0), 
        "status": g.get('status', 'UNKNOWN'),
        "stats": format_stats(stats_map.get(g['nccAdgroupId']))
    } for g in groups]

@app.post("/api/adgroups")
def create_adgroup(item: AdGroupCreateItem, current_user: User = Depends(get_current_active_user)):
    auth = get_naver_auth(current_user)
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
    target_rank: int = Query(3), 
    device: Optional[str] = Query(None),
    current_user: User = Depends(get_current_active_user)
):
    # ▼▼▼ 이 줄을 꼭 넣어주세요! ▼▼▼
    print(f"👉 [요청 도착] 키워드 조회 시작! (그룹ID: {adgroup_id})")
    
    auth = get_naver_auth(current_user)
    adgroup = call_api_sync(("GET", f"/ncc/adgroups/{adgroup_id}", None, None, auth))
    group_bid = adgroup.get('bidAmt', 0) if adgroup else 0
    kwd_list = call_api_sync(("GET", "/ncc/keywords", {'nccAdgroupId': adgroup_id}, None, auth))
    if not kwd_list: return []
    
    ids_for_est = [k['nccKeywordId'] for k in kwd_list]
    stats_map = fetch_stats(ids_for_est, auth)
    
    # 순위 로직 (기존 유지)
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
            for item in res['estimate']:
                k_id = item.get('nccKeywordId') or item.get('keywordId') or item.get('key')
                bid_val = item.get('bid', 0)
                if k_id: estimates_map[k_id] = [{"rank": target_rank, "bid": bid_val}]
        time.sleep(0.3)

    result = []
    for k in kwd_list:
        stat = stats_map.get(k['nccKeywordId'])
        rank_est = stat.get('avgRnk', 0) if stat else 0
        est_data = estimates_map.get(k['nccKeywordId'], [])
        result.append({
            "nccKeywordId": k['nccKeywordId'], 
            "nccAdGroupId": k['nccAdgroupId'], 
            "keyword": k['keyword'],
            "bidAmt": group_bid if k.get('useGroupBidAmt', False) else k['bidAmt'],
            "originalBid": k['bidAmt'], 
            "useGroupBidAmt": k.get('useGroupBidAmt', False),
            "status": k['status'], 
            "managedStatus": "ON" if k['status'] == 'ELIGIBLE' else "OFF",
            "stats": format_stats(stat), 
            "currentRankEstimate": rank_est,
            "bidEstimates": est_data
        })
    return result

@app.get("/api/ads")
def get_ads(campaign_id: Optional[str] = None, adgroup_id: Optional[str] = None, current_user: User = Depends(get_current_active_user)):
    auth = get_naver_auth(current_user)
    
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

@app.post("/api/ads")
def create_ad(item: AdCreateItem, current_user: User = Depends(get_current_active_user)):
    auth = get_naver_auth(current_user)
    
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

@app.post("/api/ads/clone")
def clone_ads(item: CloneAdsItem, current_user: User = Depends(get_current_active_user)):
    auth = get_naver_auth(current_user)
    
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
def delete_ad(ad_id: str, current_user: User = Depends(get_current_active_user)):
    auth = get_naver_auth(current_user)
    res = call_api_sync(("DELETE", f"/ncc/ads/{ad_id}", None, None, auth))
    if res is not None: return {"success": True}
    raise HTTPException(status_code=400, detail="Failed to delete ad")

@app.get("/api/channels")
def get_channels(current_user: User = Depends(get_current_active_user)):
    auth = get_naver_auth(current_user)
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
    current_user: User = Depends(get_current_active_user)
):
    auth = get_naver_auth(current_user)
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
def create_extension(item: ExtensionCreateItem, current_user: User = Depends(get_current_active_user)):
    auth = get_naver_auth(current_user)

    print(f"\n🔥🔥 [create_extension] 타입: {item.type} 🔥🔥")
    
    incoming_data = item.adExtension or item.attributes
    
    body = {
        "ownerId": item.adGroupId,
        "type": item.type.upper()
    }
    if item.businessChannelId:
        body["pcChannelId"] = item.businessChannelId
        body["mobileChannelId"] = item.businessChannelId

    real_data = None
    if incoming_data:
        # [핵심 1] 포장지 제거
        if isinstance(incoming_data, dict) and "adExtension" in incoming_data:
            print(" >> [처리] 프론트엔드 포장지 제거 (Unwrapping adExtension)")
            real_data = incoming_data["adExtension"]
        else:
            real_data = incoming_data

    # [핵심 2] PHONE 등은 adExtension 제외
    if item.type.upper() not in ["PHONE", "PLACE", "LOCATION"]:
        if real_data:
            if isinstance(real_data, dict) and item.type.upper() == "WEBSITE_INFO":
                 real_data["agree"] = True
            body["adExtension"] = real_data
    else:
        print(f" >> [알림] {item.type} 타입은 adExtension 필드를 전송하지 않습니다.")

    uri = "/ncc/ad-extensions"
    res = call_api_sync(("POST", uri, None, body, auth))
    if res: return res

    print(f"[FAIL] Extension Create Failed. Body: {body}")
    raise HTTPException(status_code=400, detail="Failed to create extension")

@app.post("/api/extensions/clone/{new_group_id}")
def clone_extensions(source_group_id: str, new_group_id: str, current_user: User = Depends(get_current_active_user)):
    auth = get_naver_auth(current_user)
    
    uri = "/ncc/ad-extensions"
    res = call_api_sync(("GET", uri, {'ownerId': source_group_id}, {}, auth))

    if not res:
        return {"status": "completed", "success": 0, "failed": 0}

    success_count = 0
    fail_count = 0
    
    IMPOSSIBLE_TYPES = [
        "SHOPPING_EXTRA", "CATALOG_EXTRA", "CATALOG_EVENT", "CATALOG_PURCHASE_CONDITION",
        "SHOPPING_BRAND_BROADCAST", "SHOPPING_BRAND_EVENT", "PLACE_SMART_ORDER", "NAVER_BLOG_REVIEW",
        "IMAGE_SUB_LINKS", "CATALOG_IMAGE", "NAVER_TV_VIDEO", "SHOPPING_BRAND_IMAGE", "SHOPPING_BRAND_VIDEO"
    ]
    
    for ext in res:
        ext_type = ext.get("type", "UNKNOWN")
        if ext_type in IMPOSSIBLE_TYPES: continue

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
            if create_res: success_count += 1
            else: fail_count += 1
        except:
            fail_count += 1

    return {"status": "completed", "success": success_count, "failed": fail_count}

@app.delete("/api/extensions")
def delete_extension(adGroupId: str, extensionId: Optional[str] = None, current_user: User = Depends(get_current_active_user)):
    auth = get_naver_auth(current_user)
    if extensionId:
        res = call_api_sync(("DELETE", f"/ncc/ad-extensions/{extensionId}", None, None, auth))
        if res is not None: return {"success": True}
    return {"success": False}

@app.put("/api/extensions/{ext_id}/status")
def update_extension_status(ext_id: str, update: StatusUpdate, current_user: User = Depends(get_current_active_user)):
    auth = get_naver_auth(current_user)
    target_lock = True if update.status == 'PAUSED' else False
    res = call_api_sync(("PUT", f"/ncc/ad-extensions/{ext_id}", {'fields': 'userLock'}, {"userLock": target_lock}, auth))
    if res: return {"success": True}
    raise HTTPException(status_code=400, detail="Failed")

@app.post("/api/keywords/bulk")
def create_keywords_bulk(items: List[KeywordCreateItem], current_user: User = Depends(get_current_active_user)):
    auth = get_naver_auth(current_user)
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

@app.put("/api/keywords/bid/bulk")
def bulk_update_bids(items: List[BulkBidItem], current_user: User = Depends(get_current_active_user)):
    auth = get_naver_auth(current_user)
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

@app.put("/api/ads/{ad_id}/status")
def update_ad_status(ad_id: str, update: StatusUpdate, current_user: User = Depends(get_current_active_user)):
    auth = get_naver_auth(current_user)
    target_lock = True if update.status == 'PAUSED' else False
    res = call_api_sync(("PUT", f"/ncc/ads/{ad_id}", {'fields': 'userLock'}, {"userLock": target_lock}, auth))
    if res: return {"success": True}
    raise HTTPException(status_code=400, detail="Failed")

# [복구됨] IP 차단 기능
@app.get("/api/tool/ip-exclusion")
def get_ip_exclusions(current_user: User = Depends(get_current_active_user)):
    auth = get_naver_auth(current_user)
    res = call_api_sync(("GET", "/tool/ip-exclusions", None, None, auth))
    if res: return res
    return []

@app.post("/api/tool/ip-exclusion")
def add_ip_exclusion(item: Dict[str, Any], current_user: User = Depends(get_current_active_user)):
    auth = get_naver_auth(current_user)
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
def delete_ip_exclusion(ip: str, current_user: User = Depends(get_current_active_user)):
    auth = get_naver_auth(current_user)
    current_list = call_api_sync(("GET", "/tool/ip-exclusions", None, None, auth))
    if not current_list: return {"success": False}
    filtered_list = [entry for entry in current_list if entry.get('ip') != ip]
    res = call_api_sync(("PUT", "/tool/ip-exclusions", None, json.dumps(filtered_list), auth))
    if res is not None: return {"success": True}
    raise HTTPException(status_code=400, detail="삭제 실패")

# [복구됨] 키워드 개수 계산
@app.get("/api/tool/count-total-keywords")
def count_total_keywords(current_user: User = Depends(get_current_active_user)):
    auth = get_naver_auth(current_user)
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

# [스마트 키워드 확장 - 인증 적용]
@app.post("/api/tools/smart-expand")
def smart_expand_keywords(
    item: SmartExpandItem, 
    current_user: User = Depends(get_current_active_user)
):
    auth = get_naver_auth(current_user)
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
        try: next_group_index = int(original_name.split('_')[-1]) + 1
        except: next_group_index = 1

    while len(queue) > 0:
        current_group_id = current_group['nccAdgroupId']
        existing_keywords = set()
        kwd_res = call_api_sync(("GET", "/ncc/keywords", {'nccAdgroupId': current_group_id}, None, auth))
        if kwd_res:
            for k in kwd_res: existing_keywords.add(k['keyword'].replace(" ", "").upper()) 

        current_count = len(existing_keywords)
        capacity = 1000 - current_count
        
        unique_queue = []
        for k in queue:
            if k.replace(" ", "").upper() not in existing_keywords: unique_queue.append(k)
        queue = unique_queue

        if capacity > 0 and len(queue) > 0:
            chunk = queue[:capacity] 
            # 내부 함수 호출
            _add_keywords_simple(current_group_id, chunk, item.bidAmt, auth)
            queue = queue[capacity:]

        if len(queue) > 0:
            found_next_group = False
            while not found_next_group:
                next_name = f"{base_name}_{next_group_index}"
                body = {"nccCampaignId": source_group['nccCampaignId'], "name": next_name}
                if item.businessChannelId:
                    body['pcChannelId'] = item.businessChannelId
                    body['mobileChannelId'] = item.businessChannelId
                if 'adgroupType' in source_group:
                    body['adgroupType'] = source_group['adgroupType']
                
                new_res = call_api_sync(("POST", "/ncc/adgroups", None, body, auth))
                
                if new_res and 'nccAdgroupId' in new_res:
                    current_group = new_res
                    found_next_group = True
                    
                    try:
                        # 확장소재 복제 로직
                        ext_res = call_api_sync(("GET", "/ncc/ad-extensions", {'ownerId': source_group['nccAdgroupId']}, {}, auth))
                        if ext_res:
                            for ext in ext_res:
                                if ext.get("type") in ["IMAGE_SUB_LINKS"]: continue
                                new_ext = {
                                    "ownerId": new_res['nccAdgroupId'], "type": ext["type"],
                                    "pcChannelId": ext.get("pcChannelId"), "mobileChannelId": ext.get("mobileChannelId")
                                }
                                if "adExtension" in ext: new_ext["adExtension"] = ext["adExtension"]
                                call_api_sync(("POST", "/ncc/ad-extensions", None, new_ext, auth))
                        
                        # 소재 복제 로직
                        ads_res = call_api_sync(("GET", "/ncc/ads", {'nccAdgroupId': source_group['nccAdgroupId']}, None, auth))
                        if ads_res:
                            for ad in ads_res:
                                ad_content = ad.get('ad')
                                if isinstance(ad_content, str): ad_content = json.loads(ad_content)
                                ad_body = {"type": "TEXT_45", "nccAdgroupId": new_res['nccAdgroupId'], "ad": ad_content}
                                call_api_sync(("POST", "/ncc/ads", None, ad_body, auth))
                    except:
                        pass

                elif new_res and new_res.get('code') == 3710: 
                    all_groups = call_api_sync(("GET", "/ncc/adgroups", {'nccCampaignId': source_group['nccCampaignId']}, None, auth))
                    target = next((g for g in all_groups if g['name'] == next_name), None)
                    if target:
                        current_group = target
                        found_next_group = True
                    else:
                        next_group_index += 1
                else:
                    next_group_index += 1
                    if next_group_index > 100:
                         raise HTTPException(status_code=500, detail="그룹 생성 실패 반복")

                if found_next_group: next_group_index += 1

    return {"status": "success", "message": "모든 키워드 처리 완료"}

def _add_keywords_simple(group_id, keywords, bid_amt, auth):
    for i in range(0, len(keywords), 100):
        chunk = keywords[i:i+100]
        body = [{"nccAdgroupId": group_id, "keyword": k, "bidAmt": bid_amt or 70, "useGroupBidAmt": False} for k in chunk]
        call_api_sync(("POST", "/ncc/keywords", {'nccAdgroupId': group_id}, body, auth))
        time.sleep(0.1)

# --- 정적 파일 서빙 ---
if getattr(sys, 'frozen', False):
    dist_path = os.path.join(sys._MEIPASS, "dist")
else:
    base_dir = os.path.dirname(__file__)
    frontend_path = os.path.join(base_dir, "frontend")
    dist_local_path = os.path.join(base_dir, "dist")
    if os.path.exists(dist_local_path) and os.path.exists(os.path.join(dist_local_path, "index.html")):
        dist_path = dist_local_path
    elif os.path.exists(frontend_path) and os.path.exists(os.path.join(frontend_path, "index.html")):
        dist_path = frontend_path
    else:
        dist_path = dist_local_path

if os.path.exists(dist_path) and os.path.exists(os.path.join(dist_path, "index.html")):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="static")
else:
    @app.get("/")
    def read_root():
        return HTMLResponse("<h1>Backend Running (DB Mode)</h1>")

if __name__ == "__main__":
    # webbrowser.open("http://localhost:8000/docs")  <-- 서버에서는 브라우저가 안 열리니 주석 처리해도 됩니다.
    import uvicorn
    # 포트를 80으로 변경 (기본 웹 포트)
    uvicorn.run(app, host="0.0.0.0", port=8000, log_config=None)