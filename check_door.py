import time
import hmac
import hashlib
import base64
import requests
import urllib.parse

# ▼▼▼ 여기에 대표님 키를 넣어주세요 ▼▼▼
ACCESS_LICENSE = "0100000000037acfdd9bb5eb3add3472c284497545a01b0eb704a159ed43cdbfe45c6d63ce"
SECRET_KEY = "AQAAAAADes/dm7XrOt00csKESXVFT+VT/OzcmqH7h8RCPzW0/g=="
CUSTOMER_ID = "3423631"
# ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

BASE_URL = "https://api.searchad.naver.com"

def get_header(method, uri):
    timestamp = str(int(time.time() * 1000))
    raw = f"{timestamp}.{method}.{uri}"
    hash_obj = hmac.new(SECRET_KEY.encode("utf-8"), raw.encode("utf-8"), hashlib.sha256)
    signature = base64.b64encode(hash_obj.digest()).decode("utf-8")
    
    return {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Timestamp": timestamp,
        "X-API-KEY": ACCESS_LICENSE,
        "X-Customer": str(CUSTOMER_ID),
        "X-Signature": signature
    }

def knock_knock():
    print("🕵️‍♂️ 네이버 API 문이 열렸나 조용히 확인해봅니다...")
    
    # 가장 가벼운 API 하나만 찔러봅니다 (캠페인 목록 조회)
    uri = "/ncc/campaigns"
    try:
        res = requests.get(BASE_URL + uri, headers=get_header("GET", uri), timeout=5)
        
        if res.status_code == 200:
            print(f"\n✅ [성공] 문 열렸습니다! (Status: 200)")
            print(f"👉 서버를 켜셔도 좋습니다. (단, 속도 제한 코드는 필수!)")
            return True
        elif res.status_code == 429:
            print(f"\n⚠️ [대기] 아직 과속 딱지(429)가 남아있습니다.")
            print("👉 조금 더 기다리셔야 합니다.")
        else:
            print(f"\n🚫 [차단] 아직 문이 닫혀있습니다. (Status: {res.status_code})")
            print(f"에러 메시지: {res.text}")
            print("👉 내일 아침에 하시는 게 안전합니다.")
            
    except requests.exceptions.ConnectionError:
        print("\n🚫 [차단] 연결 자체가 거부되었습니다 (Connection Reset).")
        print("👉 아직 보안요원이 지키고 있습니다. 더 쉬어야 합니다.")
    except Exception as e:
        print(f"\n❌ 알 수 없는 오류: {e}")

    return False

if __name__ == "__main__":
    knock_knock()