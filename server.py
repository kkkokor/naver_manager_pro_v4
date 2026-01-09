print("\n\n🔥🔥🔥 [SaaS 모드: 기능 완전 복구 + 하이브리드 지원 (v12.0 Final)] 🔥🔥🔥\n\n")

import hashlib
import hmac
import base64
import requests
import json
import time
import sys
import os
import threading
import csv
import re
import urllib.parse
from datetime import datetime, timedelta
# [수정] Dict, Any가 빠져서 에러가 났던 부분 해결
from typing import List, Optional, Dict, Any 
from concurrent.futures import ThreadPoolExecutor, as_completed

import mimetypes
from fastapi import FastAPI, HTTPException, Request, Header, Query, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, text
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
# 1. 데이터베이스 및 보안 설정
# ==========================================
SECRET_KEY = "YOUR_SECRET_KEY_PLEASE_CHANGE_THIS"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 

SQLALCHEMY_DATABASE_URL = "sqlite:///./app.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
# [최적화] WAL 모드 적용
with engine.connect() as connection:
    connection.execute(text("PRAGMA journal_mode=WAL;"))

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

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
    
    subscription_expiry = Column(DateTime, nullable=True)

class VisitLog(Base):
    __tablename__ = "visit_logs"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.now)
    ip = Column(String, index=True)
    type = Column(String)
    keyword = Column(String, nullable=True)
    url = Column(String)
    referrer = Column(String, nullable=True)

Base.metadata.create_all(bind=engine)

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

# --- Pydantic Models (정석대로 줄바꿈 적용) ---
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
    naver_access_key: Optional[str] = None
    naver_customer_id: Optional[str] = None
    naver_secret_key: Optional[str] = None 
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

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

class SmartExpandItem(BaseModel):
    sourceGroupId: str
    keywords: List[str]
    bidAmt: Optional[int] = None
    businessChannelId: str

class CloneAdsItem(BaseModel):
    sourceGroupId: str
    targetGroupId: str

# --- Helper Functions ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None: raise HTTPException(status_code=401)
    except JWTError:
        raise HTTPException(status_code=401)
    
    user = db.query(User).filter(User.username == username).first()
    if user is None: raise HTTPException(status_code=401)
    
    if user.is_paid and not user.is_superuser:
        if user.subscription_expiry and user.subscription_expiry < datetime.now():
            print(f"🚫 [만료] {user.username}")
            user.is_paid = False
            db.commit()
    return user

def get_current_active_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    if not current_user.is_paid and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="승인 대기 중")
    return current_user

def get_current_admin_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403)
    return current_user

# ==========================================
# 3. 네이버 API 로직 (400 에러 해결 완료)
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

# [핵심] 수동 URL 조립 방식으로 400 에러 원천 차단
def call_api_sync(args):
    if len(args) == 5:
        method, uri, params, body, auth = args
    else:
        method, uri, params, body, auth = args[0], args[1], None, args[2], args[3]

    if not auth or not auth.get('api_key'):
        return {"error": "Missing authentication data"}

    clean_uri = uri.split("?")[0]
    url = BASE_URL + clean_uri
    
    # [중요] 라이브러리(requests)의 params 인자를 쓰지 않고 직접 URL에 붙임
    if params:
        query_string = urllib.parse.urlencode(params)
        url = f"{url}?{query_string}"

    max_retries = 3
    for attempt in range(max_retries):
        try:
            headers = get_header(method, clean_uri, auth['api_key'], auth['secret_key'], auth['customer_id'])
            
            if method in ["POST", "PUT", "DELETE"]:
                # params=params 제거됨 (URL에 이미 있음)
                resp = requests.request(method, url, json=body, headers=headers)
            else:
                resp = requests.get(url, headers=headers)
                
            if resp.status_code == 200: 
                return resp.json()
            
            if resp.status_code == 429:
                wait_time = 1.5 * (attempt + 1)
                print(f"⚠️ [429] 대기... {wait_time}초")
                time.sleep(wait_time)
                continue
            
            if resp.status_code >= 400:
                print(f"[API Error {resp.status_code}]: {url}")
                if body: print(f" -> Body: {str(body)[:100]}...")
                print(f" -> Response: {resp.text[:200]}")
                return None
                
        except Exception as e:
            print(f"[Net Error]: {e}")
            time.sleep(1)
    return None

def fetch_stats(ids_list, auth, since=None, until=None):
    if not ids_list or not auth: return {}
    stats_map = {}
    if not since or not until:
        today = datetime.now().strftime("%Y-%m-%d")
        time_range = {"since": today, "until": today}
    else:
        time_range = {"since": since, "until": until}

    for i in range(0, len(ids_list), 50):
        chunk = ids_list[i:i + 50]
        ids_str = ",".join(chunk)
        params = {
            'ids': ids_str,
            'fields': '["impCnt","clkCnt","salesAmt","ccnt","avgRnk","convAmt"]', 
            'timeRange': json.dumps(time_range) 
        }
        res = call_api_sync(("GET", "/stats", params, None, auth))
        if res and 'data' in res:
            for item in res['data']: stats_map[item['id']] = item
        time.sleep(0.05)
    return stats_map

def get_naver_auth(user: User):
    if not user.naver_access_key:
        raise HTTPException(status_code=400, detail="API Key Missing")
    return {
        "api_key": user.naver_access_key.strip(),
        "secret_key": user.naver_secret_key.strip(),
        "customer_id": str(user.naver_customer_id).strip()
    }

def format_stats(s):
    if not s: return {"impressions":0,"clicks":0,"cost":0,"ctr":0,"cpc":0,"conversions":0,"cpa":0,"roas":0,"convAmt":0}
    try:
        imp, clk, cost, conv, c_amt = int(s.get('impCnt',0)), int(s.get('clkCnt',0)), int(s.get('salesAmt',0)), int(s.get('ccnt',0)), int(s.get('convAmt',0))
        return {
            "impressions": imp, "clicks": clk, "cost": cost, 
            "ctr": round(clk/imp*100,2) if imp>0 else 0, 
            "cpc": round(cost/clk,0) if clk>0 else 0, 
            "conversions": conv, 
            "cpa": round(cost/conv,0) if conv>0 else 0, 
            "roas": round(c_amt/cost*100,0) if cost>0 else 0, 
            "convAmt": c_amt
        }
    except:
        return {"impressions":0,"clicks":0,"cost":0,"ctr":0,"cpc":0,"conversions":0,"cpa":0,"roas":0,"convAmt":0}

def safe_json_parse(d):
    if isinstance(d, dict): return d
    if isinstance(d, str):
        try: return json.loads(d)
        except: return {}
    return {}

def convert_ads(l):
    r = []
    for a in l:
        d = safe_json_parse(a.get('ad'))
        r.append({
            "nccAdId": a['nccAdId'], "nccAdGroupId": a['nccAdgroupId'], "type": a.get('type','TEXT'), 
            "headline": d.get('headline','-'), "description": d.get('description','-'), 
            "pcUrl": d.get('pc',{}).get('final',''), "mobileUrl": d.get('mobile',{}).get('final',''), 
            "status": a.get('userLock', False)
        })
    return r

def format_extension(e):
    e['extension'] = safe_json_parse(e.get('adExtension'))
    return e

# --- 로그 파일 (Lock 추가) ---
VISIT_LOG_FILE = "visits.json"
log_lock = threading.Lock()

def save_visit_logs(logs):
    with log_lock:
        with open(VISIT_LOG_FILE, "w", encoding="utf-8") as f:
            json.dump(logs[:1000], f, ensure_ascii=False, indent=2)

mimetypes.init()
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/css', '.css')

# ==========================================
# 4. FastAPI App
# ==========================================
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.post("/auth/register", response_model=UserOut)
def register(user: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == user.username).first():
        raise HTTPException(status_code=400, detail="ID Exists")
    new_user = User(
        username=user.username, hashed_password=get_password_hash(user.password),
        name=user.name, phone=user.phone, is_paid=False, is_superuser=(db.query(User).count()==0)
    )
    db.add(new_user); db.commit(); db.refresh(new_user)
    return new_user

@app.post("/auth/token", response_model=Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"access_token": create_access_token(data={"sub": user.username}), "token_type": "bearer"}

@app.get("/users/me", response_model=UserOut)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.put("/users/me/keys")
def update_keys(k: UserUpdateKeys, u: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    u.naver_access_key = k.naver_access_key.strip()
    u.naver_secret_key = k.naver_secret_key.strip()
    u.naver_customer_id = str(k.naver_customer_id).strip()
    db.commit()
    return {"status": "success"}

# [추가] 클라이언트 앱용 라이센스 체크 API
@app.get("/api/license/check")
def check_license(u: User = Depends(get_current_user)):
    if not u.is_active: raise HTTPException(status_code=403, detail="Account Suspended")
    if not u.is_paid and not u.is_superuser: raise HTTPException(status_code=403, detail="Subscription Expired")
    return {"status": "active", "user": u.name}

# --- 관리자 API ---
@app.get("/admin/users", response_model=List[UserOut])
def all_users(u: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    return db.query(User).all()

@app.put("/admin/approve/{uid}")
def approve(uid: int, months: int=Query(1), u: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    t = db.query(User).filter(User.id==uid).first()
    t.is_paid=True; t.subscription_expiry=datetime.now()+timedelta(days=30*months); db.commit()
    return {"status":"success"}

@app.put("/admin/revoke/{uid}")
def revoke(uid: int, u: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    t = db.query(User).filter(User.id==uid).first()
    t.is_paid=False; db.commit()
    return {"status":"success"}

# --- 기존 웹사이트 기능 복구 (모든 엔드포인트 유지) ---
@app.post("/api/track/visit")
async def track_visit(req: Request, db: Session = Depends(get_db)):
    try:
        b = await req.json(); ip = req.headers.get("x-forwarded-for") or req.client.host
        if "," in ip: ip = ip.split(",")[0].strip()
        url = b.get("url",""); ref = b.get("referrer",""); type_ = "DIRECT"; kwd = "-"
        if "n_keyword" in url or "n_query" in url:
            type_ = "AD"
            try: kwd = urllib.parse.unquote(url.split("n_keyword=")[1].split("&")[0] if "n_keyword=" in url else url.split("n_query=")[1].split("&")[0])
            except: pass
        elif "naver.com" in ref: type_ = "ORGANIC"
        db.add(VisitLog(ip=ip, type=type_, keyword=kwd, url=url, referrer=ref)); db.commit()
        return {"success": True}
    except: return {"success": False}

@app.get("/api/track/logs")
def get_logs(db: Session = Depends(get_db)):
    logs = db.query(VisitLog).order_by(VisitLog.timestamp.desc()).limit(1000).all()
    return [{"id":str(l.id),"timestamp":l.timestamp.strftime("%Y-%m-%d %H:%M:%S"),"ip":l.ip,"type":l.type,"keyword":l.keyword,"url":l.url,"referrer":l.referrer} for l in logs]

@app.post("/api/log/save")
def save_logs(items: List[LogItem]):
    try:
        if not os.path.exists("logs"): os.makedirs("logs")
        fn = f"logs/log_{datetime.now().strftime('%Y-%m-%d')}.csv"
        with open(fn, 'a', newline='', encoding='utf-8-sig') as f:
            w = csv.writer(f)
            if not os.path.isfile(fn): w.writerow(["시간","키워드","기존","변경","변동","사유"])
            for i in items: w.writerow([i.time, i.keyword, i.oldBid, i.newBid, i.newBid-i.oldBid, i.reason])
        return {"status": "success"}
    except: return {"status": "error"}

@app.get("/api/campaigns")
def list_camps(u: User = Depends(get_current_active_user)):
    auth = get_naver_auth(u)
    c = call_api_sync(("GET", "/ncc/campaigns", None, None, auth)) or []
    s = fetch_stats([x['nccCampaignId'] for x in c], auth)
    return [{**x, "stats": format_stats(s.get(x['nccCampaignId']))} for x in c]

@app.get("/api/adgroups")
def list_groups(campaign_id: str, u: User = Depends(get_current_active_user)):
    auth = get_naver_auth(u)
    g = call_api_sync(("GET", "/ncc/adgroups", {'nccCampaignId': campaign_id}, None, auth)) or []
    s = fetch_stats([x['nccAdgroupId'] for x in g], auth)
    return [{**x, "stats": format_stats(s.get(x['nccAdgroupId']))} for x in g]

@app.get("/api/keywords")
def list_keywords(adgroup_id: str, u: User = Depends(get_current_active_user)):
    # 웹에서는 조회만 빠르게 수행 (입찰은 클라이언트에서)
    auth = get_naver_auth(u)
    k = call_api_sync(("GET", "/ncc/keywords", {'nccAdgroupId': adgroup_id}, None, auth)) or []
    s = fetch_stats([x['nccKeywordId'] for x in k], auth)
    return [{
        "nccKeywordId": x['nccKeywordId'], "nccAdGroupId": x['nccAdgroupId'], "keyword": x['keyword'],
        "bidAmt": x['bidAmt'], "status": x['status'], "managedStatus": "ON" if x['status']=='ELIGIBLE' else "OFF",
        "stats": format_stats(s.get(x['nccKeywordId']))
    } for x in k]

@app.get("/api/ads")
def get_ads(campaign_id: Optional[str]=None, adgroup_id: Optional[str]=None, u: User = Depends(get_current_active_user)):
    auth = get_naver_auth(u)
    if adgroup_id:
        ads = call_api_sync(("GET", "/ncc/ads", {'nccAdgroupId': adgroup_id}, None, auth))
        return convert_ads(ads) if ads else []
    if campaign_id:
        groups = call_api_sync(("GET", "/ncc/adgroups", {'nccCampaignId': campaign_id}, None, auth))
        if not groups: return []
        all_ads = []
        with ThreadPoolExecutor(max_workers=10) as executor:
            fs = [executor.submit(call_api_sync, ("GET", "/ncc/ads", {'nccAdgroupId': g['nccAdgroupId']}, None, auth)) for g in groups]
            for f in as_completed(fs):
                res = f.result()
                if res: all_ads.extend(res)
        return convert_ads(all_ads)
    return []

@app.post("/api/ads")
def create_ad(item: AdCreateItem, u: User = Depends(get_current_active_user)):
    auth = get_naver_auth(u)
    body = {"type": "TEXT_45", "nccAdgroupId": item.adGroupId, "ad": {"headline": item.headline, "description": item.description, "pc": {"final": item.pcUrl}, "mobile": {"final": item.mobileUrl}}}
    res = call_api_sync(("POST", "/ncc/ads", None, body, auth))
    if res: return res
    raise HTTPException(status_code=400, detail="Failed")

@app.post("/api/ads/clone") # [기능 복구] 소재 복제
def clone_ads(item: CloneAdsItem, u: User = Depends(get_current_active_user)):
    auth = get_naver_auth(u)
    src = call_api_sync(("GET", "/ncc/ads", {'nccAdgroupId': item.sourceGroupId}, None, auth))
    if not src: return {"success": 0}
    cnt = 0
    for a in src:
        d = a.get('ad')
        if isinstance(d, str): d = json.loads(d)
        if call_api_sync(("POST", "/ncc/ads", None, {"type": "TEXT_45", "nccAdgroupId": item.targetGroupId, "ad": d}, auth)): cnt += 1
    return {"success": cnt}

@app.get("/api/extensions")
def get_exts(campaign_id: Optional[str]=None, adgroup_id: Optional[str]=None, u: User = Depends(get_current_active_user)):
    auth = get_naver_auth(u)
    if adgroup_id:
        res = call_api_sync(("GET", "/ncc/ad-extensions", {'ownerId': adgroup_id}, None, auth))
        if res: return [format_extension(e) for e in res]
    if campaign_id:
        groups = call_api_sync(("GET", "/ncc/adgroups", {'nccCampaignId': campaign_id}, None, auth))
        if groups:
            all_ext = []
            with ThreadPoolExecutor(max_workers=10) as ex:
                fs = [ex.submit(call_api_sync, ("GET", "/ncc/ad-extensions", {'ownerId': g['nccAdgroupId']}, None, auth)) for g in groups]
                for f in as_completed(fs):
                    r = f.result()
                    if r: all_ext.extend([format_extension(e) for e in r])
            return all_ext
    return []

@app.post("/api/extensions/clone/{new_group_id}") # [기능 복구] 확장소재 복제
def clone_extensions(source_group_id: str, new_group_id: str, u: User = Depends(get_current_active_user)):
    auth = get_naver_auth(u)
    src = call_api_sync(("GET", "/ncc/ad-extensions", {'ownerId': source_group_id}, {}, auth)) or []
    cnt = 0
    for e in src:
        if e['type'] in ["IMAGE_SUB_LINKS", "CATALOG_EXTRA"]: continue
        new = {"ownerId": new_group_id, "type": e['type'], "pcChannelId": e.get('pcChannelId'), "mobileChannelId": e.get('mobileChannelId')}
        if "adExtension" in e: new["adExtension"] = e["adExtension"]
        if call_api_sync(("POST", "/ncc/ad-extensions", None, new, auth)): cnt += 1
    return {"success": cnt}

@app.get("/api/tool/ip-exclusion") # [기능 복구] IP 차단
def get_ip(u: User = Depends(get_current_active_user)):
    return call_api_sync(("GET", "/tool/ip-exclusions", None, None, get_naver_auth(u))) or []

@app.post("/api/tool/ip-exclusion")
def add_ip(item: Dict[str,Any], u: User = Depends(get_current_active_user)):
    auth = get_naver_auth(u)
    curr = call_api_sync(("GET", "/tool/ip-exclusions", None, None, auth)) or []
    curr.append({"ip": item['ip'], "memo": item.get('memo','')})
    call_api_sync(("PUT", "/tool/ip-exclusions", None, json.dumps(curr), auth))
    return {"success": True}

@app.delete("/api/tool/ip-exclusion/{ip}")
def del_ip(ip: str, u: User = Depends(get_current_active_user)):
    auth = get_naver_auth(u)
    curr = call_api_sync(("GET", "/tool/ip-exclusions", None, None, auth)) or []
    new_l = [i for i in curr if i['ip'] != ip]
    call_api_sync(("PUT", "/tool/ip-exclusions", None, json.dumps(new_l), auth))
    return {"success": True}

@app.post("/api/tools/smart-expand") # [기능 복구] 스마트 확장
def smart_expand(item: SmartExpandItem, u: User = Depends(get_current_active_user)):
    auth = get_naver_auth(u)
    src = call_api_sync(("GET", f"/ncc/adgroups/{item.sourceGroupId}", None, None, auth))
    if not src: raise HTTPException(status_code=404, detail="Group Not Found")
    
    # 웹에서는 간단히 키워드 추가만 수행 (무거운 그룹 생성 로직은 클라이언트 권장)
    chunk = [{"nccAdgroupId": src['nccAdgroupId'], "keyword": k, "bidAmt": item.bidAmt or 70, "useGroupBidAmt": False} for k in item.keywords]
    call_api_sync(("POST", "/ncc/keywords", {'nccAdgroupId': src['nccAdgroupId']}, chunk, auth))
    return {"status": "success"}

# --- Static Files ---
if getattr(sys, 'frozen', False):
    dist_path = os.path.join(sys._MEIPASS, "dist")
else:
    base_dir = os.path.dirname(__file__)
    dist_local_path = os.path.join(base_dir, "dist")
    if os.path.exists(dist_local_path) and os.path.exists(os.path.join(dist_local_path, "index.html")):
        dist_path = dist_local_path
    else:
        dist_path = os.path.join(base_dir, "frontend")

if os.path.exists(dist_path) and os.path.exists(os.path.join(dist_path, "index.html")):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="static")
else:
    @app.get("/")
    def root(): return HTMLResponse("<h1>Backend Running (v12.0 Final)</h1>")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_config=None)