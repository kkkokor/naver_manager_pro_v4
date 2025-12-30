import React, { useState, useEffect } from 'react';
import { naverService } from '../services/naverService';
import { Extension, Campaign, AdGroup } from '../types';
import { 
  Phone, MapPin, Link as LinkIcon, Image as ImageIcon, 
  Grid, Loader2, RefreshCw, AlertCircle, PhoneCall, Globe, Calculator, AlertTriangle, 
  ChevronDown, ChevronUp, Layers, ExternalLink
} from 'lucide-react';

interface GroupedExtension {
  id: string; // 대표 ID (키 역할)
  type: string;
  content: any; // 확장소재 내용 (JSON)
  businessChannelId?: string; // 비즈채널 ID
  items: Extension[]; // 묶인 원본 확장소재들
  groupNames: string[]; // 사용 중인 그룹 이름들
}

export const ExtensionManager: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  
  // 그룹 이름 매핑을 위한 데이터
  const [adGroups, setAdGroups] = useState<AdGroup[]>([]);
  const [adGroupMap, setAdGroupMap] = useState<Record<string, string>>({});

  const [groupedExtensions, setGroupedExtensions] = useState<GroupedExtension[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('ALL');
  
  // 아코디언 상태 (어떤 그룹들이 쓰고 있는지 펼치기/접기)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadCampaigns();
  }, []);

  // 캠페인 변경 시 그룹 목록 먼저 가져오고 -> 확장소재 가져옴
  useEffect(() => {
    if (selectedCampaignId) {
      loadData(selectedCampaignId);
    } else {
      setGroupedExtensions([]);
      setAdGroups([]);
    }
  }, [selectedCampaignId]);

  const loadCampaigns = async () => {
    try {
      const data = await naverService.getCampaigns();
      setCampaigns(data);
    } catch (error) {
      console.error("캠페인 로딩 실패:", error);
    }
  };

  const loadData = async (campaignId: string) => {
    setLoading(true);
    try {
      // 1. 그룹 목록 가져오기 (ID -> 이름 매핑용)
      const groups = await naverService.getAdGroups(campaignId);
      setAdGroups(groups);
      
      const map: Record<string, string> = {};
      groups.forEach(g => map[g.nccAdGroupId] = g.name);
      setAdGroupMap(map);

      // 2. 확장소재 가져오기
      const exts = await naverService.getExtensions(campaignId);
      
      // 3. 그룹화 로직 (Grouping)
      const grouped = groupExtensions(exts, map);
      setGroupedExtensions(grouped);

    } catch (error) {
      console.error("데이터 로딩 실패:", error);
    } finally {
      setLoading(false);
    }
  };

  // [핵심] 확장소재 그룹화 함수
  const groupExtensions = (extensions: Extension[], groupMap: Record<string, string>) => {
    const groups: Record<string, GroupedExtension> = {};

    extensions.forEach(ext => {
      // 그룹화 키 생성: 타입 + 내용(JSON 문자열) + 비즈채널ID
      // 내용이 같으면 같은 키가 생성됨
      const contentKey = JSON.stringify(ext.extension || {});
      const channelKey = ext.pcChannelId || ext.mobileChannelId || '';
      const uniqueKey = `${ext.type}|${contentKey}|${channelKey}`;

      if (!groups[uniqueKey]) {
        groups[uniqueKey] = {
          id: uniqueKey,
          type: ext.type,
          content: ext.extension,
          businessChannelId: channelKey,
          items: [],
          groupNames: []
        };
      }

      groups[uniqueKey].items.push(ext);
      // ownerId(그룹ID)를 이용해 그룹 이름 찾기
      const groupName = groupMap[ext.ownerId] || ext.ownerId || '알 수 없는 그룹';
      groups[uniqueKey].groupNames.push(groupName);
    });

    return Object.values(groups);
  };

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedItems);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedItems(newSet);
  };

  const tabs = [
    { id: 'ALL', label: '전체', icon: Grid },
    { id: 'PHONE', label: '전화번호', icon: Phone },
    { id: 'LOCATION', label: '위치', icon: MapPin },
    { id: 'SUB_LINKS', label: '서브링크', icon: LinkIcon },
    { id: 'PRICE_LINKS', label: '가격', icon: Calculator },
    { id: 'IMAGES', label: '이미지', icon: ImageIcon },
    { id: 'WEBSITE_INFO', label: '웹사이트', icon: Globe },
  ];

  const filteredList = activeTab === 'ALL' 
    ? groupedExtensions 
    : groupedExtensions.filter(g => g.type === activeTab || (activeTab === 'IMAGES' && g.type.includes('IMAGE')));

  // 내용 렌더링 (타입별 분기)
  const renderContent = (group: GroupedExtension) => {
    const { type, content, businessChannelId } = group;
    const isEmptyContent = !content || Object.keys(content).length === 0;

    // 1. 비즈채널형 (내용이 없고 채널 ID만 있는 경우)
    if (isEmptyContent && businessChannelId) {
      return (
        <div className="text-sm text-gray-600">
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded font-bold">비즈채널 연동</span>
            <span className="text-xs text-gray-400 font-mono">{businessChannelId}</span>
          </div>
          <p className="text-xs">이 확장소재는 네이버 비즈채널 정보(위치, 예약 등)를 자동으로 불러옵니다.</p>
        </div>
      );
    }

    // 2. 데이터형 (JSON 내용이 있는 경우)
    switch (type) {
      case 'PHONE':
        return (
          <div className="flex items-center text-lg font-bold text-gray-800">
            <PhoneCall className="w-5 h-5 mr-2 text-green-600"/>
            {content.phoneNumber || '번호 없음'}
          </div>
        );
      case 'LOCATION':
      case 'PLACE':
        return (
          <div>
            <div className="font-bold flex items-center"><MapPin className="w-4 h-4 mr-1 text-blue-500"/> {content.businessName || '업체명'}</div>
            <div className="text-sm text-gray-500 mt-1">{content.roadAddress || content.address || '-'}</div>
          </div>
        );
      case 'SUB_LINKS':
        return (
          <div className="text-sm">
             <div className="font-bold mb-1 text-gray-700">서브링크 ({content.links?.length || 0}개)</div>
             <div className="space-y-1">
               {content.links?.map((l: any, i: number) => (
                 <div key={i} className="flex justify-between text-xs bg-gray-50 p-1 rounded">
                   <span className="font-medium">{l.linkName}</span>
                   <span className="text-gray-400 truncate max-w-[150px]">{l.pcUrl}</span>
                 </div>
               ))}
             </div>
          </div>
        );
      case 'WEBSITE_INFO':
        return (
          <div className="text-sm">
             <div className="font-bold flex items-center"><Globe className="w-4 h-4 mr-1 text-purple-500"/> {content.title || '웹사이트 정보'}</div>
             <div className="text-xs text-gray-500 mt-1">{content.description || '설명 없음'}</div>
             {content.url && <a href={content.url} target="_blank" className="text-xs text-blue-400 hover:underline flex items-center mt-1"><ExternalLink className="w-3 h-3 mr-1"/>{content.url}</a>}
          </div>
        );
      default:
        // 알 수 없는 타입은 키-값 쌍으로 보여줌
        return (
          <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
            {Object.entries(content).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="font-bold min-w-[80px]">{k}:</span>
                <span className="truncate">{String(v)}</span>
              </div>
            ))}
          </div>
        );
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* 헤더 영역 */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex-shrink-0">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
             <Layers className="w-7 h-7 mr-2 text-indigo-600"/> 확장소재 통합 관리
          </h2>
          <div className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            중복 소재는 자동으로 그룹화되어 표시됩니다.
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <select 
            value={selectedCampaignId} 
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="flex-1 max-w-md border-2 border-indigo-100 rounded-lg p-2.5 font-medium text-gray-700 focus:border-indigo-500 outline-none"
          >
            <option value="">대상 캠페인을 선택하세요</option>
            {campaigns.map(c => (
              <option key={c.nccCampaignId} value={c.nccCampaignId}>{c.name}</option>
            ))}
          </select>
          
          {selectedCampaignId && (
             <button onClick={() => loadData(selectedCampaignId)} className="p-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors" title="새로고침">
               <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`}/>
             </button>
          )}
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      {selectedCampaignId ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col flex-1 min-h-0">
          {/* 탭 메뉴 */}
          <div className="flex border-b overflow-x-auto scrollbar-hide bg-gray-50">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center px-5 py-3 text-sm font-bold transition-all whitespace-nowrap border-b-2
                  ${activeTab === tab.id 
                    ? 'border-indigo-600 text-indigo-600 bg-white' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
              >
                <tab.icon className="w-4 h-4 mr-2"/>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-4 flex-1 overflow-y-auto bg-gray-50">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Loader2 className="w-10 h-10 animate-spin mb-3 text-indigo-400"/>
                <p>소재를 분석하고 그룹화하는 중입니다...</p>
              </div>
            ) : filteredList.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredList.map((group) => {
                  const isExpanded = expandedItems.has(group.id);
                  const statusSample = group.items[0]?.inspectStatus; // 대표 상태 (첫번째꺼)

                  return (
                    <div key={group.id} className="bg-white p-4 rounded-xl border border-gray-200 hover:shadow-lg transition-all flex flex-col">
                      {/* 상단 배지 */}
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex gap-2">
                          <span className="bg-indigo-50 text-indigo-600 text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-wide">
                            {group.type}
                          </span>
                          {statusSample && (
                            <span className={`text-[10px] px-2 py-1 rounded-md font-bold ${statusSample === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {statusSample}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                          총 {group.items.length}개 그룹 사용
                        </span>
                      </div>

                      {/* 컨텐츠 (전화번호 등) */}
                      <div className="flex-1 mb-4">
                        {renderContent(group)}
                      </div>

                      {/* 하단: 적용된 그룹 리스트 (아코디언) */}
                      <div className="border-t pt-2 mt-auto">
                        <button 
                          onClick={() => toggleExpand(group.id)}
                          className="w-full flex justify-between items-center text-xs text-gray-500 hover:bg-gray-50 p-2 rounded transition-colors"
                        >
                          <span>사용 중인 그룹 ({group.groupNames.length})</span>
                          {isExpanded ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                        </button>
                        
                        {isExpanded && (
                          <div className="mt-2 bg-gray-50 rounded p-2 max-h-40 overflow-y-auto border border-gray-100">
                            {group.groupNames.map((name, idx) => (
                              <div key={idx} className="text-xs text-gray-600 py-1 border-b border-gray-100 last:border-0 flex justify-between">
                                <span className="truncate flex-1" title={name}>{name}</span>
                                {/* 개별 삭제/관리 버튼이 필요하다면 여기에 추가 */}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 border-2 border-dashed border-gray-300 rounded-xl bg-white/50">
                <AlertCircle className="w-12 h-12 mb-3 opacity-30"/>
                <p className="font-medium">등록된 '{tabs.find(t=>t.id===activeTab)?.label}' 확장소재가 없습니다.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full bg-white rounded-xl border border-gray-200 text-gray-400 shadow-sm flex-1">
          <Layers className="w-16 h-16 mb-4 text-indigo-100"/>
          <p className="text-lg font-bold text-gray-600">관리할 캠페인을 선택해주세요.</p>
          <p className="text-sm mt-1">캠페인을 선택하면 등록된 확장소재를 자동으로 분류하여 보여줍니다.</p>
        </div>
      )}
    </div>
  );
};