import { Campaign, AdGroup, Keyword, Ad, BusinessChannel, Extension } from '../types';

const API_BASE_URL = 'http://localhost:8000';

export interface LogItem {
  time: string;
  keyword: string;
  oldBid: number;
  newBid: number;
  reason: string;
}

export const naverService = {
  // [복구됨] API 키 저장 (로그인 기능)
  setCredentials(accessKey: string, secretKey: string, customerId: string) {
    localStorage.setItem('naver_access_key', accessKey);
    localStorage.setItem('naver_secret_key', secretKey);
    localStorage.setItem('naver_customer_id', customerId);
  },

  // 캠페인 목록 가져오기
  async getCampaigns(): Promise<Campaign[]> {
    const res = await fetch(`${API_BASE_URL}/api/campaigns`, {
      headers: {
        'x-naver-access-key': localStorage.getItem('naver_access_key') || '',
        'x-naver-secret-key': localStorage.getItem('naver_secret_key') || '',
        'x-naver-customer-id': localStorage.getItem('naver_customer_id') || '',
      },
    });
    if (!res.ok) throw new Error('Failed to fetch campaigns');
    return res.json();
  },

  // 광고그룹 목록 가져오기
  async getAdGroups(campaignId: string): Promise<AdGroup[]> {
    const res = await fetch(`${API_BASE_URL}/api/adgroups?campaign_id=${campaignId}`, {
      headers: {
        'x-naver-access-key': localStorage.getItem('naver_access_key') || '',
        'x-naver-secret-key': localStorage.getItem('naver_secret_key') || '',
        'x-naver-customer-id': localStorage.getItem('naver_customer_id') || '',
      },
    });
    if (!res.ok) throw new Error('Failed to fetch adgroups');
    return res.json();
  },

  // 광고그룹 생성
  async createAdGroup(nccCampaignId: string, name: string): Promise<AdGroup> {
    const res = await fetch(`${API_BASE_URL}/api/adgroups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-naver-access-key': localStorage.getItem('naver_access_key') || '',
        'x-naver-secret-key': localStorage.getItem('naver_secret_key') || '',
        'x-naver-customer-id': localStorage.getItem('naver_customer_id') || '',
      },
      body: JSON.stringify({ nccCampaignId, name }),
    });
    if (!res.ok) throw new Error('Failed to create adgroup');
    return res.json();
  },

  // 키워드 목록 가져오기
  async getKeywords(adGroupId: string, device: string, targetRank: number = 3): Promise<Keyword[]> {
    const res = await fetch(`${API_BASE_URL}/api/keywords?adgroup_id=${adGroupId}&device=${device}&target_rank=${targetRank}`, {
      headers: {
        'x-naver-access-key': localStorage.getItem('naver_access_key') || '',
        'x-naver-secret-key': localStorage.getItem('naver_secret_key') || '',
        'x-naver-customer-id': localStorage.getItem('naver_customer_id') || '',
      },
    });
    if (!res.ok) throw new Error('Failed to fetch keywords');
    return res.json();
  },

  // 소재(광고) 목록 가져오기
  async getAds(campaignId?: string, adGroupId?: string): Promise<Ad[]> {
    let url = `${API_BASE_URL}/api/ads`;
    const params = new URLSearchParams();
    if (campaignId) params.append('campaign_id', campaignId);
    if (adGroupId) params.append('adgroup_id', adGroupId);
    if (params.toString()) url += `?${params.toString()}`;

    const res = await fetch(url, {
      headers: {
        'x-naver-access-key': localStorage.getItem('naver_access_key') || '',
        'x-naver-secret-key': localStorage.getItem('naver_secret_key') || '',
        'x-naver-customer-id': localStorage.getItem('naver_customer_id') || '',
      },
    });
    if (!res.ok) throw new Error('Failed to fetch ads');
    return res.json();
  },

  // [수정] 소재 생성 (URL 포함)
  async createAd(adGroupId: string, headline: string, description: string, pcUrl?: string, mobileUrl?: string) {
    const res = await fetch(`${API_BASE_URL}/api/ads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-naver-access-key': localStorage.getItem('naver_access_key') || '',
        'x-naver-secret-key': localStorage.getItem('naver_secret_key') || '',
        'x-naver-customer-id': localStorage.getItem('naver_customer_id') || '',
      },
      body: JSON.stringify({ adGroupId, headline, description, pcUrl, mobileUrl }),
    });
    if (!res.ok) throw new Error('Failed to create ad');
    return res.json();
  },

  // 소재 삭제
  async deleteAd(adId: string) {
    const res = await fetch(`${API_BASE_URL}/api/ads/${adId}`, {
      method: 'DELETE',
      headers: {
        'x-naver-access-key': localStorage.getItem('naver_access_key') || '',
        'x-naver-secret-key': localStorage.getItem('naver_secret_key') || '',
        'x-naver-customer-id': localStorage.getItem('naver_customer_id') || '',
      },
    });
    if (!res.ok) throw new Error('Failed to delete ad');
    return res.json();
  },

  // 소재 상태 변경
  async updateAdStatus(adId: string, status: string) {
    const res = await fetch(`${API_BASE_URL}/api/ads/${adId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-naver-access-key': localStorage.getItem('naver_access_key') || '',
        'x-naver-secret-key': localStorage.getItem('naver_secret_key') || '',
        'x-naver-customer-id': localStorage.getItem('naver_customer_id') || '',
      },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Failed to update ad status');
    return res.json();
  },

  // 비즈채널 목록 가져오기
  async getChannels(): Promise<BusinessChannel[]> {
    const res = await fetch(`${API_BASE_URL}/api/channels`, {
      headers: {
        'x-naver-access-key': localStorage.getItem('naver_access_key') || '',
        'x-naver-secret-key': localStorage.getItem('naver_secret_key') || '',
        'x-naver-customer-id': localStorage.getItem('naver_customer_id') || '',
      },
    });
    if (!res.ok) throw new Error('Failed to fetch channels');
    return res.json();
  },

  // 확장소재 목록 가져오기 (캠페인)
  async getExtensions(campaignId: string): Promise<Extension[]> {
    const res = await fetch(`${API_BASE_URL}/api/extensions?campaign_id=${campaignId}`, {
      headers: {
        'x-naver-access-key': localStorage.getItem('naver_access_key') || '',
        'x-naver-secret-key': localStorage.getItem('naver_secret_key') || '',
        'x-naver-customer-id': localStorage.getItem('naver_customer_id') || '',
      },
    });
    if (!res.ok) throw new Error('Failed to fetch extensions');
    return res.json();
  },

  // [중요] 확장소재 목록 가져오기 (그룹 기준)
  async getExtensionsByGroup(adGroupId: string): Promise<Extension[]> {
    const res = await fetch(`${API_BASE_URL}/api/extensions?adgroup_id=${adGroupId}`, {
      headers: {
        'x-naver-access-key': localStorage.getItem('naver_access_key') || '',
        'x-naver-secret-key': localStorage.getItem('naver_secret_key') || '',
        'x-naver-customer-id': localStorage.getItem('naver_customer_id') || '',
      },
    });
    if (!res.ok) throw new Error('Failed to fetch extensions by group');
    return res.json();
  },

  // 확장소재 생성
  async createExtension(adGroupId: string, type: string, businessChannelId?: string, attributes?: any) {
    const res = await fetch(`${API_BASE_URL}/api/extensions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-naver-access-key': localStorage.getItem('naver_access_key') || '',
        'x-naver-secret-key': localStorage.getItem('naver_secret_key') || '',
        'x-naver-customer-id': localStorage.getItem('naver_customer_id') || '',
      },
      body: JSON.stringify({ adGroupId, type, businessChannelId, attributes }),
    });
    if (!res.ok) throw new Error('Failed to create extension');
    return res.json();
  },

  // 확장소재 삭제
  async deleteExtension(adGroupId: string, extensionId: string) {
    const res = await fetch(`${API_BASE_URL}/api/extensions?adGroupId=${adGroupId}&extensionId=${extensionId}`, {
      method: 'DELETE',
      headers: {
        'x-naver-access-key': localStorage.getItem('naver_access_key') || '',
        'x-naver-secret-key': localStorage.getItem('naver_secret_key') || '',
        'x-naver-customer-id': localStorage.getItem('naver_customer_id') || '',
      },
    });
    if (!res.ok) throw new Error('Failed to delete extension');
    return res.json();
  },

  // 확장소재 상태 변경
  async updateExtensionStatus(extId: string, status: string) {
    const res = await fetch(`${API_BASE_URL}/api/extensions/${extId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-naver-access-key': localStorage.getItem('naver_access_key') || '',
        'x-naver-secret-key': localStorage.getItem('naver_secret_key') || '',
        'x-naver-customer-id': localStorage.getItem('naver_customer_id') || '',
      },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Failed to update extension status');
    return res.json();
  },

  // 대량 입찰가 업데이트
  async bulkUpdateBids(items: any[]) {
    const res = await fetch(`${API_BASE_URL}/api/keywords/bid/bulk`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-naver-access-key': localStorage.getItem('naver_access_key') || '',
        'x-naver-secret-key': localStorage.getItem('naver_secret_key') || '',
        'x-naver-customer-id': localStorage.getItem('naver_customer_id') || '',
      },
      body: JSON.stringify(items),
    });
    if (!res.ok) throw new Error('Failed to bulk update bids');
    return res.json();
  },

  // 키워드 대량 생성
  async createKeywordsBulk(items: any[]) {
    const res = await fetch(`${API_BASE_URL}/api/keywords/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-naver-access-key': localStorage.getItem('naver_access_key') || '',
        'x-naver-secret-key': localStorage.getItem('naver_secret_key') || '',
        'x-naver-customer-id': localStorage.getItem('naver_customer_id') || '',
      },
      body: JSON.stringify(items),
    });
    if (!res.ok) throw new Error('Failed to bulk create keywords');
    return res.json();
  },

  // 로그 저장
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
  
  // IP 차단
  async getIpExclusions() {
    const res = await fetch(`${API_BASE_URL}/api/tool/ip-exclusion`, {
      headers: {
        'x-naver-access-key': localStorage.getItem('naver_access_key') || '',
        'x-naver-secret-key': localStorage.getItem('naver_secret_key') || '',
        'x-naver-customer-id': localStorage.getItem('naver_customer_id') || '',
      },
    });
    if (!res.ok) return [];
    return res.json();
  },

  async addIpExclusion(ip: string, memo: string) {
    const res = await fetch(`${API_BASE_URL}/api/tool/ip-exclusion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-naver-access-key': localStorage.getItem('naver_access_key') || '',
        'x-naver-secret-key': localStorage.getItem('naver_secret_key') || '',
        'x-naver-customer-id': localStorage.getItem('naver_customer_id') || '',
      },
      body: JSON.stringify({ ip, memo }),
    });
    if (!res.ok) throw new Error('Failed to add IP exclusion');
    return res.json();
  },

  async deleteIpExclusion(ip: string) {
    const res = await fetch(`${API_BASE_URL}/api/tool/ip-exclusion/${ip}`, {
      method: 'DELETE',
      headers: {
        'x-naver-access-key': localStorage.getItem('naver_access_key') || '',
        'x-naver-secret-key': localStorage.getItem('naver_secret_key') || '',
        'x-naver-customer-id': localStorage.getItem('naver_customer_id') || '',
      },
    });
    if (!res.ok) throw new Error('Failed to delete IP exclusion');
    return res.json();
  }
};