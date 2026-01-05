import { Campaign, AdGroup, Keyword, Ad, BusinessChannel, Extension, User, LoginResponse } from '../types';

const API_BASE_URL = 'http://localhost:8000';

export interface LogItem {
  time: string;
  keyword: string;
  oldBid: number;
  newBid: number;
  reason: string;
}

// [핵심] 토큰 관리 및 헤더 생성 함수
const getToken = () => localStorage.getItem('access_token');
const setToken = (token: string) => localStorage.setItem('access_token', token);
const removeToken = () => localStorage.removeItem('access_token');

// [핵심] 모든 요청에 '신분증(토큰)'을 자동으로 붙이는 함수
const getHeaders = () => {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export const naverService = {
  // ==========================================
  // [신규] 인증(Auth) & 관리자 기능
  // ==========================================
  
  // 로그인
  async login(formData: FormData): Promise<LoginResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/token`, {
      method: 'POST',
      body: formData, // FormData는 Content-Type을 자동 설정하므로 getHeaders 사용 안 함
    });
    if (!response.ok) throw new Error('로그인 실패');
    const data = await response.json();
    setToken(data.access_token);
    return data;
  },

  // 회원가입
  async register(data: any): Promise<User> {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || '회원가입 실패');
    }
    return response.json();
  },

  // 내 정보 조회
  async getMe(): Promise<User> {
    const response = await fetch(`${API_BASE_URL}/users/me`, { headers: getHeaders() });
    if (!response.ok) throw new Error('내 정보 조회 실패');
    return response.json();
  },

  // API 키 서버에 저장 (암호화용)
  async saveApiKeys(keys: { naver_access_key: string; naver_secret_key: string; naver_customer_id: string }) {
    const response = await fetch(`${API_BASE_URL}/users/me/keys`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(keys),
    });
    if (!response.ok) throw new Error('API 키 저장 실패');
    return response.json();
  },

  // 로그아웃
  logout() {
    removeToken();
  },

  // [관리자] 전체 유저 조회
  async getUsers(): Promise<User[]> {
    const response = await fetch(`${API_BASE_URL}/admin/users`, { headers: getHeaders() });
    if (!response.ok) throw new Error('권한이 없습니다.');
    return response.json();
  },

  // [관리자] 유저 승인
  async approveUser(userId: number) {
    const response = await fetch(`${API_BASE_URL}/admin/approve/${userId}`, { 
      method: 'PUT', 
      headers: getHeaders() 
    });
    if (!response.ok) throw new Error('승인 처리에 실패했습니다.');
    return response.json();
  },

  // ==========================================
  // [기존 기능 유지] 비즈니스 로직 (Headers 교체됨)
  // ==========================================

  // 캠페인 목록
  async getCampaigns(): Promise<Campaign[]> {
    const res = await fetch(`${API_BASE_URL}/api/campaigns`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch campaigns');
    return res.json();
  },

  // 광고그룹 목록
  async getAdGroups(campaignId: string): Promise<AdGroup[]> {
    const res = await fetch(`${API_BASE_URL}/api/adgroups?campaign_id=${campaignId}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch adgroups');
    return res.json();
  },

  // 광고그룹 생성
  async createAdGroup(nccCampaignId: string, name: string): Promise<AdGroup> {
    const res = await fetch(`${API_BASE_URL}/api/adgroups`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ nccCampaignId, name }),
    });
    if (!res.ok) throw new Error('Failed to create adgroup');
    return res.json();
  },

  // 키워드 목록
  async getKeywords(adGroupId: string, device: string, targetRank: number = 3): Promise<Keyword[]> {
    // device 파라미터가 비어있을 경우 대비
    const deviceParam = device || 'MOBILE';
    const res = await fetch(`${API_BASE_URL}/api/keywords?adgroup_id=${adGroupId}&device=${deviceParam}&target_rank=${targetRank}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch keywords');
    return res.json();
  },

  // 소재 목록
  async getAds(campaignId?: string, adGroupId?: string): Promise<Ad[]> {
    let url = `${API_BASE_URL}/api/ads`;
    const params = new URLSearchParams();
    if (campaignId) params.append('campaign_id', campaignId);
    if (adGroupId) params.append('adgroup_id', adGroupId);
    if (params.toString()) url += `?${params.toString()}`;

    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch ads');
    return res.json();
  },

  // 소재 생성 (URL 포함)
  async createAd(adGroupId: string, headline: string, description: string, pcUrl?: string, mobileUrl?: string) {
    const res = await fetch(`${API_BASE_URL}/api/ads`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ adGroupId, headline, description, pcUrl, mobileUrl }),
    });
    if (!res.ok) throw new Error('Failed to create ad');
    return res.json();
  },

  // 소재 복제 (추가된 기능)
  async cloneAds(sourceGroupId: string, targetGroupId: string) {
    const response = await fetch(`${API_BASE_URL}/api/ads/clone`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ sourceGroupId, targetGroupId }),
    });
    if (!response.ok) throw new Error('Failed to clone ads');
    return response.json();
  },

  // 소재 삭제
  async deleteAd(adId: string) {
    const res = await fetch(`${API_BASE_URL}/api/ads/${adId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete ad');
    return res.json();
  },

  // 소재 상태 변경
  async updateAdStatus(adId: string, status: string) {
    const res = await fetch(`${API_BASE_URL}/api/ads/${adId}/status`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Failed to update ad status');
    return res.json();
  },

  // 비즈채널 목록
  async getChannels(): Promise<BusinessChannel[]> {
    const res = await fetch(`${API_BASE_URL}/api/channels`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch channels');
    return res.json();
  },

  // 확장소재 목록 (캠페인)
  async getExtensions(campaignId: string): Promise<Extension[]> {
    const res = await fetch(`${API_BASE_URL}/api/extensions?campaign_id=${campaignId}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch extensions');
    return res.json();
  },

  // 확장소재 목록 (그룹)
  async getExtensionsByGroup(adGroupId: string): Promise<Extension[]> {
    const res = await fetch(`${API_BASE_URL}/api/extensions?adgroup_id=${adGroupId}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch extensions by group');
    return res.json();
  },

  // 확장소재 생성
  async createExtension(adGroupId: string, type: string, businessChannelId?: string, attributes?: any) {
    const res = await fetch(`${API_BASE_URL}/api/extensions`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ adGroupId, type, businessChannelId, ...attributes }), // attributes를 펼쳐서 전송 (서버 로직에 맞춤)
    });
    if (!res.ok) throw new Error('Failed to create extension');
    return res.json();
  },

  // 확장소재 삭제
  async deleteExtension(adGroupId: string, extensionId: string) {
    const res = await fetch(`${API_BASE_URL}/api/extensions?adGroupId=${adGroupId}&extensionId=${extensionId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete extension');
    return res.json();
  },

  // 확장소재 상태 변경
  async updateExtensionStatus(extId: string, status: string) {
    const res = await fetch(`${API_BASE_URL}/api/extensions/${extId}/status`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Failed to update extension status');
    return res.json();
  },

  // 대량 입찰가 업데이트
  async bulkUpdateBids(items: any[]) {
    const res = await fetch(`${API_BASE_URL}/api/keywords/bid/bulk`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(items),
    });
    if (!res.ok) throw new Error('Failed to bulk update bids');
    return res.json();
  },

  // 키워드 대량 생성
  async createKeywordsBulk(items: any[]) {
    const res = await fetch(`${API_BASE_URL}/api/keywords/bulk`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(items),
    });
    if (!res.ok) throw new Error('Failed to bulk create keywords');
    return res.json();
  },

  // 로그 저장 (인증 불필요 - 서버 설정 따름)
  async saveBidLogs(logs: LogItem[]): Promise<void> {
    try {
      await fetch(`${API_BASE_URL}/api/log/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logs)
      });
    } catch (error) {
      console.error("Failed to save logs to server:", error);
    }
  },
  
  // IP 차단 목록
  async getIpExclusions() {
    const res = await fetch(`${API_BASE_URL}/api/tool/ip-exclusion`, { headers: getHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  // IP 차단 추가
  async addIpExclusion(ip: string, memo: string) {
    const res = await fetch(`${API_BASE_URL}/api/tool/ip-exclusion`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ ip, memo }),
    });
    if (!res.ok) throw new Error('Failed to add IP exclusion');
    return res.json();
  },

  // IP 차단 삭제
  async deleteIpExclusion(ip: string) {
    const res = await fetch(`${API_BASE_URL}/api/tool/ip-exclusion/${ip}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete IP exclusion');
    return res.json();
  },

  // 키워드 전체 개수 카운트
  async countTotalKeywords() {
    const response = await fetch(`${API_BASE_URL}/api/tool/count-total-keywords`, { headers: getHeaders() });
    return response.json();
  },

  // 스마트 키워드 확장
  async smartExpand(data: { sourceGroupId: string, keywords: string[], bidAmt?: number, businessChannelId: string }) {
    const res = await fetch(`${API_BASE_URL}/api/tools/smart-expand`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to execute smart expand');
    return res.json();
  }
};