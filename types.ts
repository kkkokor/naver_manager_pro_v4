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
  useGroupBidAmt: boolean;
  status: Status | string;
  managedStatus: string;
  stats: PerformanceStats;
  currentRankEstimate: number;
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

// [추가됨] 소재 인터페이스
export interface Ad {
  nccAdId: string;
  nccAdGroupId: string;
  type: string;
  headline: string;
  description: string;
  status: boolean;
}

// [수정됨] 비즈채널 인터페이스 (중복 제거)
export interface BusinessChannel {
  nccBusinessChannelId: string;
  name: string;
  channelKey: string;
  type: string;
}

// [추가됨] 확장소재 인터페이스
export interface Extension {
  nccAdGroupId?: string;
  type: string;
  extension?: any;
  [key: string]: any; 
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