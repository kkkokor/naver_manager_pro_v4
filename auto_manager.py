import time
import hmac
import hashlib
import base64
import requests
import json
import sys
from datetime import datetime, timedelta

# ==========================================
# 1. 사용자 설정 (필수 입력)
# ==========================================
# 여기에 실제 API 정보를 입력하세요
API_KEY = "0100000000037acfdd9bb5eb3add3472c284497545a01b0eb704a159ed43cdbfe45c6d63ce"
SECRET_KEY = "AQAAAAADes/dm7XrOt00csKESXVFT+VT/OzcmqH7h8RCPzW0/g=="
CUSTOMER_ID = "3423631"

BASE_URL = "https://api.searchad.naver.com"

# ==========================================
# 2. 전략 및 안전 설정
# ==========================================
DRY_RUN = False         # True: 시뮬레이션(로그만 출력), False: 실제 반영
TARGET_RANK = 3.0      # 목표 순위
MAX_BID_CAP = 10000    # 입찰가 상한선
MIN_BID_CAP = 70       # 최소 입찰가
PROBE_LIMIT = 3000     # 탐색 입찰 한계값 (이 금액 이상은 순위 0이어도 인상 안 함)
BID_STEP = 300         # 입찰가 조정 단위

# ==========================================
# 3. API 유틸리티 (서버 통신용)
# ==========================================
def get_header(method, uri):
    timestamp = str(round(time.time() * 1000))
    message = "{}.{}.{}".format(timestamp, method, uri)
    hash = hmac.new(bytes(SECRET_KEY, "utf-8"), bytes(message, "utf-8"), hashlib.sha256)
    signature = base64.b64encode(hash.digest()).decode()
    return {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Timestamp": timestamp,
        "X-API-KEY": API_KEY,
        "X-Customer": str(CUSTOMER_ID), 
        "X-Signature": signature
    }

def call_api(uri, method="GET", params=None, body=None):
    headers = get_header(method, uri)
    try:
        if method == "GET":
            resp = requests.get(BASE_URL + uri, params=params, headers=headers)
        elif method == "PUT":
            resp = requests.put(BASE_URL + uri, params=params, json=body, headers=headers)
        
        if resp.status_code == 200:
            return resp.json()
        else:
            # 에러 발생 시 간단한 로그 출력 (필요 시 주석 해제)
            # print(f"⚠️ API 에러 ({uri}): {resp.status_code} {resp.text[:100]}")
            return None
    except Exception as e:
        print(f"❌ 통신 오류: {e}")
        return None

# ==========================================
# 4. 조회 함수들
# ==========================================
def get_adgroups_in_campaign(campaign_id):
    return call_api("/ncc/adgroups", params={'nccCampaignId': campaign_id}) or []

def get_adgroup_detail(adgroup_id):
    return call_api(f"/ncc/adgroups/{adgroup_id}")

def get_keywords(adgroup_id):
    return call_api("/ncc/keywords", params={'nccAdgroupId': adgroup_id}) or []

def get_ads(adgroup_id):
    return call_api("/ncc/ads", params={'nccAdgroupId': adgroup_id}) or []

# ==========================================
# 5. [기능 1] 스마트 자동 입찰 로직
# ==========================================
def get_current_ranks(keyword_ids):
    """
    3단계 순위 조회: 오늘 -> 어제 -> 30일(timeRange)
    """
    if not keyword_ids: return {}
    final_rank_map = {}
    chunk_size = 50
    
    print("   📊 순위 데이터 분석 중...", end="\r")
    
    for i in range(0, len(keyword_ids), chunk_size):
        chunk = keyword_ids[i:i + chunk_size]
        ids_str = ",".join(chunk)
        chunk_ranks = {k_id: 0.0 for k_id in chunk}
        
        # 1. 오늘
        data = call_api("/stats", params={'ids': ids_str, 'fields': '["avgRnk"]', 'datePreset': 'today'})
        if data and 'data' in data:
            for item in data['data']:
                chunk_ranks[item['id']] = item.get('avgRnk', 0.0)

        # 2. 어제 (데이터 없는 것만)
        data = call_api("/stats", params={'ids': ids_str, 'fields': '["avgRnk"]', 'datePreset': 'yesterday'})
        if data and 'data' in data:
            for item in data['data']:
                if chunk_ranks.get(item['id'], 0.0) == 0.0:
                    chunk_ranks[item['id']] = item.get('avgRnk', 0.0)

        # 3. 지난 30일 (timeRange)
        today = datetime.now()
        yesterday = today - timedelta(days=1)
        past_30 = today - timedelta(days=30)
        time_range = {
            "since": past_30.strftime("%Y-%m-%d"),
            "until": yesterday.strftime("%Y-%m-%d")
        }
        params_30 = {
            'ids': ids_str,
            'fields': '["avgRnk"]',
            'timeRange': json.dumps(time_range)
        }
        
        data = call_api("/stats", params=params_30)
        if data and 'data' in data:
            for item in data['data']:
                if chunk_ranks.get(item['id'], 0.0) == 0.0:
                    chunk_ranks[item['id']] = item.get('avgRnk', 0.0)
        
        time.sleep(0.05) # API 부하 방지
        final_rank_map.update(chunk_ranks)
        
    return final_rank_map

def update_keyword_bid(keyword_id, new_bid):
    return call_api(f"/ncc/keywords/{keyword_id}", method="PUT", params={'fields': 'bidAmt'}, body={"bidAmt": new_bid, "useGroupBidAmt": False})

def run_auto_bidder(target_id):
    if "cmp-" in target_id:
        groups = get_adgroups_in_campaign(target_id)
        print(f"🔍 캠페인 내 {len(groups)}개 광고그룹을 찾았습니다.")
    else:
        grp = get_adgroup_detail(target_id)
        groups = [grp] if grp else []

    if not groups:
        print("❌ 조회된 대상이 없습니다.")
        return

    print(f"\n🚀 스마트 입찰 시작 (목표: {TARGET_RANK}위 | 탐색한도: {PROBE_LIMIT:,}원)")
    
    total_changed = 0
    for grp in groups:
        gid = grp['nccAdgroupId']
        gname = grp['name']
        gbid = grp.get('bidAmt', 0)
        
        print(f"\n📂 그룹: [{gname}] (기본가: {gbid:,}원)")
        keywords = get_keywords(gid)
        if not keywords: continue
        
        kwd_ids = [k['nccKeywordId'] for k in keywords]
        ranks = get_current_ranks(kwd_ids)
        
        print(f"   {'키워드':<15} | {'순위':^5} | {'현재가':^9} | {'조정가':^9} | {'판단'}")
        print("   " + "-"*70)
        
        for k in keywords:
            kid = k['nccKeywordId']
            kname = k['keyword']
            
            # 실제 입찰가 (그룹가 사용 여부 체크)
            cur_bid = gbid if k.get('useGroupBidAmt', False) else k['bidAmt']
            source = "(G)" if k.get('useGroupBidAmt', False) else ""
            
            cur_rank = ranks.get(kid, 0.0)
            new_bid = cur_bid
            action = "유지"
            reason = ""
            
            # [알고리즘]
            if cur_rank == 0.0:
                if cur_bid < PROBE_LIMIT:
                    new_bid = cur_bid + BID_STEP
                    action = "❓탐색"
                    reason = "노출유도"
                else:
                    new_bid = cur_bid
                    action = "유지"
                    reason = "데이터지연"
            elif cur_rank > TARGET_RANK:
                new_bid = cur_bid + BID_STEP
                action = "🔺인상"
                reason = f"순위밀림({cur_rank})"
            elif cur_rank < TARGET_RANK:
                if cur_bid > MIN_BID_CAP:
                    new_bid = cur_bid - BID_STEP
                    action = "🔻인하"
                    reason = f"과잉노출({cur_rank})"
                else:
                    reason = "최소금액"

            # 안전장치
            if new_bid > MAX_BID_CAP: new_bid = MAX_BID_CAP
            if new_bid < MIN_BID_CAP: new_bid = MIN_BID_CAP
            if new_bid == cur_bid: action = "유지"
            
            if action != "유지":
                arrow = "🔼" if new_bid > cur_bid else "🔽"
                print(f"   {kname:<15} | {cur_rank:^5.1f} | {cur_bid:>8,}{source:<1} | {new_bid:>8,} | {arrow} {reason}", end="")
                
                if DRY_RUN:
                    print(" (Sim)")
                else:
                    res = update_keyword_bid(kid, new_bid)
                    if res:
                        print(" (✅)")
                        total_changed += 1
                    else:
                        print(" (❌)")
                    time.sleep(0.1)
    
    print(f"\n🏁 입찰 종료. 총 {total_changed}건 변경됨.")

# ==========================================
# 6. [기능 2] 그룹 기본 입찰가 일괄 변경
# ==========================================
def update_all_group_bids(campaign_id):
    new_bid = input("👉 변경할 금액 입력 (예: 100): ")
    if not new_bid.isdigit(): return
    new_bid = int(new_bid)
    
    groups = get_adgroups_in_campaign(campaign_id)
    print(f"✅ {len(groups)}개 그룹 발견.")
    
    if DRY_RUN:
        print(f"🛑 [시뮬레이션] {new_bid}원으로 변경 예정.")
        return

    if input("실제 변경할까요? (y/n): ") != 'y': return

    count = 0
    for grp in groups:
        res = call_api(f"/ncc/adgroups/{grp['nccAdgroupId']}", method="PUT", params={'fields': 'bidAmt'}, body={'bidAmt': new_bid})
        if res: count += 1
        print(".", end="")
        time.sleep(0.1)
    print(f"\n🏁 {count}개 변경 완료.")

# ==========================================
# 7. [기능 3] 소재 그룹핑 및 일괄 관리
# ==========================================
def manage_creatives_grouped(campaign_id):
    print(f"\n🔍 캠페인 내 모든 소재를 분석 중입니다...")
    groups = get_adgroups_in_campaign(campaign_id)
    
    creative_map = {}
    total_ads_count = 0
    
    for grp in groups:
        ads = get_ads(grp['nccAdgroupId'])
        for ad in ads:
            inspect = ad.get('ad', {})
            headline = inspect.get('headline', '제목없음')
            desc = inspect.get('description', '설명없음')
            signature = f"[{headline}] {desc}"
            
            if signature not in creative_map:
                creative_map[signature] = []
            
            creative_map[signature].append({
                'id': ad['nccAdId'],
                'group': grp['name'],
                'status': ad['userLock']
            })
            total_ads_count += 1
        time.sleep(0.05)

    print(f"✅ 총 {total_ads_count}개의 소재를 {len(creative_map)}가지 유형으로 분류했습니다.\n")

    idx_map = {}
    for i, (sig, ads_list) in enumerate(creative_map.items()):
        idx_map[i+1] = sig
        on_cnt = sum(1 for a in ads_list if not a['status'])
        off_cnt = len(ads_list) - on_cnt
        print(f"[{i+1}] {sig[:40]}... (총 {len(ads_list)}개 | ON:{on_cnt}, OFF:{off_cnt})")

    choice = input("\n👉 관리할 소재 번호를 선택하세요 (0: 취소): ")
    if not choice.isdigit() or int(choice) == 0: return
    
    target_sig = idx_map.get(int(choice))
    if not target_sig: return
    
    target_ads = creative_map[target_sig]
    print(f"\n🎯 선택된 소재: {target_sig}")
    
    action = input("👉 동작 선택 (1: 모두 켜기 / 2: 모두 끄기): ")
    if action not in ['1', '2']: return
    
    target_lock = False if action == '1' else True
    status_str = "ON(활성)" if action == '1' else "OFF(중지)"

    if DRY_RUN:
        print(f"🛑 [시뮬레이션] {len(target_ads)}개 소재를 {status_str} 상태로 변경합니다.")
        return

    if input(f"⚠️ 실제 {len(target_ads)}개 소재를 {status_str} 하시겠습니까? (y/n): ") != 'y': return

    success_cnt = 0
    for item in target_ads:
        if item['status'] == target_lock: continue
        print(f"   - {item['group']} 소재 변경 중...", end="")
        res = call_api(f"/ncc/ads/{item['id']}", method="PUT", params={'fields': 'userLock'}, body={'userLock': target_lock})
        if res:
            print(" 성공")
            success_cnt += 1
        else:
            print(" 실패")
        time.sleep(0.1)
    print(f"\n🏁 {success_cnt}개 소재 상태 변경 완료.")

# ==========================================
# 8. 메인 메뉴
# ==========================================
def main():
    print("\n" + "="*50)
    print("   📢 네이버 검색광고 통합 매니저 V2")
    print(f"   현재 모드: {'🛑 시뮬레이션 (DRY_RUN=True)' if DRY_RUN else '✅ 실제 집행 (DRY_RUN=False)'}")
    print("="*50)
    print("1. 🚀 스마트 자동 입찰 (순위기반 + 탐색)")
    print("2. 💰 그룹 기본 입찰가 일괄 변경")
    print("3. 🎨 소재(Creative) 그룹핑 일괄 관리")
    print("0. 종료")
    
    menu = input("👉 메뉴 선택: ")
    if menu == "0": sys.exit()
    
    target_id = input("👉 캠페인 ID (cmp-...) 또는 그룹 ID 입력: ").strip()
    if not target_id: return

    if menu == "1":
        run_auto_bidder(target_id)
    elif menu == "2":
        if "cmp-" not in target_id:
            print("❌ 캠페인 ID가 필요합니다.")
            return
        update_all_group_bids(target_id)
    elif menu == "3":
        if "cmp-" not in target_id:
            print("❌ 캠페인 ID가 필요합니다.")
            return
        manage_creatives_grouped(target_id)

if __name__ == "__main__":
    main()