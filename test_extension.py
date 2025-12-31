import requests

# API URL
url = "http://localhost:3000/api/extensions"

# 헤더 추가하기
headers = {
    "x-naver-access-key": "0100000000037acfdd9bb5eb3add3472c284497545a01b0eb704a159ed43cdbfe45c6d63ce",  # 실제 API Key
    "x-naver-secret-key": "AQAAAAADes/dm7XrOt00csKESXVFT+VT/OzcmqH7h8RCPzW0/g==",  # 실제 Secret Key
    "x-naver-customer-id": "3423631",  # 실제 Customer ID
    "Content-Type": "application/json"
}

# JSON 데이터
data = {
    "ownerId": "grp-a001-01-000000059776717",  # 광고 그룹 ID
    "adGroupId": "grp-a001-01-000000059776717",  # 추가 필수 필드
    "type": "SUB_LINKS",  # 확장 소재 타입
    "pcChannelId": "bsn-a001-00-000000011737938",  # PC 채널 ID
    "mobileChannelId": "bsn-a001-00-000000011737938",  # 모바일 채널 ID
    "adExtension": {  # 확장소재 세부 정보
        "links": [
            {
                "linkName": "Example Link",
                "pcUrl": "https://example.com",
                "mobileUrl": "https://m.example.com"
            }
        ]
    }
}

# HTTP 요청 보내기
response = requests.post(url, headers=headers, json=data)

# 결과 확인
if response.status_code == 200:
    print("Success:", response.json())  # 성공 시 JSON 결과 출력
else:
    print("Failed:", response.status_code, response.text)  # 실패 시 상태 코드와 응답 내용 출력