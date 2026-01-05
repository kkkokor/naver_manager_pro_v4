// types.ts (기존 코드 100% 유지 + SaaS 인증 타입 추가)

export interface Campaign {
  nccCampaignId: string;
  campaignType: string;
  name: string;
  status: Status | string;
  stats: PerformanceStats;
}

export interface AdGroup {
  nccAdGroupId: string;
  nccCampaignId: string;
  name: string;
  status: Status | string;
  bidAmt: number;
  stats: PerformanceStats;
}

export interface EstimateItem {
  rank: number;
  bid: number;
}

export interface Keyword {
  nccKeywordId: string;
  nccAdGroupId: string;
  keyword: string;
  bidAmt: number;
  originalBid?: number; 
  useGroupBidAmt: boolean;
  status: Status | string;
  managedStatus: string;
  stats: PerformanceStats;
  currentRankEstimate?: number; // ? 추가 (선택적)
  bidEstimates?: EstimateItem[];
}

export interface PerformanceStats {
  impressions: number;
  clicks: number;
  cost: number;
  ctr: number;
  cpc: number;
  conversions: number;
  cpa: number;
  convAmt: number;
  roas: number;
}

export interface BidAdjustmentResult {
  keywordId: string;
  keyword: string;
  oldBid: number;
  newBid: number;
  reason: string;
}

export interface VisitLog {
  id: string;
  timestamp: string;
  ip: string;
  keyword: string;
  type: 'AD' | 'ORGANIC' | 'DIRECT';
  url: string;
  referrer: string;
}

// [수정됨] 소재 인터페이스 (URL 필드 추가)
export interface Ad {
  nccAdId: string;
  nccAdGroupId: string;
  type: string;
  headline: string;
  description: string;
  status: boolean;
  // [NEW] 에러 해결을 위해 추가된 필드
  pcUrl?: string;
  mobileUrl?: string;
}

// ▼▼▼ [필수 추가] 비즈채널 타입 정의 ▼▼▼
export interface BusinessChannel {
  nccBusinessChannelId: string;
  name: string;
  channelKey: string;
  type: string;
}

// [수정됨] 확장소재 인터페이스 (구조 구체화)
export interface Extension {
  nccExtensionId?: string; // 조회 시에만 존재
  ownerId: string; // 그룹 ID or 캠페인 ID (기존 nccAdGroupId 대체/혼용)
  type: string;
  pcChannelId?: string;
  mobileChannelId?: string;
  extension?: any; // JSON 파싱된 내용
  userLock?: boolean;
  inspectStatus?: string; // 검수 상태
  statusReason?: string;  // 반려 사유
  [key: string]: any; // 유연성을 위해 인덱스 시그니처 유지
}

export enum Status {
  ELIGIBLE = 'ELIGIBLE',
  PAUSED = 'PAUSED',
  DELETED = 'DELETED',
  UNREGISTERED = 'UNREGISTERED',
  ON = 'ON', 
  OFF = 'OFF'
}

export enum TabView {
  DASHBOARD = 'dashboard',
  CAMPAIGNS = 'campaigns',
  KEYWORDS = 'keywords',
  CREATIVE_MANAGER = 'creative_manager',
  EXTENSION_MANAGER = 'extension_manager',
  AUTOBID = 'autobid',
  KEYWORD_EXPANSION = 'keyword_expansion',
  LOG_ANALYTICS = 'log_analytics'
}

// ==========================================
// ▼▼▼ [신규 추가] SaaS 인증/회원 관리 타입 ▼▼▼
// ==========================================

export interface User {
  id: number;
  username: string;
  name: string;
  is_active: boolean;
  is_paid: boolean;
  is_superuser: boolean;
  naver_access_key?: string; // API 키 설정 여부 확인용
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}