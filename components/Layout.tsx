import React, { useState } from 'react';
import { TabView, Campaign, AdGroup, User } from '../types';
import { 
  LayoutDashboard, Megaphone, Layers, TrendingUp, Image, 
  ChevronRight, ChevronDown, Loader2, Wand2, Box, LogOut, 
  MousePointer, Key, Shield // [추가] 아이콘
} from 'lucide-react';
import { naverService } from '../services/naverService';

interface LayoutProps {
  activeTab: string; // TabView | string (확장성을 위해 string 허용)
  setActiveTab: (tab: string) => void;
  children: React.ReactNode;
  
  // Tree View Props
  campaigns: Campaign[];
  onSelectAdGroup?: (groupId: string, groupName: string) => void; // 선택적 props로 변경 (유연성)
  selectedAdGroupId?: string | null;
  onLogout: () => void; 
  
  // [추가] 로그인 유저 정보
  user?: User;
}

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  onClick: () => void;
  hasSubItems?: boolean;
  isExpanded?: boolean;
  onExpandToggle?: (e: React.MouseEvent) => void;
  className?: string; // 추가 스타일링용
}

const SidebarItem: React.FC<SidebarItemProps> = ({ 
  icon: Icon, 
  label, 
  isActive, 
  onClick,
  hasSubItems = false,
  isExpanded = false,
  onExpandToggle,
  className = ''
}) => {
  return (
    <div 
      className={`flex items-center px-3 py-2 rounded-lg cursor-pointer transition-colors duration-200 text-sm mb-1 ${
        isActive ? 'bg-naver-green text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
      } ${className}`}
      onClick={onClick}
    >
      {hasSubItems && (
        <div 
          onClick={onExpandToggle} 
          className={`mr-1 p-0.5 rounded hover:bg-black/10 transition-colors ${isActive ? 'text-white' : 'text-gray-400'}`}
        >
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      )}
      {!hasSubItems && <div className="w-5" />} {/* Indent */}
      
      <Icon className={`w-4 h-4 mr-2 ${isActive ? 'text-white' : 'text-gray-500'}`} />
      <span className="font-medium truncate flex-1">{label}</span>
    </div>
  );
};

export const Layout: React.FC<LayoutProps> = ({ 
  activeTab, 
  setActiveTab, 
  children,
  campaigns,
  onSelectAdGroup,
  selectedAdGroupId,
  onLogout,
  user // [추가]
}) => {
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [loadedAdGroups, setLoadedAdGroups] = useState<{[key: string]: AdGroup[]}>({});
  const [loadingGroups, setLoadingGroups] = useState<Set<string>>(new Set());

  const handleCampaignExpand = async (e: React.MouseEvent, campaignId: string) => {
    e.stopPropagation();
    
    const newExpanded = new Set(expandedCampaigns);
    if (newExpanded.has(campaignId)) {
      newExpanded.delete(campaignId);
      setExpandedCampaigns(newExpanded);
    } else {
      newExpanded.add(campaignId);
      setExpandedCampaigns(newExpanded);
      
      if (!loadedAdGroups[campaignId]) {
        setLoadingGroups(prev => new Set(prev).add(campaignId));
        try {
          const groups = await naverService.getAdGroups(campaignId);
          setLoadedAdGroups(prev => ({ ...prev, [campaignId]: groups }));
        } catch (error) {
          console.error("Failed to load adgroups", error);
        } finally {
          setLoadingGroups(prev => {
            const next = new Set(prev);
            next.delete(campaignId);
            return next;
          });
        }
      }
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-gray-200 flex flex-col fixed h-full z-10 shadow-lg">
        {/* 1. Header */}
        <div className="p-5 border-b border-gray-100 bg-white">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-naver-green rounded-md flex items-center justify-center text-white font-bold text-xl shadow-sm">N</div>
            <h1 className="text-lg font-bold text-gray-800 tracking-tight">검색광고 매니저</h1>
          </div>
        </div>

        {/* [추가] 2. User Profile */}
        <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex flex-col gap-1">
            <div className="flex justify-between items-center">
                <span className="font-bold text-gray-800 text-sm">{user?.name}님</span>
                {user?.is_superuser && (
                    <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-bold">ADMIN</span>
                )}
            </div>
            <span className="text-xs text-gray-400">{user?.username}</span>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto space-y-1 custom-scrollbar">
          {/* Main Menus */}
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2 mt-2">메인 메뉴</div>
          <SidebarItem 
            icon={LayoutDashboard} 
            label="대시보드" 
            isActive={activeTab === TabView.DASHBOARD} 
            onClick={() => setActiveTab(TabView.DASHBOARD)} 
          />
          <SidebarItem 
            icon={Megaphone} 
            label="캠페인 목록" 
            isActive={activeTab === TabView.CAMPAIGNS} 
            onClick={() => setActiveTab(TabView.CAMPAIGNS)} 
          />
          
          <div className="border-t border-gray-100 my-2 mx-2"></div>
          
           <SidebarItem 
            icon={Image} 
            label="소재 관리" 
            isActive={activeTab === TabView.CREATIVE_MANAGER} 
            onClick={() => setActiveTab(TabView.CREATIVE_MANAGER)} 
          />
          <SidebarItem 
            icon={Box} 
            label="확장 소재(Extension)" 
            isActive={activeTab === TabView.EXTENSION_MANAGER} 
            onClick={() => setActiveTab(TabView.EXTENSION_MANAGER)} 
          />
           <SidebarItem 
            icon={TrendingUp} 
            label="자동 입찰" 
            isActive={activeTab === TabView.AUTOBID} 
            onClick={() => setActiveTab(TabView.AUTOBID)} 
          />
          <SidebarItem 
            icon={Wand2} 
            label="키워드 자동 확장" 
            isActive={activeTab === TabView.KEYWORD_EXPANSION} 
            onClick={() => setActiveTab(TabView.KEYWORD_EXPANSION)} 
          />
          <SidebarItem 
            icon={MousePointer} 
            label="유입 분석/차단" 
            isActive={activeTab === TabView.LOG_ANALYTICS} 
            onClick={() => setActiveTab(TabView.LOG_ANALYTICS)} 
          />

          {/* [추가] 시스템 메뉴 (API 설정, 관리자) */}
          <div className="border-t border-gray-100 my-2 mx-2"></div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">설정</div>
          
          <SidebarItem 
            icon={Key} 
            label="API 연동 설정" 
            isActive={activeTab === 'API_SETUP'} 
            onClick={() => setActiveTab('API_SETUP')} 
            className="text-indigo-600 hover:bg-indigo-50"
          />
          
          {user?.is_superuser && (
            <SidebarItem 
                icon={Shield} 
                label="관리자 모드" 
                isActive={activeTab === 'ADMIN'} 
                onClick={() => setActiveTab('ADMIN')}
                className="text-red-600 hover:bg-red-50"
            />
          )}

          {/* Tree View */}
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2 mt-6">캠페인 탐색기</div>
          <div className="space-y-0.5">
            {campaigns.map(camp => (
              <div key={camp.nccCampaignId}>
                <SidebarItem 
                  icon={Megaphone}
                  label={camp.name}
                  isActive={false}
                  onClick={() => {}}
                  hasSubItems={true}
                  isExpanded={expandedCampaigns.has(camp.nccCampaignId)}
                  onExpandToggle={(e) => handleCampaignExpand(e, camp.nccCampaignId)}
                />
                
                {expandedCampaigns.has(camp.nccCampaignId) && (
                  <div className="ml-4 border-l-2 border-gray-100 pl-2 animate-fadeIn">
                    {loadingGroups.has(camp.nccCampaignId) ? (
                      <div className="px-3 py-2 text-xs text-gray-400 flex items-center">
                        <Loader2 className="w-3 h-3 animate-spin mr-2" /> 로딩 중...
                      </div>
                    ) : (
                      loadedAdGroups[camp.nccCampaignId]?.map(group => (
                        <SidebarItem
                          key={group.nccAdGroupId}
                          icon={Layers}
                          label={group.name}
                          isActive={activeTab === TabView.KEYWORDS && selectedAdGroupId === group.nccAdGroupId}
                          onClick={() => {
                              if(onSelectAdGroup) onSelectAdGroup(group.nccAdGroupId, group.name);
                              setActiveTab(TabView.KEYWORDS);
                          }}
                        />
                      ))
                    )}
                    {(!loadingGroups.has(camp.nccCampaignId) && (!loadedAdGroups[camp.nccCampaignId] || loadedAdGroups[camp.nccCampaignId].length === 0)) && (
                       <div className="px-3 py-2 text-xs text-gray-400">광고그룹 없음</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </nav>

        <div className="p-4 border-t border-gray-200 bg-white">
          <button 
            onClick={onLogout}
            className="flex items-center justify-center space-x-2 text-gray-500 hover:text-red-600 w-full px-4 py-2.5 bg-gray-50 hover:bg-red-50 rounded-lg transition-all duration-200"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-bold">로그아웃</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-72 p-8 overflow-y-auto h-screen bg-gray-50">
        {children}
      </main>
    </div>
  );
};