import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { AutoBidder } from './components/AutoBidder';
import { KeywordExpander } from './components/KeywordExpander';
import { CreativeManager } from './components/CreativeManager';
import { ExtensionManager } from './components/ExtensionManager';
import { LogAnalytics } from './components/LogAnalytics';
import { IpBlockManager } from './components/IpBlockManager';
import { Login } from './components/Login';
import { Register } from './components/Register';
import { ApiSetup } from './components/ApiSetup';
import { AdminDashboard } from './components/AdminDashboard';
import { TabView, Campaign, Keyword, User } from './types';
import { naverService } from './services/naverService';
import { ArrowRightLeft, RefreshCw, Loader2 } from 'lucide-react';
import { Manual } from './components/Manual';

const App: React.FC = () => {
  // --- [SaaS 인증 상태] ---
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [view, setView] = useState<'LOGIN' | 'REGISTER' | 'MAIN'>('LOGIN');

  // --- [App State] ---
  const [activeTab, setActiveTab] = useState<string>(TabView.DASHBOARD);
  const [loading, setLoading] = useState<boolean>(false);
  
  // --- [Data States] ---
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedAdGroupId, setSelectedAdGroupId] = useState<string | null>(null);
  const [selectedAdGroupName, setSelectedAdGroupName] = useState<string>("");
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [keywordLoading, setKeywordLoading] = useState<boolean>(false);

  // --- [날짜 필터 상태] ---
  const [currentSince, setCurrentSince] = useState<string>('');
  const [currentUntil, setCurrentUntil] = useState<string>('');

  // 1. 초기 실행 시 토큰(로그인) 체크
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    setAuthChecking(true);
    try {
      const me = await naverService.getMe();
      setUser(me);
      setView('MAIN');
      fetchCampaigns();
    } catch (e) {
      setView('LOGIN');
    } finally {
      setAuthChecking(false);
    }
  };

  const handleLogout = () => {
    naverService.logout();
    setUser(null);
    setCampaigns([]);
    setKeywords([]);
    setView('LOGIN');
  };

  // 캠페인 목록 로드
  const fetchCampaigns = async (since?: string, until?: string) => {
    setLoading(true);
    try {
      // API 호출 (Service 내부 로직에 따라 파라미터 처리됨)
      const data = await naverService.getCampaigns(); 
      setCampaigns(data);
      
      if(since) setCurrentSince(since);
      if(until) setCurrentUntil(until);
    } catch (err) {
      console.error("Failed to load campaigns", err);
    } finally {
      setLoading(false);
    }
  };

  // 대시보드 날짜 변경 핸들러
  const handleDateChange = (since: string, until: string) => {
    fetchCampaigns(since, until);
  };

  // 키워드 로드 (트리뷰 선택 시)
  const handleSelectAdGroup = async (groupId: string, groupName: string) => {
    setSelectedAdGroupId(groupId);
    setSelectedAdGroupName(groupName);
    setActiveTab(TabView.KEYWORDS);
    
    setKeywordLoading(true);
    try {
      // [수정] device 파라미터('MOBILE') 추가 (오류 해결)
      const data = await naverService.getKeywords(groupId, 'MOBILE');
      setKeywords(data);
    } catch (err) {
      console.error("Failed to load keywords", err);
    } finally {
      setKeywordLoading(false);
    }
  };

  // --- 2. 뷰 렌더링 분기 ---
  if (authChecking) {
    return <div className="flex h-full min-h-screen items-center justify-center"><Loader2 className="w-12 h-12 animate-spin text-naver-green"/></div>;
  }

  if (view === 'LOGIN') {
    return <Login onLoginSuccess={checkAuth} onGoRegister={() => setView('REGISTER')} />;
  }

  if (view === 'REGISTER') {
    return <Register onSuccess={() => setView('LOGIN')} onCancel={() => setView('LOGIN')} />;
  }

  // --- 3. 메인 콘텐츠 렌더링 ---
  const renderContent = () => {
    // 로딩 중일 때 표시 (단, 탭 전환 시 깜빡임 방지를 위해 데이터가 아예 없을 때만)
    if (loading && campaigns.length === 0) {
      return (
        <div className="flex h-full items-center justify-center flex-col">
          <Loader2 className="w-10 h-10 animate-spin text-naver-green mb-4" />
          <p className="text-gray-500">데이터를 불러오는 중입니다...</p>
        </div>
      );
    }

    switch (activeTab) {

      case TabView.ADMIN:
        return <AdminDashboard />;
      
      // [NEW] 케이스 추가
      case TabView.MANUAL:
        return <Manual />;
        
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
        // [수정] campaigns prop 제거 (컴포넌트 내부에서 로드함)
        return <CreativeManager />;

      case TabView.EXTENSION_MANAGER:
        // [수정] campaigns prop 제거 (컴포넌트 내부에서 로드함)
        return <ExtensionManager />;

      case TabView.AUTOBID:
        // [수정] AutoBidder에 필수 prop 전달
        return (
            <AutoBidder 
              campaigns={campaigns}
              keywords={[]} // 자동입찰 모듈 내부에서 별도로 로드하므로 빈 배열 전달 가능
              adGroups={[]} // 자동입찰 모듈 내부에서 별도로 로드하므로 빈 배열 전달 가능
              onRefresh={() => fetchCampaigns(currentSince, currentUntil)}
            />
        );

      case TabView.KEYWORD_EXPANSION:
        return <KeywordExpander campaigns={campaigns} />;

      case TabView.LOG_ANALYTICS:
        return <LogAnalytics />; 
      
      case 'IP_BLOCK':
        return <IpBlockManager />;

      case 'API_SETUP':
        return <ApiSetup />;

      case 'ADMIN':
        return user?.is_superuser ? <AdminDashboard /> : <div className="p-8 text-center text-red-500">접근 권한이 없습니다.</div>;

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
        onLogout={handleLogout}
        user={user!}
    >
      {renderContent()}
    </Layout>
  );
};

export default App;