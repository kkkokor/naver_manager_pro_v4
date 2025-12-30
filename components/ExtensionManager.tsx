import React, { useState, useEffect } from 'react';
import { naverService } from '../services/naverService';
import { Extension, Campaign, AdGroup, BusinessChannel } from '../types';
import { 
  Phone, MapPin, Link as LinkIcon, Image as ImageIcon, 
  Grid, Loader2, RefreshCw, AlertCircle, PhoneCall, Globe, Calculator, AlertTriangle, 
  ChevronDown, ChevronUp, Layers, ExternalLink
} from 'lucide-react';

interface GroupedExtension {
  id: string; // 그룹화 키
  type: string;
  content: any; 
  businessChannelId?: string;
  channelName?: string; // 채널 이름
  channelUrl?: string; // 채널 URL
  items: Extension[]; 
  groupNames: string[]; 
}

export const ExtensionManager: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  
  const [adGroups, setAdGroups] = useState<AdGroup[]>([]);
  const [channels, setChannels] = useState<BusinessChannel[]>([]);
  
  const [groupedExtensions, setGroupedExtensions] = useState<GroupedExtension[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('ALL');
  
  // 동적으로 생성될 탭 목록
  const [dynamicTabs, setDynamicTabs] = useState<{id: string, label: string, icon: any}[]>([]);
  
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadCampaigns();
    loadChannels();
  }, []);

  useEffect(() => {
    if (selectedCampaignId) {
      loadData(selectedCampaignId);
    } else {
      setGroupedExtensions([]);
      setAdGroups([]);
      setDynamicTabs([]);
    }
  }, [selectedCampaignId]);

  const loadCampaigns = async () => {
    try {
      const data = await naverService.getCampaigns();
      setCampaigns(data);
    } catch (error) { console.error(error); }
  };

  const loadChannels = async () => {
    try {
      const data = await naverService.getChannels();
      setChannels(data);
    } catch (error) { console.error(error); }
  };

  const loadData = async (campaignId: string) => {
    setLoading(true);
    try {
      // 1. 그룹 목록 (매핑용)
      const groups = await naverService.getAdGroups(campaignId);
      setAdGroups(groups);
      const groupMap: Record<string, string> = {};
      groups.forEach(g => groupMap[g.nccAdGroupId] = g.name);

      // 2. 비즈채널 맵 생성
      const channelMap: Record<string, BusinessChannel> = {};
      channels.forEach(ch => channelMap[ch.nccBusinessChannelId] = ch);

      // 3. 확장소재 가져오기
      const exts = await naverService.getExtensions(campaignId);
      
      // 4. 그룹화
      const grouped = groupExtensions(exts, groupMap, channelMap);
      setGroupedExtensions(grouped);

      // 5. 탭 생성 logic: 데이터에 존재하는 타입만 탭으로 만듦
      const types = new Set(grouped.map(g => g.type));
      const newTabs = [{ id: 'ALL', label: '전체', icon: Grid }];
      
      if (types.has('PHONE')) newTabs.push({ id: 'PHONE', label: '전화번호', icon: Phone });
      if (types.has('LOCATION') || types.has('PLACE')) newTabs.push({ id: 'LOCATION', label: '위치', icon: MapPin });
      if (types.has('SUB_LINKS')) newTabs.push({ id: 'SUB_LINKS', label: '서브링크', icon: LinkIcon });
      if (types.has('WEBSITE_INFO')) newTabs.push({ id: 'WEBSITE_INFO', label: '웹사이트', icon: Globe });
      if (types.has('POWER_LINK_IMAGE') || types.has('IMAGE_SUB_LINKS')) newTabs.push({ id: 'IMAGES', label: '이미지', icon: ImageIcon });
      
      // 기타 타입이 있으면 '기타' 탭 추가 가능, 일단은 여기까지
      setDynamicTabs(newTabs);
      setActiveTab('ALL'); // 리셋

    } catch (error) {
      console.error("데이터 로딩 실패:", error);
    } finally {
      setLoading(false);
    }
  };

  const groupExtensions = (extensions: Extension[], groupMap: Record<string, string>, channelMap: Record<string, BusinessChannel>) => {
    const groups: Record<string, GroupedExtension> = {};

    extensions.forEach(ext => {
      const contentKey = JSON.stringify(ext.extension || {});
      const channelId = ext.pcChannelId || ext.mobileChannelId || '';
      
      // 비즈채널 정보 찾기
      const channelInfo = channelId ? channelMap[channelId] : undefined;
      const channelKey = channelId; 

      const uniqueKey = `${ext.type}|${contentKey}|${channelKey}`;

      if (!groups[uniqueKey]) {
        groups[uniqueKey] = {
          id: uniqueKey,
          type: ext.type,
          content: ext.extension,
          businessChannelId: channelId,
          channelName: channelInfo?.name,
          channelUrl: (channelInfo as any)?.channelKey, 
          items: [],
          groupNames: []
        };
      }

      groups[uniqueKey].items.push(ext);
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

  const filteredList = activeTab === 'ALL' 
    ? groupedExtensions 
    : groupedExtensions.filter(g => g.type === activeTab || (activeTab === 'IMAGES' && (g.type === 'POWER_LINK_IMAGE' || g.type === 'IMAGE_SUB_LINKS')));

  const renderContent = (group: GroupedExtension) => {
    const { type, content, businessChannelId, channelName, channelUrl } = group;
    
    // 1. 비즈채널형
    if (businessChannelId) {
        return (
            <div className="text-sm">
                <div className="flex items-center gap-2 mb-1">
                    <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded font-bold">비즈채널</span>
                    <span className="font-bold text-gray-800">{channelName || businessChannelId}</span>
                </div>
                {/* 타입별 추가 정보 표시 */}
                {type === 'PLACE' && <div className="text-xs text-gray-500"><MapPin className="w-3 h-3 inline mr-1"/>플레이스 정보 연동</div>}
                
                {/* WEBSITE_INFO 처리 */}
                {type === 'WEBSITE_INFO' && (
                    <div className="text-xs text-gray-500 mt-1">
                        <div className="flex items-center"><Globe className="w-3 h-3 inline mr-1"/>{channelUrl || 'URL 정보 없음'}</div>
                        {content.agree !== undefined && <span className={content.agree ? 'text-green-600 ml-1' : 'text-red-500 ml-1'}>(동의: {content.agree ? 'Y' : 'N'})</span>}
                    </div>
                )}
            </div>
        );
    }

    // 2. 직접 입력형 & 복합형
    switch (type) {
      case 'PHONE':
        return (
          <div className="flex items-center text-lg font-bold text-gray-800">
            <PhoneCall className="w-5 h-5 mr-2 text-green-600"/>
            {content.phoneNumber || '번호 없음'}
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
      case 'POWER_LINK_IMAGE':
        return (
            <div className="flex items-center gap-3">
                {content.imagePath ? (
                    <img src={`https://ssl.pstatic.net/tveta/libs${content.imagePath}`} alt="파워링크" className="w-20 h-20 object-cover rounded border"/>
                ) : (
                    <div className="w-20 h-20 bg-gray-100 rounded border flex items-center justify-center text-gray-400 text-xs">No Image</div>
                )}
                <div className="text-xs text-gray-500">
                    <div>파워링크 이미지</div>
                    <div className="truncate w-32">{content.imagePath}</div>
                </div>
            </div>
        );
      case 'IMAGE_SUB_LINKS':
        return (
            <div>
                <div className="font-bold text-sm mb-2 text-gray-700">이미지 서브링크 ({content.images?.length || 0}개)</div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                    {content.images?.map((img: any, i: number) => (
                        <div key={i} className="flex-shrink-0 w-16 text-center">
                            <img src={`https://ssl.pstatic.net/tveta/libs${img.imageUrl}`} className="w-16 h-16 object-cover rounded border mb-1"/>
                            <div className="text-[10px] truncate">{img.linkText}</div>
                        </div>
                    ))}
                </div>
            </div>
        );
      default:
        return (
          <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded break-all">
            {JSON.stringify(content).slice(0, 100)}...
          </div>
        );
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex-shrink-0">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
             <Layers className="w-7 h-7 mr-2 text-indigo-600"/> 확장소재 통합 관리
          </h2>
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

      {selectedCampaignId ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col flex-1 min-h-0">
          <div className="flex border-b overflow-x-auto scrollbar-hide bg-gray-50">
            {dynamicTabs.map(tab => (
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
                  const sampleStatus = group.items[0]?.inspectStatus;

                  return (
                    <div key={group.id} className="bg-white p-4 rounded-xl border border-gray-200 hover:shadow-lg transition-all flex flex-col">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex gap-2">
                          <span className="bg-indigo-50 text-indigo-600 text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-wide">
                            {group.type}
                          </span>
                          {sampleStatus && (
                            <span className={`text-[10px] px-2 py-1 rounded-md font-bold ${sampleStatus === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {sampleStatus}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                          총 {group.items.length}개 그룹 사용
                        </span>
                      </div>

                      <div className="flex-1 mb-4">
                        {renderContent(group)}
                      </div>

                      <div className="border-t pt-2 mt-auto">
                        <button 
                          onClick={() => toggleExpand(group.id)}
                          className="w-full flex justify-between items-center text-xs text-gray-500 hover:bg-gray-50 p-2 rounded transition-colors"
                        >
                          <span>사용 중인 그룹 보기 ({group.groupNames.length})</span>
                          {isExpanded ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                        </button>
                        
                        {isExpanded && (
                          <div className="mt-2 bg-gray-50 rounded p-2 max-h-40 overflow-y-auto border border-gray-100">
                            {group.groupNames.map((name, idx) => (
                              <div key={idx} className="text-xs text-gray-600 py-1 border-b border-gray-100 last:border-0 truncate" title={name}>
                                {name}
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
                <p className="font-medium">이 캠페인에는 해당 유형의 확장소재가 없습니다.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full bg-white rounded-xl border border-gray-200 text-gray-400 shadow-sm flex-1">
          <Layers className="w-16 h-16 mb-4 text-indigo-100"/>
          <p className="text-lg font-bold text-gray-600">관리할 캠페인을 선택해주세요.</p>
        </div>
      )}
    </div>
  );
};