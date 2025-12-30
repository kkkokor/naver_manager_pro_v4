import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { AutoBidder } from './components/AutoBidder';
import { KeywordExpander } from './components/KeywordExpander';
import { CreativeManager } from './components/CreativeManager';
import { ExtensionManager } from './components/ExtensionManager';
import { Login } from './components/Login';
import { TabView, Campaign, Keyword } from './types';
import { naverService } from './services/naverService';
import { ArrowRightLeft, RefreshCw, Loader2, LogOut } from 'lucide-react';
import { LogAnalytics } from './components/LogAnalytics'; // import 추가

const App: React.FC = () => {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // App State
  const [activeTab, setActiveTab] = useState<TabView>(TabView.DASHBOARD);
  const [loading, setLoading] = useState<boolean>(false);
  
  // Data States
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedAdGroupId, setSelectedAdGroupId] = useState<string | null>(null);
  const [selectedAdGroupName, setSelectedAdGroupName] = useState<string>("");
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [keywordLoading, setKeywordLoading] = useState<boolean>(false);

  // [NEW] 날짜 필터 상태 (Dashboard 연동용)
  const [currentSince, setCurrentSince] = useState<string>('');
  const [currentUntil, setCurrentUntil] = useState<string>('');

  // Check LocalStorage on Mount
  useEffect(() => {
    const access = localStorage.getItem('NAVER_ACCESS_KEY');
    const secret = localStorage.getItem('NAVER_SECRET_KEY');
    const custId = localStorage.getItem('NAVER_CUSTOMER_ID');

    if (access && secret && custId) {
      naverService.setCredentials(access, secret, custId); // 서비스에도 키 설정 필요
      setIsAuthenticated(true);
      fetchCampaigns(); // 초기 로딩 (기본값)
    }
  }, []);

  const handleLogin = (access: string, secret: string, custId: string) => {
    localStorage.setItem('NAVER_ACCESS_KEY', access);
    localStorage.setItem('NAVER_SECRET_KEY', secret);
    localStorage.setItem('NAVER_CUSTOMER_ID', custId);
    naverService.setCredentials(access, secret, custId);
    setIsAuthenticated(true);
    fetchCampaigns();
  };

  const handleLogout = () => {
    localStorage.removeItem('NAVER_ACCESS_KEY');
    localStorage.removeItem('NAVER_SECRET_KEY');
    localStorage.removeItem('NAVER_CUSTOMER_ID');
    naverService.clearCredentials();
    setIsAuthenticated(false);
    setCampaigns([]);
    setKeywords([]);
  };

  // [수정] 날짜 인자 받아서 처리 가능하도록 변경
  const fetchCampaigns = async (since?: string, until?: string) => {
    setLoading(true);
    try {
      // 대시보드에서 요청한 날짜가 있으면 그 날짜로, 아니면 저장된 날짜 사용
      const s = since || currentSince;
      const u = until || currentUntil;
      
      const data = await naverService.getCampaigns(s, u);
      setCampaigns(data);
      
      // 상태 업데이트
      if(since) setCurrentSince(since);
      if(until) setCurrentUntil(until);

    } catch (err) {
      console.error("Failed to load campaigns", err);
    } finally {
      setLoading(false);
    }
  };

  // 대시보드에서 날짜 변경 시 호출될 함수
  const handleDateChange = (since: string, until: string) => {
      fetchCampaigns(since, until);
  };

  // Handle Tree Node Click (Load Keywords)
  const handleSelectAdGroup = async (groupId: string, groupName: string) => {
    setSelectedAdGroupId(groupId);
    setSelectedAdGroupName(groupName);
    setActiveTab(TabView.KEYWORDS);
    
    setKeywordLoading(true);
    try {
      const data = await naverService.getKeywords(groupId);
      setKeywords(data);
    } catch (err) {
      console.error("Failed to load keywords", err);
    } finally {
      setKeywordLoading(false);
    }
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  const renderContent = () => {
    if (loading && campaigns.length === 0) {
      return (
        <div className="flex h-full items-center justify-center flex-col">
          <Loader2 className="w-10 h-10 animate-spin text-naver-green mb-4" />
          <p className="text-gray-500">데이터를 불러오는 중입니다...</p>
        </div>
      );
    }

    switch (activeTab) {
      case TabView.DASHBOARD:
        // [수정] onDateChange prop 전달 (오류 해결)
        return <Dashboard campaigns={campaigns} onDateChange={handleDateChange} />;
      
      case TabView.CAMPAIGNS:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">캠페인 현황</h2>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-600 text-sm font-medium border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4">상태</th>
                    <th className="px-6 py-4">캠페인 이름</th>
                    <th className="px-6 py-4">유형</th>
                    <th className="px-6 py-4 text-right">비용</th>
                    <th className="px-6 py-4 text-right">전환</th>
                    <th className="px-6 py-4 text-right">CPA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {campaigns.map(c => (
                    <tr key={c.nccCampaignId} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${c.status === 'ELIGIBLE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {c.status === 'ELIGIBLE' ? '노출가능' : '중지'}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-800">{c.name}</td>
                      <td className="px-6 py-4 text-gray-500 text-sm">{c.campaignType}</td>
                      <td className="px-6 py-4 text-right text-gray-500">₩{c.stats.cost.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-bold text-gray-800">{c.stats.conversions.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-medium text-naver-dark">₩{Math.round(c.stats.cpa).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case TabView.KEYWORDS:
        if (!selectedAdGroupId) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <ArrowRightLeft className="w-12 h-12 mb-4 opacity-20" />
                    <p>좌측 사이드바에서 <strong>광고그룹</strong>을 선택해주세요.</p>
                </div>
            )
        }
        return (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">키워드 관리</h2>
                <p className="text-sm text-gray-500 mt-1">그룹: <span className="font-bold text-naver-green">{selectedAdGroupName}</span></p>
              </div>
              <button 
                onClick={() => handleSelectAdGroup(selectedAdGroupId, selectedAdGroupName)} 
                className="flex items-center space-x-2 text-sm text-gray-600 hover:text-naver-green transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${keywordLoading ? 'animate-spin' : ''}`} />
                <span>새로고침</span>
              </button>
            </div>

            {keywordLoading ? (
               <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-naver-green"/></div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                    <tr>
                        <th className="px-6 py-4">키워드</th>
                        <th className="px-6 py-4">입찰가</th>
                        <th className="px-6 py-4 text-right">노출</th>
                        <th className="px-6 py-4 text-right">클릭</th>
                        <th className="px-6 py-4 text-right">CTR</th>
                        <th className="px-6 py-4 text-right">비용</th>
                        <th className="px-6 py-4 text-right">전환</th>
                        <th className="px-6 py-4 text-right">CPA</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                    {keywords.length === 0 ? (
                        <tr><td colSpan={8} className="p-8 text-center text-gray-400">키워드가 없습니다.</td></tr>
                    ) : (
                        keywords.map(k => (
                        <tr key={k.nccKeywordId} className="hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium text-gray-800">{k.keyword}</td>
                            <td className="px-6 py-4">
                                <span className="bg-gray-100 px-2 py-1 rounded text-xs">₩{k.bidAmt.toLocaleString()}</span>
                            </td>
                            <td className="px-6 py-4 text-right text-gray-500">{k.stats.impressions.toLocaleString()}</td>
                            <td className="px-6 py-4 text-right text-gray-500">{k.stats.clicks.toLocaleString()}</td>
                            <td className="px-6 py-4 text-right text-gray-500">{k.stats.ctr.toFixed(2)}%</td>
                            <td className="px-6 py-4 text-right text-gray-500">₩{k.stats.cost.toLocaleString()}</td>
                            <td className="px-6 py-4 text-right text-gray-800 font-bold">{k.stats.conversions.toLocaleString()}</td>
                            <td className="px-6 py-4 text-right font-medium text-naver-dark">
                                ₩{Math.round(k.stats.cpa).toLocaleString()}
                            </td>
                        </tr>
                        ))
                    )}
                    </tbody>
                </table>
                </div>
            )}
          </div>
        );

      case TabView.CREATIVE_MANAGER:
        return <CreativeManager campaigns={campaigns} />;

      case TabView.EXTENSION_MANAGER:
        return <ExtensionManager campaigns={campaigns} />;

      case TabView.AUTOBID:
        return (
            <AutoBidder 
                keywords={[]} 
                campaigns={campaigns} 
                adGroups={[]} 
                // [수정] 자동입찰에서 날짜가 바뀌어도 현재 캠페인을 리프레시하도록 연결
                onRefresh={() => fetchCampaigns(currentSince, currentUntil)} 
            />
        );

      case TabView.KEYWORD_EXPANSION:
        return <KeywordExpander campaigns={campaigns} />;

      case TabView.LOG_ANALYTICS:
        return <LogAnalytics />; // 컴포넌트 연결

      default:
        return <div>탭을 선택해주세요</div>;
    }
    
  };

  return (
    <Layout 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        campaigns={campaigns}
        onSelectAdGroup={handleSelectAdGroup}
        selectedAdGroupId={selectedAdGroupId}
        onLogout={handleLogout} // [수정] Layout에 로그아웃 전달
    >
      {renderContent()}
    </Layout>
  );
};

export default App;