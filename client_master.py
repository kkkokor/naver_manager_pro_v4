import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext
import requests, time, hmac, hashlib, base64, urllib.parse, threading, json, re

# [설정] 본부 서버 주소 (대표님 AWS 서버 IP 유지)
SERVER_URL = "http://3.36.126.16:8000"
NAVER_BASE_URL = "https://api.searchad.naver.com"

class NaverClient:
    def __init__(self, ak, sk, cid, logger):
        self.ak = ak.strip(); self.sk = sk.strip(); self.cid = cid.strip()
        self.log = logger

    def call(self, method, uri, params=None, body=None):
        url = NAVER_BASE_URL + uri
        if params: url += "?" + urllib.parse.urlencode(params) # [400에러 해결]
        
        ts = str(int(time.time() * 1000))
        sign = base64.b64encode(hmac.new(bytes(self.sk, "utf-8"), f"{ts}.{method}.{uri}".encode("utf-8"), hashlib.sha256).digest()).decode()
        headers = {"Content-Type": "application/json", "X-Timestamp": ts, "X-API-KEY": self.ak, "X-Customer": self.cid, "X-Signature": sign}

        try:
            if method in ["POST", "PUT"]: resp = requests.request(method, url, json=body, headers=headers)
            else: resp = requests.get(url, headers=headers)
            
            if resp.status_code == 429: self.log("⚠️ 속도제한! 2초 대기..."); time.sleep(2); return None
            if resp.status_code >= 400: self.log(f"❌ 오류[{resp.status_code}]: {resp.text[:100]}"); return None
            return resp.json()
        except Exception as e: self.log(f"⚡ 통신오류: {e}"); return None

class FullApp:
    def __init__(self, root):
        self.root = root; self.root.title("Naver Ad Manager Pro (Client)"); self.root.geometry("1000x700")
        self.token = None; self.api = None; self.is_running = False
        
        # UI 구성
        self.setup_login()
        self.setup_main()

    def log(self, msg):
        timestamp = time.strftime('%H:%M:%S')
        self.log_box.insert(tk.END, f"[{timestamp}] {msg}\n"); self.log_box.see(tk.END)
        # [서버로 로그 전송]
        if self.token:
            threading.Thread(target=self.send_log_to_server, args=(f"[{timestamp}] {msg}",), daemon=True).start()

    def send_log_to_server(self, msg):
        try: requests.post(f"{SERVER_URL}/api/client/log", json={"action":"LOG", "details":msg}, headers={"Authorization": f"Bearer {self.token}"})
        except: pass

    def setup_login(self):
        self.f_login = tk.Frame(self.root)
        tk.Label(self.f_login, text="통합 로그인", font=("Arial", 20)).pack(pady=20)
        self.e_id = tk.Entry(self.f_login); self.e_id.pack(pady=5); self.e_id.insert(0, "ID 입력")
        self.e_pw = tk.Entry(self.f_login, show="*"); self.e_pw.pack(pady=5)
        tk.Button(self.f_login, text="로그인", command=self.login, width=20, bg="#007bff", fg="white").pack(pady=20)
        self.f_login.pack(fill="both", expand=True)

    def login(self):
        try:
            res = requests.post(f"{SERVER_URL}/auth/token", data={"username": self.e_id.get(), "password": self.e_pw.get()})
            if res.status_code == 200:
                self.token = res.json()["access_token"]
                if self.check_license():
                    self.f_login.pack_forget(); self.f_main.pack(fill="both", expand=True)
                    self.log("✅ 로그인 성공. API 정보를 입력하세요.")
            else: messagebox.showerror("실패", "계정 정보 확인")
        except: messagebox.showerror("오류", "서버 연결 불가")

    def check_license(self):
        try: return requests.get(f"{SERVER_URL}/api/license/check", headers={"Authorization": f"Bearer {self.token}"}).status_code == 200
        except: return False

    def setup_main(self):
        self.f_main = tk.Frame(self.root)
        
        # 상단 API 설정
        top = tk.Frame(self.f_main, pady=10); top.pack(fill="x")
        tk.Label(top, text="Access Key:").pack(side="left"); self.ak = tk.Entry(top, width=20); self.ak.pack(side="left", padx=5)
        tk.Label(top, text="Secret Key:").pack(side="left"); self.sk = tk.Entry(top, width=20, show="*"); self.sk.pack(side="left", padx=5)
        tk.Label(top, text="Customer ID:").pack(side="left"); self.cid = tk.Entry(top, width=15); self.cid.pack(side="left", padx=5)
        tk.Button(top, text="API 연결", command=self.connect).pack(side="left", padx=10)

        # 탭
        self.tabs = ttk.Notebook(self.f_main)
        self.tab_bid = tk.Frame(self.tabs); self.tabs.add(self.tab_bid, text="🤖 자동 입찰")
        self.tab_clone = tk.Frame(self.tabs); self.tabs.add(self.tab_clone, text="🧬 소재/확장 복사")
        self.tab_smart = tk.Frame(self.tabs); self.tabs.add(self.tab_smart, text="🧠 스마트 확장")
        self.tabs.pack(fill="both", expand=True)

        # 각 탭 UI 구성 호출
        self.setup_bid_ui()
        self.setup_clone_ui()
        self.setup_smart_ui()

        self.log_box = scrolledtext.ScrolledText(self.f_main, height=10); self.log_box.pack(fill="x")

    def connect(self):
        self.api = NaverClient(self.ak.get(), self.sk.get(), self.cid.get(), self.log)
        if self.api.call("GET", "/ncc/campaigns"): self.log("✅ API 연결 성공")
        else: self.log("❌ API 연결 실패")

    # --- 1. 자동 입찰 (기능) ---
    def setup_bid_ui(self):
        f = self.tab_bid
        tk.Label(f, text="목표 순위:").pack(pady=5)
        self.bid_rank = tk.Entry(f); self.bid_rank.pack(); self.bid_rank.insert(0, "3")
        tk.Button(f, text="▶ 입찰 시작", command=self.start_bid, bg="green", fg="white").pack(pady=10)
        tk.Button(f, text="⏹ 중지", command=self.stop_bid, bg="red", fg="white").pack()

    def start_bid(self): self.is_running=True; threading.Thread(target=self.loop_bid, daemon=True).start()
    def stop_bid(self): self.is_running=False; self.log("중지 요청")

    def loop_bid(self):
        self.log("🚀 입찰 로직 가동")
        while self.is_running:
            if not self.check_license(): self.is_running=False; break
            camps = self.api.call("GET", "/ncc/campaigns") or []
            for c in camps:
                if not self.is_running: break
                grps = self.api.call("GET", "/ncc/adgroups", {"nccCampaignId": c['nccCampaignId']}) or []
                for g in grps:
                    kwds = self.api.call("GET", "/ncc/keywords", {"nccAdgroupId": g['nccAdgroupId']}) or []
                    self.log(f"그룹 [{g['name']}] - 키워드 {len(kwds)}개 처리 중")
                    
                    ids = [k['nccKeywordId'] for k in kwds]
                    for i in range(0, len(ids), 50):
                        if not self.is_running: break
                        chunk = ids[i:i+50]
                        est = self.api.call("POST", "/estimate/average-position-bid/id", body={"device":"MOBILE", "items":[{"key":k, "position":int(self.bid_rank.get())} for k in chunk]})
                        if est:
                            for e in est.get('estimate', []):
                                kid = e.get('nccKeywordId') or e.get('keywordId')
                                bid = e.get('bid', 0)
                                curr = next((k for k in kwds if k['nccKeywordId'] == kid), None)
                                if curr and curr['bidAmt'] != bid:
                                    self.api.call("PUT", f"/ncc/keywords/{kid}", params={"fields":"bidAmt"}, body={"nccAdgroupId": g['nccAdgroupId'], "bidAmt": bid, "useGroupBidAmt": False})
                                    time.sleep(0.05)
            time.sleep(10)

    # --- 2. 소재/확장소재 복사 (누락되었던 기능 복구) ---
    def setup_clone_ui(self):
        f = self.tab_clone
        tk.Label(f, text="[ 소재 & 확장소재 복사 ]", font=("Bold", 12)).pack(pady=10)
        tk.Label(f, text="원본 그룹 ID (grp-...)").pack()
        self.src_grp = tk.Entry(f); self.src_grp.pack()
        tk.Label(f, text="대상 그룹 ID (grp-...)").pack()
        self.tgt_grp = tk.Entry(f); self.tgt_grp.pack()
        tk.Button(f, text="🚀 복사 실행", command=self.run_clone).pack(pady=10)

    def run_clone(self):
        threading.Thread(target=self._clone_logic, daemon=True).start()

    def _clone_logic(self):
        src, tgt = self.src_grp.get(), self.tgt_grp.get()
        self.log(f"복사 시작: {src} -> {tgt}")
        
        # 1. 소재 복사
        ads = self.api.call("GET", "/ncc/ads", {"nccAdgroupId": src}) or []
        for a in ads:
            d = a['ad']
            if isinstance(d, str): d = json.loads(d)
            res = self.api.call("POST", "/ncc/ads", body={"type": "TEXT_45", "nccAdgroupId": tgt, "ad": d})
            if res: self.log(f"소재 복사 완료 ({a['nccAdId']})")
            time.sleep(0.1)

        # 2. 확장소재 복사
        exts = self.api.call("GET", "/ncc/ad-extensions", {"ownerId": src}) or []
        skip = ["SHOPPING_EXTRA", "IMAGE_SUB_LINKS", "CATALOG_IMAGE"]
        for e in exts:
            if e['type'] in skip: continue
            new = {"ownerId": tgt, "type": e['type'], "pcChannelId": e.get('pcChannelId'), "mobileChannelId": e.get('mobileChannelId')}
            if "adExtension" in e: new["adExtension"] = e["adExtension"]
            res = self.api.call("POST", "/ncc/ad-extensions", body=new)
            if res: self.log(f"확장소재({e['type']}) 복사 완료")
            time.sleep(0.1)
        self.log("✅ 모든 복사 작업 완료")

    # --- 3. 스마트 키워드 확장 (누락되었던 기능 복구) ---
    def setup_smart_ui(self):
        f = self.tab_smart
        tk.Label(f, text="[ 스마트 키워드 확장 ]", font=("Bold", 12)).pack(pady=10)
        tk.Label(f, text="기준 그룹 ID").pack(); self.base_grp = tk.Entry(f); self.base_grp.pack()
        tk.Label(f, text="추가할 키워드 (콤마 구분)").pack(); self.kwd_list = tk.Text(f, height=5); self.kwd_list.pack()
        tk.Button(f, text="🚀 스마트 확장 시작", command=self.run_smart).pack(pady=10)

    def run_smart(self):
        threading.Thread(target=self._smart_logic, daemon=True).start()

    def _smart_logic(self):
        base_id = self.base_grp.get()
        keywords = [k.strip() for k in self.kwd_list.get("1.0", tk.END).split(",") if k.strip()]
        self.log(f"스마트 확장 시작: 총 {len(keywords)}개 키워드")

        grp = self.api.call("GET", f"/ncc/adgroups/{base_id}")
        if not grp: self.log("❌ 기준 그룹을 찾을 수 없음"); return
        
        camp_id = grp['nccCampaignId']
        base_name = re.sub(r'_\d+$', '', grp['name'])
        curr_grp_id = base_id
        idx = 1
        
        while keywords:
            curr_kwds = self.api.call("GET", "/ncc/keywords", {"nccAdgroupId": curr_grp_id}) or []
            space = 1000 - len(curr_kwds)
            
            if space > 0:
                chunk = keywords[:space]
                keywords = keywords[space:]
                body = [{"nccAdgroupId": curr_grp_id, "keyword": k, "bidAmt": 70, "useGroupBidAmt": False} for k in chunk]
                self.api.call("POST", "/ncc/keywords", params={"nccAdgroupId": curr_grp_id}, body=body)
                self.log(f"그룹({curr_grp_id})에 {len(chunk)}개 추가함")
            
            if keywords:
                idx += 1
                new_name = f"{base_name}_{idx}"
                self.log(f"새 그룹 생성 시도: {new_name}")
                new_grp = self.api.call("POST", "/ncc/adgroups", body={"nccCampaignId": camp_id, "name": new_name})
                
                if new_grp:
                    curr_grp_id = new_grp['nccAdgroupId']
                    ads = self.api.call("GET", "/ncc/ads", {"nccAdgroupId": base_id}) or []
                    for a in ads:
                        d = a['ad']; 
                        if isinstance(d, str): d = json.loads(d)
                        self.api.call("POST", "/ncc/ads", body={"type": "TEXT_45", "nccAdgroupId": curr_grp_id, "ad": d})
                    self.log(f"새 그룹({new_name}) 세팅 완료")
                else:
                    self.log("❌ 그룹 생성 실패"); break
                    
        self.log("✅ 스마트 확장 작업 끝")

if __name__ == "__main__":
    root = tk.Tk()
    app = FullApp(root)
    root.mainloop()